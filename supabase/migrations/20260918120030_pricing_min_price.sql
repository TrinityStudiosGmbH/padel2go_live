-- Teil 4/5: "ab X EUR" folgt derselben Reihenfolge wie die Kasse.
BEGIN;

CREATE OR REPLACE FUNCTION public.court_min_price_cents(p_court_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $min_price$
DECLARE
  v_sport     text;
  v_location  uuid;
  v_durations integer[];
  v_duration  integer;
  v_e60       integer;
  v_e90       integer;
  v_e120      integer;
  v_exception integer;
  v_candidate integer;
  v_best      integer := NULL;
BEGIN
  SELECT c.sport, c.location_id INTO v_sport, v_location
  FROM public.courts c WHERE c.id = p_court_id;

  IF v_sport IS NULL THEN RETURN NULL; END IF;

  -- Tennis ist nur 60 Minuten buchbar.
  v_durations := CASE WHEN v_sport = 'tennis' THEN ARRAY[60] ELSE ARRAY[60, 90, 120] END;

  SELECT e.price_60_cents, e.price_90_cents, e.price_120_cents
    INTO v_e60, v_e90, v_e120
  FROM public.location_price_exceptions e
  WHERE e.location_id = v_location AND e.sport = v_sport
  LIMIT 1;

  FOREACH v_duration IN ARRAY v_durations LOOP
    -- (a) Baender dieses Standorts gewinnen dort, wo sie greifen.
    SELECT MIN(CASE v_duration
                 WHEN 60 THEN b.price_cents_60
                 WHEN 90 THEN b.price_cents_90
                 ELSE b.price_cents_120 END)
      INTO v_candidate
    FROM public.court_pricing_bands b
    WHERE b.is_active AND b.sport = v_sport AND b.location_id = v_location;

    IF v_candidate IS NOT NULL AND (v_best IS NULL OR v_candidate < v_best) THEN
      v_best := v_candidate;
    END IF;

    v_exception := CASE v_duration WHEN 60 THEN v_e60 WHEN 90 THEN v_e90 ELSE v_e120 END;

    IF v_exception IS NOT NULL THEN
      -- (b) Die Ausnahme schlaegt globale Baender UND den Standardpreis. Beide
      -- duerfen deshalb nicht mitgerechnet werden, sonst wirbt die Standortkarte
      -- mit einem Preis, den die Kasse nie verlangt.
      IF v_best IS NULL OR v_exception < v_best THEN v_best := v_exception; END IF;
    ELSE
      -- (c) Globale Baender
      SELECT MIN(CASE v_duration
                   WHEN 60 THEN b.price_cents_60
                   WHEN 90 THEN b.price_cents_90
                   ELSE b.price_cents_120 END)
        INTO v_candidate
      FROM public.court_pricing_bands b
      WHERE b.is_active AND b.sport = v_sport AND b.location_id IS NULL;

      IF v_candidate IS NOT NULL AND (v_best IS NULL OR v_candidate < v_best) THEN
        v_best := v_candidate;
      END IF;

      -- (d) Globaler Standardpreis
      SELECT cp.price_cents INTO v_candidate
      FROM public.court_prices cp
      WHERE cp.sport = v_sport AND cp.duration_minutes = v_duration
      LIMIT 1;

      IF v_candidate IS NOT NULL AND (v_best IS NULL OR v_candidate < v_best) THEN
        v_best := v_candidate;
      END IF;
    END IF;
  END LOOP;

  RETURN v_best;
END;
$min_price$;

COMMIT;
