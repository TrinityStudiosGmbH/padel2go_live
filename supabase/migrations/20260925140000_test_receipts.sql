-- ---------------------------------------------------------------------------
-- Testbelege mit eigenem Nummernkreis — und Auswertungen je Betriebsart
-- ---------------------------------------------------------------------------
-- Bisher bekam ein Testvorgang gar keinen Beleg. Damit liess sich der Weg von
-- der Zahlung bis zur Korrekturrechnung im Testbetrieb nicht durchspielen —
-- genau das, was vor dem Start geprueft werden muss.
--
-- Jetzt bekommt ein Testvorgang einen Beleg wie ein echter, nur aus einem
-- eigenen Kreis: TEST-<Jahr>-<nnnnnn>. Der Kreis der echten Belege
-- (P2G-<Jahr>-<nnnnnn>) bleibt davon unberuehrt und damit lueckenlos. Beim
-- Wechsel der Betriebsart (Stripe Test <-> Live) werden alle Testbelege
-- geloescht und der Testzaehler genullt — der Echtbetrieb beginnt also, wie
-- gewuenscht, bei P2G-<Jahr>-000001, und ein spaeterer Testlauf wieder bei
-- TEST-<Jahr>-000001.
--
-- Auswertungen zeigen den Betrieb, in dem man sich befindet: im Testbetrieb
-- Testbuchungen, im Echtbetrieb echte. Das gilt fuer die drei Auslastungs-
-- Funktionen hier und fuer Uebersicht, Analytics und Standort-Auswertung im
-- Frontend (gleicher Schalter: public.stripe_is_test()).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Belege und Zaehler kennen die Betriebsart
-- ---------------------------------------------------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS receipts_is_test_idx
  ON public.receipts (is_test) WHERE is_test;

-- Ein Zaehler je Jahr UND Betriebsart. Der vorhandene Eintrag bleibt der
-- echte (is_test = false); der Testzaehler entsteht beim ersten Testbeleg.
ALTER TABLE public.receipt_counters
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.receipt_counters
  DROP CONSTRAINT IF EXISTS receipt_counters_pkey;

ALTER TABLE public.receipt_counters
  ADD PRIMARY KEY (year, is_test);

-- ---------------------------------------------------------------------------
-- 2. create_receipt: Testvorgaenge bekommen einen Beleg aus dem Testkreis
-- ---------------------------------------------------------------------------
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
  v_is_test BOOLEAN;
  v_prefix TEXT;
