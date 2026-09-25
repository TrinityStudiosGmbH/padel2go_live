-- ---------------------------------------------------------------------------
-- Grundlage fuer die Ergebnisrechnung (PnL)
-- ---------------------------------------------------------------------------
-- Vier Dinge fehlten, um aus den Belegen ein Ergebnis zu machen:
--   1. Der Einkaufspreis am Produkt — und eingefroren an jeder Bestellung,
--      weil sich Preise aendern, alte Verkaeufe aber nicht.
--   2. Die Stripe-Gebuehr am Beleg. Ohne sie ist die PnL eine Umsatzrechnung.
--   3. Belege fuer Lobby-Anteile und Event-Tickets — Lobby-Anteile waren bis
--      jetzt Geld ohne Beleg.
--   4. Manuelle Posten und Fixkosten, die der Admin selbst pflegt.
-- Dazu get_pnl(), das alles serverseitig zu Zeilen je Zeitscheibe verrechnet.
-- ---------------------------------------------------------------------------

-- ── 1. Einkaufspreis ───────────────────────────────────────────────────────
ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS cost_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.marketplace_redemptions
  ADD COLUMN IF NOT EXISTS unit_cost_cents integer;

UPDATE public.marketplace_redemptions o
SET unit_cost_cents = i.cost_cents
FROM public.marketplace_items i
WHERE i.id = o.item_id AND o.unit_cost_cents IS NULL;

-- ── 2. Stripe-Gebuehr und neue Belegarten ──────────────────────────────────
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS stripe_fee_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_receipt_type_check;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_receipt_type_check CHECK (receipt_type IN (
  'marketplace_order', 'marketplace_refund',
  'booking', 'booking_refund',
  'lobby_share', 'lobby_share_refund',
  'event_ticket', 'event_ticket_refund'
));

