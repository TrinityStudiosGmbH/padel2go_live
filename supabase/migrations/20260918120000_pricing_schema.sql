-- Teil 1/5: Schema. Aendert noch kein Verhalten.
BEGIN;

-- court_prices bekommt eine Sportart und wird zur Tabelle der Standardpreise.
ALTER TABLE public.court_prices
  ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'padel';

ALTER TABLE public.court_prices DROP CONSTRAINT IF EXISTS court_prices_sport_valid;
ALTER TABLE public.court_prices
  ADD CONSTRAINT court_prices_sport_valid CHECK (sport IN ('padel', 'tennis'));

-- Tennis ist nur als 60-Minuten-Buchung moeglich.
ALTER TABLE public.court_prices DROP CONSTRAINT IF EXISTS court_prices_tennis_60_only;
ALTER TABLE public.court_prices
  ADD CONSTRAINT court_prices_tennis_60_only
  CHECK (sport <> 'tennis' OR duration_minutes = 60);

-- Ausnahmen je Standort: eine Zeile je Standort und Sportart.
-- Leeres Feld = der globale Wert gilt. Zeile loeschen = wieder Standard.
CREATE TABLE IF NOT EXISTS public.location_price_exceptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  sport             text NOT NULL DEFAULT 'padel',
  price_60_cents    integer,
  price_90_cents    integer,
  price_120_cents   integer,
  payback_points_60 integer,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_price_exceptions_sport_valid CHECK (sport IN ('padel', 'tennis')),
  CONSTRAINT location_price_exceptions_prices_sane CHECK (
    COALESCE(price_60_cents, 0) >= 0
    AND COALESCE(price_90_cents, 0) >= 0
    AND COALESCE(price_120_cents, 0) >= 0
    AND COALESCE(payback_points_60, 0) >= 0
  ),
  CONSTRAINT location_price_exceptions_tennis_60_only CHECK (
    sport <> 'tennis' OR (price_90_cents IS NULL AND price_120_cents IS NULL)
  ),
  CONSTRAINT location_price_exceptions_unique UNIQUE (location_id, sport)
);

ALTER TABLE public.location_price_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view location price exceptions" ON public.location_price_exceptions;
CREATE POLICY "Anyone can view location price exceptions"
  ON public.location_price_exceptions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage location price exceptions" ON public.location_price_exceptions;
CREATE POLICY "Admins can manage location price exceptions"
  ON public.location_price_exceptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_location_price_exceptions_updated_at ON public.location_price_exceptions;
CREATE TRIGGER update_location_price_exceptions_updated_at
  BEFORE UPDATE ON public.location_price_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Zeitfenster haengen kuenftig am Standort. Die Spalte wird hier nur angelegt
-- und befuellt; ausgewertet wird sie erst mit Teil 2.
ALTER TABLE public.court_pricing_bands
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

UPDATE public.court_pricing_bands b
SET location_id = c.location_id
FROM public.courts c
WHERE b.court_id = c.id AND b.location_id IS NULL;

DROP INDEX IF EXISTS public.court_pricing_bands_lookup_idx;
CREATE INDEX court_pricing_bands_lookup_idx
  ON public.court_pricing_bands (sport, location_id, start_minute)
  WHERE is_active;

COMMIT;
