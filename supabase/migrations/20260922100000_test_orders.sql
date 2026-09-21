-- ---------------------------------------------------------------------------
-- Testbestellungen: kein Beleg, dafuer loeschbar
-- ---------------------------------------------------------------------------
-- Waehrend der Erprobung entstehen laufend Bestellungen und Buchungen, die
-- keine echten Geschaefte sind. Bisher bekam jede davon einen Beleg mit einer
-- Nummer aus dem lueckenlosen Kreis.
--
-- Der naheliegende Wunsch waere, diese Belege hinterher zu loeschen. Genau das
-- geht nicht: ein lueckenloser Nummernkreis vertraegt keine Luecke, und eine
-- geloeschte Nummer in der Mitte ist schlimmer als ein falscher Beleg. Deshalb
-- der umgekehrte Weg — fuer einen Testvorgang entsteht erst gar kein Beleg.
--
-- Ausloeser ist der Stripe-Schalter im Admin: steht er auf Testbetrieb, wird
-- jede neue Bestellung und Buchung als Test gestempelt. Kein zweiter Schalter,
-- den man vergessen kann, und die Zuordnung bleibt erhalten, auch wenn spaeter
-- auf Echtbetrieb umgestellt wird.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kennzeichnung
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_redemptions
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.marketplace_redemptions.is_test IS
  'Im Stripe-Testbetrieb entstanden. Erzeugt keinen Beleg und ist loeschbar.';

CREATE INDEX IF NOT EXISTS idx_marketplace_redemptions_is_test
  ON public.marketplace_redemptions (is_test) WHERE is_test;

CREATE INDEX IF NOT EXISTS idx_bookings_is_test
  ON public.bookings (is_test) WHERE is_test;

-- ---------------------------------------------------------------------------
-- 2. Steht Stripe auf Testbetrieb?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stripe_is_test()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (config->>'mode') = 'test'
     FROM public.site_integration_configs
     WHERE service = 'stripe'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.stripe_is_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stripe_is_test() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Beim Anlegen stempeln
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_is_test()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_test := public.stripe_is_test();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_is_test ON public.marketplace_redemptions;
CREATE TRIGGER trg_stamp_is_test
  BEFORE INSERT ON public.marketplace_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_is_test();

DROP TRIGGER IF EXISTS trg_stamp_is_test ON public.bookings;
CREATE TRIGGER trg_stamp_is_test
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_is_test();