BEGIN
  -- Testvorgaenge bekommen einen Beleg wie echte — nur aus einem eigenen
  -- Nummernkreis (TEST-<Jahr>-<nnnnnn>). So laesst sich der ganze Weg bis zur
  -- Korrekturrechnung im Testbetrieb durchspielen, ohne dass der lueckenlose
  -- Kreis der echten Belege je eine Nummer an einen Test verliert. Beim
  -- Wechsel in den Echtbetrieb verschwinden alle Testbelege wieder.
  --
  -- Eine Bestell-ID trifft nur in marketplace_redemptions, eine Buchungs-ID
  -- nur in bookings — COALESCE nimmt den gefundenen Wert.
  v_is_test := COALESCE(
    (SELECT o.is_test FROM public.marketplace_redemptions o WHERE o.id = p_source_id),
    (SELECT b.is_test FROM public.bookings b WHERE b.id = p_source_id),
    false);
  v_prefix := CASE WHEN v_is_test THEN 'TEST-' ELSE 'P2G-' END;

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

  INSERT INTO public.receipt_counters (year, is_test, last_number)
  VALUES (v_year, v_is_test, 0)
  ON CONFLICT (year, is_test) DO NOTHING;

  SELECT last_number + 1 INTO v_num
  FROM public.receipt_counters
  WHERE year = v_year AND is_test = v_is_test
  FOR UPDATE;

  UPDATE public.receipt_counters
  SET last_number = v_num
  WHERE year = v_year AND is_test = v_is_test;

  -- Steuer auf den tatsaechlich gezahlten Betrag (Punkte sind Entgeltminderung).
  -- Erstattungsbelege tragen negative Betraege; ROUND arbeitet symmetrisch.
  v_tax_cents := ROUND(p_paid_cents - (p_paid_cents / (1 + v_rate / 100.0)))::INTEGER;

  INSERT INTO public.receipts (
    receipt_number, receipt_type, source_id, user_id, recipient_email,
    recipient_name, description, gross_cents, discount_cents, paid_cents,
    net_cents, tax_rate, tax_cents,
    recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, service_date, is_test
  ) VALUES (
    v_prefix || v_year || '-' || LPAD(v_num::TEXT, 6, '0'),
    p_receipt_type, p_source_id, v_user, v_email,
    v_name, p_description, p_gross_cents,
    COALESCE(p_discount_cents, 0), p_paid_cents,
    p_paid_cents - v_tax_cents, v_rate, v_tax_cents,
    v_addr, v_zip, v_city, COALESCE(v_country, 'Deutschland'),
    COALESCE(v_service, CURRENT_DATE), v_is_test
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$create_receipt$;

-- ---------------------------------------------------------------------------
-- 3. delete_test_order: Testbelege gehen mit der Testbestellung
-- ---------------------------------------------------------------------------
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

  -- Ein echter Beleg (P2G-Nummer) darf nie verschwinden. Testbelege gehen mit
  -- der Testbestellung — sie haben ihren eigenen Nummernkreis, der Kreis der
  -- echten Belege bleibt davon unberuehrt.
  IF EXISTS (
    SELECT 1 FROM public.receipts
    WHERE source_id = p_order_id
      AND receipt_type IN ('marketplace_order', 'marketplace_refund')
      AND NOT is_test
  ) THEN
    RAISE EXCEPTION 'Zu dieser Bestellung existiert ein echter Beleg — nicht loeschbar';
  END IF;

  DELETE FROM public.receipts
  WHERE source_id = p_order_id
    AND receipt_type IN ('marketplace_order', 'marketplace_refund')
    AND is_test;

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

-- ---------------------------------------------------------------------------
-- 4. Beim Wechsel der Betriebsart verschwinden alle Testbelege
-- ---------------------------------------------------------------------------
-- Haengt an der Konfigurationszeile, die Admin -> Integrationen schreibt.
-- Nur Testbelege, nur bei tatsaechlicher Aenderung der Betriebsart. Der echte
-- Zaehler wird hier nie angefasst — den nullt nichts automatisch.
CREATE OR REPLACE FUNCTION public.purge_test_receipts_on_mode_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old text := COALESCE(OLD.config ->> 'mode', 'live');
  v_new text := COALESCE(NEW.config ->> 'mode', 'live');
BEGIN
  IF NEW.service = 'stripe' AND v_old IS DISTINCT FROM v_new THEN
    DELETE FROM public.receipts WHERE is_test;
    DELETE FROM public.receipt_counters WHERE is_test;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_purge_test_receipts ON public.site_integration_configs;
CREATE TRIGGER trg_purge_test_receipts
  AFTER UPDATE OF config ON public.site_integration_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_test_receipts_on_mode_change();

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. Auslastung zeigt den Betrieb, in dem man sich befindet
-- ---------------------------------------------------------------------------
-- Unveraendert bis auf eine Zeile je Abfrage: b.is_test = public.stripe_is_test().
-- ------------------------------------------------------------
-- Per-court utilization for one month.
-- C1: revenue only for admins. H3: GREATEST guards negative durations.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_court_utilization(
  p_month_start date,
  p_sport       text DEFAULT NULL
)
RETURNS TABLE(
  court_id         uuid,
  court_name       text,
  sport            text,
  location_id      uuid,
  location_name    text,
  location_city    text,
  is_active        boolean,
  is_online        boolean,
  possible_minutes integer,
  booked_minutes   integer,
  bookings_count   integer,
  capacity_pct     numeric,
  revenue_cents    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text := auth.jwt() ->> 'email';
  v_is_admin  boolean;
  v_month     date := date_trunc('month', p_month_start)::date;
  v_month_end date := (date_trunc('month', p_month_start) + interval '1 month')::date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF p_sport IS NOT NULL AND p_sport NOT IN ('padel', 'tennis') THEN
    RAISE EXCEPTION 'p_sport must be padel or tennis';
  END IF;

  v_is_admin := (v_email = 'fsteinfelder@padel2go.eu')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');

  RETURN QUERY
  WITH authorized_courts AS (
    -- Admin: all courts at ONLINE locations (network view)
    SELECT c.id
    FROM public.courts c
    JOIN public.locations l ON l.id = c.location_id
    WHERE v_is_admin AND l.is_online = true
      AND (p_sport IS NULL OR c.sport = p_sport)
    UNION
    -- Manager (new model): assigned courts, regardless of location online state (L1)
    SELECT cca.court_id
    FROM public.club_court_assignments cca
    JOIN public.club_users cu ON cu.club_id = cca.club_id
    WHERE NOT v_is_admin AND cu.user_id = v_uid AND cu.is_active = true
      AND (p_sport IS NULL OR EXISTS (
        SELECT 1 FROM public.courts sc WHERE sc.id = cca.court_id AND sc.sport = p_sport
      ))
    UNION
    -- Manager (legacy model)
    SELECT coa.court_id
    FROM public.club_owner_assignments coa
    WHERE NOT v_is_admin AND coa.user_id = v_uid
      AND (p_sport IS NULL OR EXISTS (
        SELECT 1 FROM public.courts sc WHERE sc.id = coa.court_id AND sc.sport = p_sport
      ))
  ),
  booking_agg AS (
    SELECT
      b.court_id AS c_id,
      COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60, 0)), 0)::int AS booked_minutes,
      COUNT(*)::int AS bookings_count,
      COALESCE(SUM(b.price_cents), 0)::bigint AS revenue_cents
    FROM public.bookings b
    JOIN public.courts bc ON bc.id = b.court_id
    JOIN public.locations bl ON bl.id = bc.location_id
    WHERE b.court_id IN (SELECT id FROM authorized_courts)
      AND b.status IN ('confirmed', 'completed')
      AND b.is_test = public.stripe_is_test()
      AND (b.start_time AT TIME ZONE bl.timezone) >= v_month::timestamp
      AND (b.start_time AT TIME ZONE bl.timezone) <  v_month_end::timestamp
    GROUP BY b.court_id
  )
  SELECT
    c.id,
    c.name,
    c.sport,
    l.id,
    l.name,
    l.city,
    c.is_active,
    l.is_online,
    public.location_open_minutes(l.opening_hours_json, l.is_24_7, v_month) AS possible_minutes,
    COALESCE(ba.booked_minutes, 0) AS booked_minutes,
    COALESCE(ba.bookings_count, 0) AS bookings_count,
    CASE
      WHEN public.location_open_minutes(l.opening_hours_json, l.is_24_7, v_month) > 0
        THEN round(100.0 * COALESCE(ba.booked_minutes, 0)
             / public.location_open_minutes(l.opening_hours_json, l.is_24_7, v_month), 1)
      ELSE 0
    END AS capacity_pct,
    -- C1: revenue is visible to admins only; NULL for club managers
    CASE WHEN v_is_admin THEN COALESCE(ba.revenue_cents, 0) ELSE NULL END AS revenue_cents
  FROM authorized_courts ac
  JOIN public.courts c    ON c.id = ac.id
  JOIN public.locations l ON l.id = c.location_id
  LEFT JOIN booking_agg ba ON ba.c_id = c.id
  ORDER BY l.name, c.name;
