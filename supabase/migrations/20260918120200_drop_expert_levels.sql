-- ---------------------------------------------------------------------------
-- Expert Levels endgueltig entfernen
-- ---------------------------------------------------------------------------
-- ERST AUSFUEHREN, wenn die neue Web-Version live ist. Bis dahin liefert
-- get_user_level_multiplier() bereits konstant 1.0, die Levels sind also
-- wirkungslos, und dieser Schritt ist jederzeit nachholbar.
-- ---------------------------------------------------------------------------

BEGIN;

DROP FUNCTION IF EXISTS public.get_user_level_multiplier(uuid);
DROP TABLE IF EXISTS public.expert_levels_config;

-- Preise haengen nicht mehr am Court, nur noch am Standort.
ALTER TABLE public.court_prices     DROP COLUMN IF EXISTS court_id;
ALTER TABLE public.court_pricing_bands DROP COLUMN IF EXISTS court_id;

-- Punkte haengen nicht mehr am Zeitfenster, sondern allein an Dauer und Standort.
ALTER TABLE public.court_pricing_bands DROP COLUMN IF EXISTS points_multiplier;

-- Die festen Punkte fuer 90 und 120 Minuten werden aus dem 60-Minuten-Wert
-- berechnet (x1.5 bzw. x2.0) und nicht mehr einzeln gepflegt.
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS payback_points_90min;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS payback_points_120min;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS payback_points_per_hour;

COMMIT;
