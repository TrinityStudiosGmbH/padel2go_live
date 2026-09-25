-- ---------------------------------------------------------------------------
-- Prüfung: Geld, Belege, Stornos
-- ---------------------------------------------------------------------------
-- Liest nur, ändert nichts. Im Supabase SQL-Editor ausführen.
--
-- Jede Zeile ist eine Frage, auf die die Antwort 0 lauten muss. Steht dort eine
-- andere Zahl, ist an dieser Stelle Geld geflossen, ohne dass ein Beleg oder
-- ein Gegenbuchung entstanden ist. Testbestellungen bleiben überall außen vor.
-- ---------------------------------------------------------------------------

WITH
-- 1) Bezahlte Buchung ohne Rechnung.
buchung_ohne_rechnung AS (
  SELECT b.id
  FROM public.bookings b
  JOIN public.payments p ON p.booking_id = b.id AND p.status = 'completed'
  WHERE b.status = 'confirmed'
    AND COALESCE(b.is_test, false) = false
    AND p.amount_total_cents > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.source_id = b.id AND r.receipt_type = 'booking')
),
-- 2) Stornierte Buchung, die eine Rechnung hat, aber keine Stornorechnung.
--    Entsteht, wenn Stripe das Ereignis charge.refunded nicht zustellt.
storno_ohne_gutschrift AS (
  SELECT b.id
  FROM public.bookings b
  WHERE b.status = 'cancelled'
    AND COALESCE(b.is_test, false) = false
    AND EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.source_id = b.id AND r.receipt_type = 'booking')
    AND NOT EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.source_id = b.id AND r.receipt_type = 'booking_refund')
),
-- 3) Bezahlte Bestellung ohne Rechnung.
bestellung_ohne_rechnung AS (
  SELECT o.id
  FROM public.marketplace_redemptions o
  WHERE o.status = 'success'
    AND COALESCE(o.is_test, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.source_id = o.id AND r.receipt_type = 'marketplace_order')
),
-- 4) Erstattete Bestellung ohne Stornorechnung.
erstattung_ohne_gutschrift AS (
  SELECT o.id
  FROM public.marketplace_redemptions o
  WHERE o.status = 'refunded'
    AND COALESCE(o.is_test, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.source_id = o.id AND r.receipt_type = 'marketplace_refund')
),
-- 5) Zahlung abgeschlossen, Buchung aber nicht bestätigt. Das ist der Fall, den
--    reconcile-payments meldet: Geld liegt bei Stripe, der Kunde hat nichts.
zahlung_ohne_buchung AS (
  SELECT p.booking_id
  FROM public.payments p
  JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.status = 'completed'
    AND b.status <> 'confirmed'
    AND COALESCE(b.is_test, false) = false
),
-- 6) Buchung bestätigt, Zahlung aber nie auf abgeschlossen gesetzt. Umgekehrter
--    Fall: der Kunde hat den Platz, die Zahlung steht noch auf offen.
buchung_ohne_zahlung AS (
  SELECT b.id
  FROM public.bookings b
  JOIN public.payments p ON p.booking_id = b.id
  WHERE b.status = 'confirmed'
    AND p.status = 'pending'
    AND COALESCE(b.is_test, false) = false
    AND b.created_at < now() - interval '1 hour'
),
-- 7) Lücke in der Belegnummer. § 146 AO verlangt eine fortlaufende Reihe;
--    eine fehlende Nummer muss erklärbar sein.
nummern AS (
  SELECT
    split_part(receipt_number, '-', 2) AS jahr,
    split_part(receipt_number, '-', 3)::int AS nr
  FROM public.receipts
  WHERE receipt_number ~ '^P2G-[0-9]{4}-[0-9]{6}$'
),
luecken AS (
  SELECT jahr, nr
  FROM (
    SELECT jahr, nr, LAG(nr) OVER (PARTITION BY jahr ORDER BY nr) AS vorher
    FROM nummern
  ) x
  WHERE vorher IS NOT NULL AND nr <> vorher + 1
)

SELECT '1. Bezahlte Buchung ohne Rechnung'        AS pruefung, count(*) AS treffer FROM buchung_ohne_rechnung
UNION ALL SELECT '2. Storno ohne Stornorechnung',          count(*) FROM storno_ohne_gutschrift
UNION ALL SELECT '3. Bezahlte Bestellung ohne Rechnung',   count(*) FROM bestellung_ohne_rechnung
UNION ALL SELECT '4. Erstattung ohne Stornorechnung',      count(*) FROM erstattung_ohne_gutschrift
UNION ALL SELECT '5. Zahlung ohne bestätigte Buchung',     count(*) FROM zahlung_ohne_buchung
UNION ALL SELECT '6. Buchung ohne abgeschlossene Zahlung', count(*) FROM buchung_ohne_zahlung
UNION ALL SELECT '7. Lücke in der Belegnummer',            count(*) FROM luecken
ORDER BY 1;
