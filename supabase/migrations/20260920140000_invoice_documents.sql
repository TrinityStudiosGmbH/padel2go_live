-- ---------------------------------------------------------------------------
-- Rechnungen: Absenderdaten, Empfaengerdaten, Zugriffstoken
-- ---------------------------------------------------------------------------
-- Belege gibt es seit Juli (lueckenlose Nummer, Netto/Steuer getrennt), aber
-- kein Dokument und keinen Weg fuer den Kunden. Fuer eine Rechnung nach
-- § 14 UStG fehlen drei Dinge:
--
--   1. Der Absender. Firmenname und Anschrift stehen als Text in Impressum.tsx,
--      eine USt-IdNr. existiert im Projekt ueberhaupt nicht.
--   2. Der Empfaenger. recipient_name und recipient_email sind auf ALLEN
--      bisherigen Belegen null — sie wurden nur aus guest_name/guest_email
--      gefuellt, und die sind bei eingeloggten Kunden leer. Eine Anschrift gab
--      es nie.
--   3. Ein Zugang fuer Gastbesteller, die kein Konto haben.
--
-- Kleinbetragsrechnung (§ 33 UStDV): bis 250 EUR brutto darf die Anschrift des
-- Empfaengers fehlen. Das deckt praktisch jede Platzbuchung ab. Das Dokument
-- entscheidet das selbst anhand des Betrags.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Absender: die eigenen Firmendaten, gepflegt im Admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_profile (
  id                 TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  company_name       TEXT NOT NULL DEFAULT '',
  address_line1      TEXT NOT NULL DEFAULT '',
  postal_code        TEXT NOT NULL DEFAULT '',
  city               TEXT NOT NULL DEFAULT '',
  country            TEXT NOT NULL DEFAULT 'Deutschland',
  vat_id             TEXT NOT NULL DEFAULT '',   -- USt-IdNr.
  tax_number         TEXT NOT NULL DEFAULT '',   -- Steuernummer
  register_court     TEXT NOT NULL DEFAULT '',   -- Registergericht
  register_number    TEXT NOT NULL DEFAULT '',   -- HRB
  managing_directors TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  website            TEXT NOT NULL DEFAULT '',
  bank_name          TEXT NOT NULL DEFAULT '',
  iban               TEXT NOT NULL DEFAULT '',
  bic                TEXT NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.billing_profile IS
  'Absenderangaben fuer Rechnungen. Eine Zeile, id = global.';

-- Aus dem Impressum vorbelegt, USt-IdNr. der OpCo ergaenzt. Aenderbar im
-- Admin unter Einstellungen -> Rechnungsangaben.
INSERT INTO public.billing_profile (
  id, company_name, address_line1, postal_code, city, country, vat_id,
  managing_directors, email, phone, website
) VALUES (
  'global', 'PADEL2GO OpCo UG (haftungsbeschränkt)', 'Am Neudeck 12', '81541', 'München',
  'Deutschland', 'DE464441826', 'Florian Steinfelder, David Klemm', 'contact@padel2go.eu',
  '+49 176 32350759', 'www.padel2go-official.com'
) ON CONFLICT (id) DO NOTHING;

-- Falls die Zeile bei einem erneuten Lauf schon steht: USt-IdNr. nachtragen,
-- aber eine im Admin gesetzte nicht ueberschreiben.
UPDATE public.billing_profile
SET vat_id = 'DE464441826'
WHERE id = 'global' AND btrim(COALESCE(vat_id, '')) = '';

ALTER TABLE public.billing_profile ENABLE ROW LEVEL SECURITY;

-- Lesen darf jeder Angemeldete: es sind Pflichtangaben, die ohnehin im
-- Impressum stehen. Aendern nur Admins.
DROP POLICY IF EXISTS "Anyone signed in can read billing profile" ON public.billing_profile;
CREATE POLICY "Anyone signed in can read billing profile" ON public.billing_profile
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage billing profile" ON public.billing_profile;
CREATE POLICY "Admins manage billing profile" ON public.billing_profile
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Empfaengeranschrift und Leistungsdatum am Beleg einfrieren
-- ---------------------------------------------------------------------------
-- Eingefroren, nicht nachgeschlagen: die Rechnung zeigt die Anschrift vom Tag
-- der Ausstellung, auch wenn der Kunde sein Profil spaeter aendert.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS recipient_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS recipient_postal_code   TEXT,
  ADD COLUMN IF NOT EXISTS recipient_city          TEXT,
  ADD COLUMN IF NOT EXISTS recipient_country       TEXT,
  ADD COLUMN IF NOT EXISTS service_date            DATE,
  ADD COLUMN IF NOT EXISTS access_token            TEXT;

-- Zugang fuer Gaeste ohne Konto: ein langes Zufallstoken im Mail-Link. Kein
-- HMAC, kein Ablauf-Jonglieren — ein Wert, der sich notfalls einzeln loeschen
-- laesst. Zwei UUIDs ohne Bindestriche = 64 Hexzeichen, ohne pgcrypto.
UPDATE public.receipts
SET access_token = replace(gen_random_uuid()::text, '-', '')
                || replace(gen_random_uuid()::text, '-', '')
WHERE access_token IS NULL;

ALTER TABLE public.receipts
  ALTER COLUMN access_token SET DEFAULT
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

ALTER TABLE public.receipts ALTER COLUMN access_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_access_token_unique
  ON public.receipts (access_token);

-- ---------------------------------------------------------------------------
-- 3. create_receipt loest den Empfaenger selbst auf
-- ---------------------------------------------------------------------------
-- Bisher musste jeder Aufrufer Name und Mail mitgeben — und gab sie nur fuer
-- Gaeste mit, weshalb jeder Beleg eines eingeloggten Kunden ohne Empfaenger
-- dasteht. Die Zuordnung gehoert hierher, an die eine Stelle, die den Beleg
-- schreibt. Uebergebene Werte gewinnen weiterhin, fehlende werden ergaenzt.
--
-- Signatur bleibt aufwaertskompatibel: die vier neuen Parameter haben
-- Vorgabewerte, bestehende Aufrufe mit zehn benannten Parametern laufen weiter.
DROP FUNCTION IF EXISTS public.create_receipt(TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC);

CREATE FUNCTION public.create_receipt(
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

REVOKE ALL ON FUNCTION public.create_receipt(TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_receipt(TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT, DATE) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Die bestehenden Belege nachziehen
-- ---------------------------------------------------------------------------
-- Fuenf Belege aus den Probekaeufen stehen ohne Empfaenger da. Dieselbe Logik
-- wie oben, nur nachtraeglich.
UPDATE public.receipts rc
SET recipient_name          = COALESCE(rc.recipient_name, NULLIF(btrim(COALESCE(o.guest_name, '')), ''), NULLIF(btrim(COALESCE(p.display_name, '')), '')),
    recipient_email         = COALESCE(rc.recipient_email, NULLIF(btrim(COALESCE(o.guest_email, '')), ''), u.email),
    recipient_address_line1 = COALESCE(rc.recipient_address_line1, o.shipping_address_line1, p.shipping_address_line1),
    recipient_postal_code   = COALESCE(rc.recipient_postal_code, o.shipping_postal_code, p.shipping_postal_code),
    recipient_city          = COALESCE(rc.recipient_city, o.shipping_city, p.shipping_city),
    recipient_country       = COALESCE(rc.recipient_country, o.shipping_country, p.shipping_country, 'Deutschland'),
    user_id                 = COALESCE(rc.user_id, o.user_id),
    service_date            = COALESCE(rc.service_date, o.created_at::date)
FROM public.marketplace_redemptions o
LEFT JOIN public.profiles p ON p.user_id = o.user_id
LEFT JOIN auth.users u ON u.id = o.user_id
WHERE rc.source_id = o.id
  AND rc.receipt_type IN ('marketplace_order', 'marketplace_refund');

UPDATE public.receipts rc
SET recipient_name          = COALESCE(rc.recipient_name, NULLIF(btrim(COALESCE(b.guest_name, '')), ''), NULLIF(btrim(COALESCE(p.display_name, '')), '')),
    recipient_email         = COALESCE(rc.recipient_email, NULLIF(btrim(COALESCE(b.guest_email, '')), ''), u.email),
    recipient_address_line1 = COALESCE(rc.recipient_address_line1, p.shipping_address_line1),
    recipient_postal_code   = COALESCE(rc.recipient_postal_code, p.shipping_postal_code),
    recipient_city          = COALESCE(rc.recipient_city, p.shipping_city),
    recipient_country       = COALESCE(rc.recipient_country, p.shipping_country, 'Deutschland'),
    user_id                 = COALESCE(rc.user_id, b.user_id),
    service_date            = COALESCE(rc.service_date, b.start_time::date)
FROM public.bookings b
LEFT JOIN public.profiles p ON p.user_id = b.user_id
LEFT JOIN auth.users u ON u.id = b.user_id
WHERE rc.source_id = b.id
  AND rc.receipt_type IN ('booking', 'booking_refund');

COMMIT;