END;
$$;

-- ------------------------------------------------------------
-- Per-court monthly trend. H2: bound p_months. H3: GREATEST.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_court_utilization_trend(
  p_court_id uuid,
  p_months   int DEFAULT 6,
  p_sport    text DEFAULT NULL
)
RETURNS TABLE(
  month_start      date,
  possible_minutes integer,
  booked_minutes   integer,
  capacity_pct     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_email      text := auth.jwt() ->> 'email';
  v_is_admin   boolean;
  v_authorized boolean;
  v_tz         text;
  v_oh         jsonb;
  v_24         boolean;
  v_cur_month  date := date_trunc('month', now())::date;
  v_i          int;
  v_m          date;
  v_pm         integer;
  v_bm         integer;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'p_months must be between 1 and 24';
  END IF;

  IF p_sport IS NOT NULL AND p_sport NOT IN ('padel', 'tennis') THEN
    RAISE EXCEPTION 'p_sport must be padel or tennis';
  END IF;

  v_is_admin := (v_email = 'fsteinfelder@padel2go.eu')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');

  IF v_is_admin THEN
    v_authorized := EXISTS (SELECT 1 FROM public.courts WHERE id = p_court_id);
  ELSE
    v_authorized :=
      EXISTS (
        SELECT 1 FROM public.club_court_assignments cca
        JOIN public.club_users cu ON cu.club_id = cca.club_id
        WHERE cca.court_id = p_court_id AND cu.user_id = v_uid AND cu.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.club_owner_assignments coa
        WHERE coa.court_id = p_court_id AND coa.user_id = v_uid
      );
  END IF;

  IF NOT v_authorized THEN RETURN; END IF;

  -- Sport-Filter: ein Court gehoert genau einer Sportart an. Passt sie nicht
  -- zum gewaehlten Scope, gibt es hier nichts anzuzeigen.
  IF p_sport IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.courts sc WHERE sc.id = p_court_id AND sc.sport = p_sport
  ) THEN
    RETURN;
  END IF;

  SELECT l.timezone, l.opening_hours_json, l.is_24_7
    INTO v_tz, v_oh, v_24
  FROM public.courts c
  JOIN public.locations l ON l.id = c.location_id
  WHERE c.id = p_court_id;

  FOR v_i IN REVERSE (p_months - 1)..0 LOOP
    v_m := (v_cur_month - (v_i || ' months')::interval)::date;
    v_pm := public.location_open_minutes(v_oh, v_24, v_m);

    SELECT COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60, 0)), 0)::int
      INTO v_bm
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.status IN ('confirmed', 'completed')
      AND b.is_test = public.stripe_is_test()
      AND (b.start_time AT TIME ZONE v_tz) >= v_m::timestamp
      AND (b.start_time AT TIME ZONE v_tz) <  (v_m + interval '1 month')::timestamp;

    month_start      := v_m;
    possible_minutes := v_pm;
    booked_minutes   := v_bm;
    capacity_pct     := CASE WHEN v_pm > 0 THEN round(100.0 * v_bm / v_pm, 1) ELSE 0 END;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Network-wide monthly trend (admin only). H2: bound p_months. H3: GREATEST.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_network_utilization_trend(
  p_months int  DEFAULT 6,
  p_sport  text DEFAULT NULL
)
RETURNS TABLE(
  month_start      date,
  possible_minutes bigint,
  booked_minutes   bigint,
  capacity_pct     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text := auth.jwt() ->> 'email';
  v_is_admin  boolean;
  v_cur_month date := date_trunc('month', now())::date;
  v_i         int;
  v_m         date;
  v_pm        bigint;
  v_bm        bigint;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'p_months must be between 1 and 24';
  END IF;

  IF p_sport IS NOT NULL AND p_sport NOT IN ('padel', 'tennis') THEN
    RAISE EXCEPTION 'p_sport must be padel or tennis';
  END IF;

  v_is_admin := (v_email = 'fsteinfelder@padel2go.eu')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');

  IF NOT v_is_admin THEN RETURN; END IF;

  FOR v_i IN REVERSE (p_months - 1)..0 LOOP
    v_m := (v_cur_month - (v_i || ' months')::interval)::date;

    SELECT COALESCE(SUM(public.location_open_minutes(l.opening_hours_json, l.is_24_7, v_m)), 0)
      INTO v_pm
    FROM public.courts c
    JOIN public.locations l ON l.id = c.location_id
    WHERE l.is_online = true
      AND (p_sport IS NULL OR c.sport = p_sport);

    SELECT COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60, 0)), 0)::bigint
      INTO v_bm
    FROM public.bookings b
    JOIN public.courts c ON c.id = b.court_id
    JOIN public.locations l ON l.id = c.location_id
    WHERE l.is_online = true
      AND (p_sport IS NULL OR c.sport = p_sport)
      AND b.status IN ('confirmed', 'completed')
      AND b.is_test = public.stripe_is_test()
      AND (b.start_time AT TIME ZONE l.timezone) >= v_m::timestamp
      AND (b.start_time AT TIME ZONE l.timezone) <  (v_m + interval '1 month')::timestamp;

    month_start      := v_m;
    possible_minutes := v_pm;
    booked_minutes   := v_bm;
    capacity_pct     := CASE WHEN v_pm > 0 THEN round(100.0 * v_bm / v_pm, 1) ELSE 0 END;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- CREATE OR REPLACE behaelt die Rechte; der Vollstaendigkeit halber trotzdem.
REVOKE EXECUTE ON FUNCTION public.get_court_utilization(date, text)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_court_utilization_trend(uuid, int, text)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_network_utilization_trend(int, text)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_court_utilization(date, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_court_utilization_trend(uuid, int, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_network_utilization_trend(int, text)       TO authenticated;

