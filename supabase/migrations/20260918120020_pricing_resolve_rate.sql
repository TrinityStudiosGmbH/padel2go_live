-- Teil 3/5: Preisaufloesung.
-- Reihenfolge: Standort-Band -> Standort-Ausnahme -> globales Band -> Standardpreis.
BEGIN;

-- Baender gelten ab hier ueber location_id. court_id wird nicht mehr gelesen.
UPDATE public.court_pricing_bands SET court_id = NULL WHERE court_id IS NOT NULL;

ALTER TABLE public.court_pricing_bands DROP CONSTRAINT IF EXISTS court_pricing_bands_no_court_scope;
ALTER TABLE public.court_pricing_bands
  ADD CONSTRAINT court_pricing_bands_no_court_scope CHECK (court_id IS NULL);

DROP FUNCTION IF EXISTS public.resolve_booking_rates_batch(uuid, timestamptz[], integer, uuid);
DROP FUNCTION IF EXISTS public.resolve_booking_rate(uuid, timestamptz, integer, uuid, uuid);

CREATE FUNCTION public.resolve_booking_rate(
  p_court_id           uuid,
  p_start              timestamptz,
  p_duration_minutes   integer,
  p_user_id            uuid DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  price_cents            integer,
  payback_points         integer,
  price_band_id          uuid,
  price_band_name        text,
  price_source           text,
  court_sport            text,
  base_price_cents       integer,
  member_club_id         uuid,
  member_scope           text,
  member_discount_cents  integer,
  member_limit_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local    timestamp;
  v_dow      smallint;
  v_minute   smallint;
  v_sport    text;
  v_location uuid;
  v_price    integer := NULL;
  v_price_id uuid    := NULL;
  v_price_nm text    := NULL;
  v_source   text    := NULL;
  v_points   integer := 0;
  v_user     uuid;
  v_role     text;
  v_member   record;
BEGIN
  -- Ein NULL-Court liefert hier keine Zeile, v_sport bleibt NULL. Alle drei
  -- Abbruchgruende enden gleich: kein Preis, keine Punkte.
  SELECT c.sport, c.location_id INTO v_sport, v_location
  FROM public.courts c WHERE c.id = p_court_id;

  IF p_start IS NULL OR p_duration_minutes IS NULL OR v_sport IS NULL
     -- Tennis ist nur 60 Minuten buchbar: KEIN Preis statt stillem Rueckfall.
     OR (v_sport = 'tennis' AND p_duration_minutes <> 60) THEN
    RETURN QUERY SELECT NULL::integer, 0, NULL::uuid, NULL::text, NULL::text,
                        v_sport, NULL::integer, NULL::uuid, NULL::text, 0, NULL::integer;
    RETURN;
  END IF;

  v_local  := p_start AT TIME ZONE 'Europe/Berlin';
  v_dow    := EXTRACT(ISODOW FROM v_local)::smallint;
  v_minute := (EXTRACT(HOUR FROM v_local) * 60 + EXTRACT(MINUTE FROM v_local))::smallint;

  -- (a) Zeitfenster dieses Standorts
  SELECT band_id, band_name, price INTO v_price_id, v_price_nm, v_price
  FROM public.pricing_band_at(v_sport, v_location, false, v_dow, v_minute, p_duration_minutes);
  IF v_price IS NOT NULL THEN v_source := 'location_band'; END IF;

  -- (b) Flache Ausnahme dieses Standorts. Sie schlaegt das globale Band.
  IF v_price IS NULL THEN
    SELECT CASE p_duration_minutes
             WHEN 60 THEN e.price_60_cents
             WHEN 90 THEN e.price_90_cents
             WHEN 120 THEN e.price_120_cents END
      INTO v_price
    FROM public.location_price_exceptions e
    WHERE e.location_id = v_location AND e.sport = v_sport
    LIMIT 1;
    IF v_price IS NOT NULL THEN v_source := 'location_exception'; END IF;
  END IF;

  -- (c) Globales Zeitfenster
  IF v_price IS NULL THEN
    SELECT band_id, band_name, price INTO v_price_id, v_price_nm, v_price
    FROM public.pricing_band_at(v_sport, v_location, true, v_dow, v_minute, p_duration_minutes);
    IF v_price IS NOT NULL THEN v_source := 'global_band'; END IF;
  END IF;

  -- (d) Globaler Standardpreis
  IF v_price IS NULL THEN
    SELECT cp.price_cents INTO v_price
    FROM public.court_prices cp
    WHERE cp.sport = v_sport AND cp.duration_minutes = p_duration_minutes
    LIMIT 1;
    IF v_price IS NOT NULL THEN v_source := 'global_default'; END IF;
  END IF;

  v_points := public.resolve_booking_points(p_court_id, p_duration_minutes);

  -- p_user_id akzeptieren wir nur von der Service-Rolle, sonst koennte ein
  -- Client fremde Vereinsrabatte abfragen.
  v_user := auth.uid();
  v_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  IF p_user_id IS NOT NULL AND (v_role IS NULL OR v_role = 'service_role') THEN
    v_user := p_user_id;
  END IF;

  SELECT * INTO v_member
  FROM public.resolve_member_pricing(
    v_user, p_court_id, p_start, p_duration_minutes, v_price, v_sport, p_exclude_booking_id
  );

  RETURN QUERY SELECT
    COALESCE(v_member.member_price_cents, v_price),
    v_points,
    v_price_id, v_price_nm, v_source,
    v_sport,
    v_price,
    v_member.member_club_id,
    v_member.member_scope,
    COALESCE(v_member.member_discount_cents, 0),
    v_member.member_limit_remaining;
END;
$$;

CREATE FUNCTION public.resolve_booking_rates_batch(
  p_court_id         uuid,
  p_starts           timestamptz[],
  p_duration_minutes integer,
  p_user_id          uuid DEFAULT NULL
)
RETURNS TABLE (
  start_time             timestamptz,
  price_cents            integer,
  payback_points         integer,
  price_band_name        text,
  base_price_cents       integer,
  member_scope           text,
  member_discount_cents  integer,
  member_limit_remaining integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.start_time, r.price_cents, r.payback_points, r.price_band_name,
         r.base_price_cents, r.member_scope, r.member_discount_cents,
         r.member_limit_remaining
  FROM unnest(p_starts) AS s(start_time)
  CROSS JOIN LATERAL public.resolve_booking_rate(
    p_court_id, s.start_time, p_duration_minutes, p_user_id
  ) AS r;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_booking_rate(uuid, timestamptz, integer, uuid, uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_booking_rates_batch(uuid, timestamptz[], integer, uuid)
  TO anon, authenticated, service_role;

COMMIT;
