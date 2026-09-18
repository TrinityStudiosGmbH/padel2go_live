-- Teil 2/5: Punkte-Funktion, Band-Suche, Level-Faktor abschalten.
BEGIN;

-- Punkte einer Buchung: feste Zahl je 60 Minuten, 90 = x1.5, 120 = x2.0.
-- Standort-Ausnahme schlaegt den globalen Wert. Tennis = 0.
CREATE OR REPLACE FUNCTION public.resolve_booking_points(
  p_court_id         uuid,
  p_duration_minutes integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sport    text;
  v_location uuid;
  v_base     integer;
BEGIN
  IF p_court_id IS NULL OR p_duration_minutes IS NULL THEN
    RETURN 0;
  END IF;

  SELECT c.sport, c.location_id INTO v_sport, v_location
  FROM public.courts c WHERE c.id = p_court_id;

  IF v_sport IS DISTINCT FROM 'padel' THEN
    RETURN 0;
  END IF;

  SELECT e.payback_points_60 INTO v_base
  FROM public.location_price_exceptions e
  WHERE e.location_id = v_location AND e.sport = v_sport
  LIMIT 1;

  IF v_base IS NULL THEN
    SELECT s.payback_points_60min INTO v_base
    FROM public.site_settings s WHERE s.id = 'global';
  END IF;

  v_base := COALESCE(v_base, 100);

  RETURN CASE
    WHEN p_duration_minutes >= 120 THEN ROUND(v_base * 2.0)
    WHEN p_duration_minutes >= 90  THEN ROUND(v_base * 1.5)
    WHEN p_duration_minutes >= 60  THEN v_base
    ELSE 0
  END::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_booking_points(uuid, integer)
  TO anon, authenticated, service_role;

-- Bestes Zeitfenster-Band fuer einen Zeitpunkt und eine Dauer. p_scope_global
-- trennt die globalen Baender von denen eines Standorts; die Reihenfolge ist
-- dieselbe wie frueher: hoehere Prioritaet zuerst, dann frueherer Start.
CREATE OR REPLACE FUNCTION public.pricing_band_at(
  p_sport        text,
  p_location     uuid,
  p_scope_global boolean,
  p_dow          smallint,
  p_minute       smallint,
  p_duration     integer
)
RETURNS TABLE (band_id uuid, band_name text, price integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $band$
  SELECT x.id, x.name, x.price FROM (
    SELECT b.id, b.name, b.priority, b.start_minute,
           CASE p_duration
             WHEN 60 THEN b.price_cents_60
             WHEN 90 THEN b.price_cents_90
             WHEN 120 THEN b.price_cents_120 END AS price
    FROM public.court_pricing_bands b
    WHERE b.is_active AND b.sport = p_sport
      AND (CASE WHEN p_scope_global
                THEN b.location_id IS NULL
                ELSE b.location_id = p_location END)
      AND p_dow = ANY (b.weekdays)
      AND p_minute >= b.start_minute AND p_minute < b.end_minute
  ) x
  WHERE x.price IS NOT NULL
  ORDER BY x.priority DESC, x.start_minute ASC, x.id ASC
  LIMIT 1;
$band$;

GRANT EXECUTE ON FUNCTION public.pricing_band_at(text, uuid, boolean, smallint, smallint, integer)
  TO anon, authenticated, service_role;

-- Expert Levels wirken ab hier nicht mehr auf die Punktevergabe.
CREATE OR REPLACE FUNCTION public.get_user_level_multiplier(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 1.0::numeric $$;

COMMIT;