-- ── 3. Manuelle Posten und Fixkosten ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pnl_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('income', 'expense')),
  category     text NOT NULL,
  label        text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),   -- netto
  tax_rate     numeric(4,2) NOT NULL DEFAULT 19.00,
  recurrence   text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'monthly', 'quarterly', 'yearly')),
  entry_date   date NOT NULL,     -- Datum, bei Wiederholung der Beginn
  end_date     date,              -- nur bei Wiederholung, offen = laeuft weiter
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pnl_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pnl entries" ON public.pnl_entries;
CREATE POLICY "Admins manage pnl entries" ON public.pnl_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Wiederkehrende Posten in einzelne Termine aufloesen.
CREATE OR REPLACE FUNCTION public.pnl_entry_occurrences(p_from date, p_to date)
RETURNS TABLE(d date, kind text, category text, amount_cents integer, tax_rate numeric, entry_id uuid, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT e.entry_date, e.kind, e.category, e.amount_cents, e.tax_rate, e.id, e.label
  FROM public.pnl_entries e
  WHERE e.recurrence = 'once'
    AND e.entry_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT g.d::date, e.kind, e.category, e.amount_cents, e.tax_rate, e.id, e.label
  FROM public.pnl_entries e
  CROSS JOIN LATERAL generate_series(
    e.entry_date::timestamp,
    LEAST(p_to, COALESCE(e.end_date, p_to))::timestamp,
    (CASE e.recurrence
       WHEN 'monthly'   THEN interval '1 month'
       WHEN 'quarterly' THEN interval '3 months'
       ELSE                  interval '1 year'
     END)
  ) AS g(d)
  WHERE e.recurrence IN ('monthly', 'quarterly', 'yearly')
    AND g.d::date BETWEEN p_from AND p_to;
$fn$;

REVOKE ALL ON FUNCTION public.pnl_entry_occurrences(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pnl_entry_occurrences(date, date) TO authenticated;

-- ── 4. Die Ergebnisrechnung ────────────────────────────────────────────────
-- p_basis 'cash'    = nach Belegdatum (was eingegangen ist)
--         'service' = nach Leistungsdatum (was gespielt / geliefert wurde)
-- p_bucket 'total' | 'day' | 'week' | 'month'
-- Zeilen: income_<kat>, refund_<kat>, cogs, stripe_fee, manual_income:<Kategorie>,
-- manual_expense:<Kategorie>. Erstattungen und Kosten sind negativ.
CREATE OR REPLACE FUNCTION public.get_pnl(
  p_from   date,
  p_to     date,
  p_basis  text DEFAULT 'cash',
  p_bucket text DEFAULT 'total'
)
RETURNS TABLE(bucket_start date, line text, gross_cents bigint, tax_cents bigint, net_cents bigint, item_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $get_pnl$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_is_test  boolean := public.stripe_is_test();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_is_admin := (auth.jwt() ->> 'email') = 'fsteinfelder@padel2go.eu'
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN RETURN; END IF;

  IF p_basis NOT IN ('cash', 'service') THEN
    RAISE EXCEPTION 'p_basis must be cash or service';
  END IF;
  IF p_bucket NOT IN ('total', 'day', 'week', 'month') THEN
    RAISE EXCEPTION 'p_bucket must be total, day, week or month';
  END IF;
  IF p_to < p_from OR p_to - p_from > 1100 THEN
    RAISE EXCEPTION 'Zeitraum ungueltig';
  END IF;

  RETURN QUERY
  WITH belege AS (
    SELECT r.receipt_type, r.source_id, r.paid_cents, r.tax_cents, r.net_cents, r.stripe_fee_cents,
      (CASE WHEN p_basis = 'service'
            THEN COALESCE(r.service_date, (r.issued_at AT TIME ZONE 'Europe/Berlin')::date)
            ELSE (r.issued_at AT TIME ZONE 'Europe/Berlin')::date
       END) AS d
    FROM public.receipts r
    WHERE r.is_test = v_is_test
  ),
  im_zeitraum AS (
    SELECT * FROM belege WHERE d >= p_from AND d <= p_to
  ),
  kategorisiert AS (
    SELECT b.*,
      (CASE
         WHEN b.receipt_type IN ('booking', 'booking_refund') THEN
           'booking_' || COALESCE((
             SELECT c.sport FROM public.bookings bk
             JOIN public.courts c ON c.id = bk.court_id
             WHERE bk.id = b.source_id), 'padel')
         WHEN b.receipt_type IN ('lobby_share', 'lobby_share_refund') THEN 'lobby'
         WHEN b.receipt_type IN ('marketplace_order', 'marketplace_refund') THEN 'marketplace'
         WHEN b.receipt_type IN ('event_ticket', 'event_ticket_refund') THEN 'event'
         ELSE 'other'
       END) AS kategorie,
      (b.receipt_type LIKE '%\_refund') AS ist_erstattung
    FROM im_zeitraum b
  ),
  zeilen AS (
    SELECT k.d,
           (CASE WHEN k.ist_erstattung THEN 'refund_' ELSE 'income_' END) || k.kategorie AS line,
           k.paid_cents::bigint AS gross, k.tax_cents::bigint AS tax, k.net_cents::bigint AS net, 1 AS n
    FROM kategorisiert k
    UNION ALL
    SELECT k.d, 'cogs'::text, 0::bigint, 0::bigint,
           ((CASE WHEN k.ist_erstattung THEN 1 ELSE -1 END) * COALESCE(o.unit_cost_cents, 0) * COALESCE(o.quantity, 1))::bigint,
           1
    FROM kategorisiert k
    JOIN public.marketplace_redemptions o ON o.id = k.source_id
    WHERE k.kategorie = 'marketplace' AND COALESCE(o.unit_cost_cents, 0) > 0
    UNION ALL
    SELECT k.d, 'stripe_fee'::text, (-k.stripe_fee_cents)::bigint, 0::bigint, (-k.stripe_fee_cents)::bigint, 1
    FROM kategorisiert k
    WHERE COALESCE(k.stripe_fee_cents, 0) <> 0
    UNION ALL
    SELECT m.d,
           (CASE WHEN m.kind = 'income' THEN 'manual_income:' ELSE 'manual_expense:' END) || m.category,
           ((CASE WHEN m.kind = 'income' THEN 1 ELSE -1 END) * ROUND(m.amount_cents * (1 + m.tax_rate / 100.0)))::bigint,
           ((CASE WHEN m.kind = 'income' THEN 1 ELSE -1 END) * ROUND(m.amount_cents * m.tax_rate / 100.0))::bigint,
           ((CASE WHEN m.kind = 'income' THEN 1 ELSE -1 END) * m.amount_cents)::bigint,
           1
    FROM public.pnl_entry_occurrences(p_from, p_to) m
  )
  SELECT
    (CASE WHEN p_bucket = 'total' THEN p_from ELSE date_trunc(p_bucket, z.d::timestamp)::date END) AS bucket_start,
    z.line,
    SUM(z.gross)::bigint AS gross_cents,
    SUM(z.tax)::bigint   AS tax_cents,
    SUM(z.net)::bigint   AS net_cents,
    SUM(z.n)::int AS item_count
  FROM zeilen z
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$get_pnl$;

REVOKE ALL ON FUNCTION public.get_pnl(date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pnl(date, date, text, text) TO authenticated;

-- ── 5. Belege mit Zuordnung fuer den Belege-Tab ────────────────────────────
-- security_invoker: die RLS der receipts-Tabelle gilt (Admin alles, Kunde eigene).
CREATE OR REPLACE VIEW public.admin_receipts
WITH (security_invoker = true) AS
SELECT r.*,
  (CASE
     WHEN r.receipt_type LIKE 'booking%'     THEN 'booking'
     WHEN r.receipt_type LIKE 'lobby%'       THEN 'lobby'
     WHEN r.receipt_type LIKE 'marketplace%' THEN 'marketplace'
     WHEN r.receipt_type LIKE 'event%'       THEN 'event'
     ELSE 'other'
   END) AS category,
  (r.receipt_type LIKE '%\_refund') AS is_refund,
  (CASE
     WHEN r.receipt_type LIKE 'booking%' THEN (
       SELECT c.sport FROM public.bookings bk JOIN public.courts c ON c.id = bk.court_id WHERE bk.id = r.source_id)
     WHEN r.receipt_type LIKE 'lobby%' THEN (
       SELECT c.sport FROM public.lobby_members lm
       JOIN public.lobbies l ON l.id = lm.lobby_id
       JOIN public.courts c ON c.id = l.court_id
       WHERE lm.id = r.source_id)
     ELSE NULL
   END) AS sport,
  (CASE
     WHEN r.receipt_type LIKE 'marketplace%' THEN (
       SELECT o.reference_code FROM public.marketplace_redemptions o WHERE o.id = r.source_id)
     ELSE NULL
   END) AS reference_code
FROM public.receipts r;

GRANT SELECT ON public.admin_receipts TO authenticated;

-- ── 6. create_receipt kennt Lobby-Anteile ──────────────────────────────────
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
    (SELECT b.is_test FROM public.lobby_members lm
       JOIN public.lobbies l ON l.id = lm.lobby_id
       JOIN public.bookings b ON b.id = l.booking_id
       WHERE lm.id = p_source_id),
    false);
  IF v_is_test THEN
    v_prefix := 'TEST-';
  ELSE
    v_prefix := 'P2G-';
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
  ELSIF p_receipt_type IN ('lobby_share', 'lobby_share_refund') THEN
    -- Anteil eines Mitspielers: Empfaenger ist der Mitspieler, Leistung der Spieltermin.
    SELECT lm.user_id, l.start_time
    INTO r
    FROM public.lobby_members lm
    JOIN public.lobbies l ON l.id = lm.lobby_id
    WHERE lm.id = p_source_id;
    IF FOUND THEN
      v_user    := COALESCE(v_user, r.user_id);
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
