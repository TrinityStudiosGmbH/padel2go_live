-- Sichtbarkeits-System vereinheitlicht + Rollen-Fixes (additiv, keine Loeschungen).
--
-- 1. Buchung wird ein normales 3-Stufen-Feature (feature_booking_state) statt des
--    Booleans feature_courts_public_enabled. Der Boolean bleibt als abgeleiteter Wert
--    fuer die Mobile-App erhalten (Trigger), wird aber nicht mehr direkt gepflegt.
-- 2. Rollen: Storage-Upload fuer delegierte Admin-Rollen, fehlende Tabellen im
--    Seiten-Mapping, Auslastung nicht mehr delegierbar, Features-Seite umbenannt.
-- Das Entfernen toter Spalten/Seiten liegt in 20260917130100_drop_dead_visibility_columns.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Buchung als 3-Stufen-Feature
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS feature_booking_state text NOT NULL DEFAULT 'demo'
    CHECK (feature_booking_state IN ('visible','demo','hidden'));

-- Bisheriger Zustand uebernehmen: Courts oeffentlich -> visible, sonst Admin-Vorschau -> demo.
UPDATE public.site_settings
SET feature_booking_state = CASE WHEN feature_courts_public_enabled THEN 'visible' ELSE 'demo' END
WHERE id = 'global';

-- Abgeleiteter Boolean fuer Alt-Konsumenten (Mobile-App liest feature_courts_public_enabled).
CREATE OR REPLACE FUNCTION public.sync_courts_public_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.feature_courts_public_enabled := (NEW.feature_booking_state = 'visible');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_courts_public_flag ON public.site_settings;
CREATE TRIGGER trg_sync_courts_public_flag
  BEFORE INSERT OR UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_courts_public_flag();

UPDATE public.site_settings SET feature_booking_state = feature_booking_state WHERE id = 'global';

COMMENT ON COLUMN public.site_settings.feature_courts_public_enabled IS
  'Abgeleitet aus feature_booking_state (Trigger). Nur fuer Alt-Konsumenten, nicht direkt setzen.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. Storage: delegierte Admin-Rollen duerfen in den media-Bucket hochladen
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_any_admin_page(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_admin_roles uar
    JOIN public.admin_roles ar ON ar.id = uar.role_id AND ar.is_active
    WHERE uar.user_id = p_user
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_any_admin_page(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_media(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user, 'admin'::app_role) OR public.has_any_admin_page(p_user);
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_media(uuid) TO authenticated, service_role;

-- Bestehende Policies werden ersetzt (gleiche Namen), damit delegierte Rollen mit dabei sind.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can upload media" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update media" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins can delete media" ON storage.objects';
END $$;

CREATE POLICY "Admins can upload media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.can_manage_media(auth.uid()));

CREATE POLICY "Admins can update media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.can_manage_media(auth.uid()));

CREATE POLICY "Admins can delete media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.can_manage_media(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. Seiten-Mapping: fehlende Tabellen, inerte media-Zeilen, Labels
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.admin_page_tables WHERE table_name = 'media';

INSERT INTO public.admin_page_tables (page_key, table_name, access) VALUES
  ('qr-panel',   'qr_sections',            'write'),
  ('marketplace','marketplace_categories', 'write'),
  ('marketplace','marketplace_brands',     'write'),
  ('p2g-points', 'match_analyses',         'read')
ON CONFLICT DO NOTHING;

UPDATE public.admin_page_tables SET access = 'write'
WHERE page_key = 'marketplace' AND table_name = 'marketplace_redemptions';

-- Auslastung: die RPCs pruefen hart auf Voll-Admin/Club -> nicht delegierbar.
UPDATE public.admin_pages SET is_delegatable = false WHERE key = 'utilization';

-- Features-Seite heisst jetzt Sichtbarkeit.
UPDATE public.admin_pages SET label = 'Sichtbarkeit' WHERE key = 'features';

SELECT public.sync_admin_page_policies();