-- ---------------------------------------------------------------------------
-- 4. Testvorgaenge loeschen — nur diese
-- ---------------------------------------------------------------------------
-- Bewusst eng gefasst: was nicht als Test gestempelt ist, laesst sich hier
-- nicht entfernen. Ein echter Geschaeftsvorfall gehoert storniert, nicht
-- geloescht.
CREATE OR REPLACE FUNCTION public.delete_test_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'email') = 'fsteinfelder@padel2go.eu'
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT id, is_test, user_id, item_id, quantity, play_spent, reward_spent,
         stock_reserved, status
  INTO rec
  FROM public.marketplace_redemptions
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT rec.is_test THEN
    RAISE EXCEPTION 'Nur Testbestellungen koennen geloescht werden';
  END IF;

  -- Falls wider Erwarten doch ein Beleg existiert: stehen lassen und abbrechen.
  -- Eine Belegnummer verschwindet nicht, nur weil die Bestellung ein Test war.
  IF EXISTS (
    SELECT 1 FROM public.receipts
    WHERE source_id = p_order_id
      AND receipt_type IN ('marketplace_order', 'marketplace_refund')
  ) THEN
    RAISE EXCEPTION 'Zu dieser Bestellung existiert ein Beleg — nicht loeschbar';
  END IF;

  -- Punkte und Ware zurueckgeben, sonst bliebe das Guthaben verbraucht.
  IF rec.status = 'pending' THEN
    PERFORM public.release_order_voucher(p_order_id);
  END IF;

  IF rec.user_id IS NOT NULL
     AND (COALESCE(rec.play_spent, 0) > 0 OR COALESCE(rec.reward_spent, 0) > 0) THEN
    UPDATE public.wallets
    SET play_credits   = play_credits + COALESCE(rec.play_spent, 0),
        reward_credits = reward_credits + COALESCE(rec.reward_spent, 0),
        updated_at     = now()
    WHERE user_id = rec.user_id;
  END IF;

  IF COALESCE(rec.stock_reserved, false) THEN
    UPDATE public.marketplace_items
    SET stock_quantity = stock_quantity + COALESCE(rec.quantity, 0),
        updated_at     = now()
    WHERE id = rec.item_id AND stock_quantity IS NOT NULL;
  END IF;

  DELETE FROM public.marketplace_redemptions WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_test_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_test_order(uuid) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. create_receipt ueberspringt Testvorgaenge
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.create_receipt(
  p_receipt_type    TEXT,
  p_source_id       UUID,
  p_user_id         UUID,
  p_recipient_email TEXT,
  p_recipient_name  TEXT,
  p_description     TEXT,
  p_gross_cents     INTEGER,
  p_discount_cents  INTEGER,
  p_paid_cents      INTEGER,
  p_tax_rate        NUMERIC,
  p_address_line1   TEXT DEFAULT NULL,
  p_postal_code     TEXT DEFAULT NULL,
  p_city            TEXT DEFAULT NULL,
  p_service_date    DATE DEFAULT NULL
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_receipt$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_num INTEGER;
  v_tax_cents INTEGER;
  v_rate NUMERIC := COALESCE(p_tax_rate, 19.00);
  v_row public.receipts;
  v_name TEXT := NULLIF(btrim(COALESCE(p_recipient_name, '')), '');
  v_email TEXT := NULLIF(btrim(COALESCE(p_recipient_email, '')), '');
  v_addr TEXT := NULLIF(btrim(COALESCE(p_address_line1, '')), '');
  v_zip TEXT := NULLIF(btrim(COALESCE(p_postal_code, '')), '');
  v_city TEXT := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_country TEXT;
  v_service DATE := p_service_date;
  v_user UUID := p_user_id;
  r RECORD;
BEGIN
  -- Testvorgaenge bekommen keinen Beleg. Der Nummernkreis muss lueckenlos
  -- bleiben, also darf eine Testbestellung gar nicht erst eine Nummer ziehen —
  -- nachtraegliches Loeschen waere genau die Luecke, die nicht entstehen darf.
  IF p_receipt_type IN ('marketplace_order', 'marketplace_refund') THEN
    IF EXISTS (SELECT 1 FROM public.marketplace_redemptions WHERE id = p_source_id AND is_test) THEN
      RETURN NULL;
    END IF;
  ELSIF p_receipt_type IN ('booking', 'booking_refund') THEN
    IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_source_id AND is_test) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Idempotent: ein vorhandener Beleg zu dieser Quelle kommt unveraendert zurueck.
  SELECT * INTO v_row FROM public.receipts
  WHERE receipt_type = p_receipt_type AND source_id = p_source_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Empfaenger aus der Quelle ergaenzen, soweit der Aufrufer nichts mitgab.
  IF p_receipt_type IN ('marketplace_order', 'marketplace_refund') THEN
    SELECT user_id, guest_name, guest_email, shipping_address_line1,
           shipping_postal_code, shipping_city, shipping_country, created_at
    INTO r
    FROM public.marketplace_redemptions WHERE id = p_source_id;
    IF FOUND THEN
      v_user    := COALESCE(v_user, r.user_id);
      v_name    := COALESCE(v_name, NULLIF(btrim(COALESCE(r.guest_name, '')), ''));
      v_email   := COALESCE(v_email, NULLIF(btrim(COALESCE(r.guest_email, '')), ''));
      v_addr    := COALESCE(v_addr, r.shipping_address_line1);
      v_zip     := COALESCE(v_zip, r.shipping_postal_code);
      v_city    := COALESCE(v_city, r.shipping_city);
      v_country := r.shipping_country;
      v_service := COALESCE(v_service, r.created_at::date);
    END IF;
  ELSIF p_receipt_type IN ('booking', 'booking_refund') THEN
    SELECT user_id, guest_name, guest_email, start_time
    INTO r
    FROM public.bookings WHERE id = p_source_id;
    IF FOUND THEN
      v_user    := COALESCE(v_user, r.user_id);
      v_name    := COALESCE(v_name, NULLIF(btrim(COALESCE(r.guest_name, '')), ''));
      v_email   := COALESCE(v_email, NULLIF(btrim(COALESCE(r.guest_email, '')), ''));
      -- Leistungsdatum einer Buchung ist der Spieltermin, nicht der Kaufzeitpunkt.
      v_service := COALESCE(v_service, r.start_time::date);
    END IF;
  END IF;

  -- Immer noch nichts? Dann aus Profil und Konto des angemeldeten Kunden.
  IF v_user IS NOT NULL THEN
    SELECT display_name, shipping_address_line1, shipping_postal_code,
           shipping_city, shipping_country
    INTO r FROM public.profiles WHERE user_id = v_user;
    IF FOUND THEN
      v_name    := COALESCE(v_name, NULLIF(btrim(COALESCE(r.display_name, '')), ''));
      v_addr    := COALESCE(v_addr, r.shipping_address_line1);
      v_zip     := COALESCE(v_zip, r.shipping_postal_code);
      v_city    := COALESCE(v_city, r.shipping_city);
      v_country := COALESCE(v_country, r.shipping_country);
    END IF;
    IF v_email IS NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user;
    END IF;
  END IF;

  INSERT INTO public.receipt_counters (year, last_number)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;

  SELECT last_number + 1 INTO v_num
  FROM public.receipt_counters WHERE year = v_year FOR UPDATE;

  UPDATE public.receipt_counters SET last_number = v_num WHERE year = v_year;

  -- Steuer auf den tatsaechlich gezahlten Betrag (Punkte sind Entgeltminderung).
  -- Erstattungsbelege tragen negative Betraege; ROUND arbeitet symmetrisch.
  v_tax_cents := ROUND(p_paid_cents - (p_paid_cents / (1 + v_rate / 100.0)))::INTEGER;

  INSERT INTO public.receipts (
    receipt_number, receipt_type, source_id, user_id, recipient_email,
    recipient_name, description, gross_cents, discount_cents, paid_cents,
    net_cents, tax_rate, tax_cents,
    recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, service_date
  ) VALUES (
    'P2G-' || v_year || '-' || LPAD(v_num::TEXT, 6, '0'),
    p_receipt_type, p_source_id, v_user, v_email,
    v_name, p_description, p_gross_cents,
    COALESCE(p_discount_cents, 0), p_paid_cents,
    p_paid_cents - v_tax_cents, v_rate, v_tax_cents,
    v_addr, v_zip, v_city, COALESCE(v_country, 'Deutschland'),
    COALESCE(v_service, CURRENT_DATE)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$create_receipt$;

COMMIT;
