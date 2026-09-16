-- Aufraeumen nach 20260917130000_visibility_and_roles.sql:
-- tote Feature-Flags, PIN-Sperre und die entfernten Admin-Seiten
-- (Touchpoint-Slides ohne Konsument, Club-Owner = leeres Legacy-Modell).
-- Erst ausfuehren, wenn die Web-App mit dem neuen Sichtbarkeits-System deployed ist.

ALTER TABLE public.site_settings
  DROP COLUMN IF EXISTS feature_courts_public_updated_at,
  DROP COLUMN IF EXISTS feature_matching_state,
  DROP COLUMN IF EXISTS feature_rewards_state,
  DROP COLUMN IF EXISTS feature_lobbies_enabled,     DROP COLUMN IF EXISTS feature_lobbies_updated_at,
  DROP COLUMN IF EXISTS feature_league_enabled,      DROP COLUMN IF EXISTS feature_league_updated_at,
  DROP COLUMN IF EXISTS feature_events_enabled,      DROP COLUMN IF EXISTS feature_events_updated_at,
  DROP COLUMN IF EXISTS feature_matching_enabled,    DROP COLUMN IF EXISTS feature_matching_updated_at,
  DROP COLUMN IF EXISTS feature_p2g_enabled,         DROP COLUMN IF EXISTS feature_p2g_updated_at,
  DROP COLUMN IF EXISTS feature_marketplace_enabled, DROP COLUMN IF EXISTS feature_marketplace_updated_at,
  DROP COLUMN IF EXISTS feature_rewards_enabled,     DROP COLUMN IF EXISTS feature_rewards_updated_at,
  DROP COLUMN IF EXISTS feature_friends_enabled,     DROP COLUMN IF EXISTS feature_friends_updated_at,
  DROP COLUMN IF EXISTS feature_app_launched,        DROP COLUMN IF EXISTS feature_app_launched_updated_at,
  DROP COLUMN IF EXISTS pin_lock_vereine,            DROP COLUMN IF EXISTS pin_lock_vereine_activated_at,
  DROP COLUMN IF EXISTS pin_lock_partner,            DROP COLUMN IF EXISTS pin_lock_partner_activated_at;

-- Entfernte Admin-Seiten aus dem Rollen-Katalog (Tabellen selbst bleiben).
DELETE FROM public.admin_page_tables WHERE page_key IN ('touchpoint-slides', 'club-owners');
DELETE FROM public.admin_role_pages  WHERE page_key IN ('touchpoint-slides', 'club-owners');
DELETE FROM public.admin_pages       WHERE key      IN ('touchpoint-slides', 'club-owners');

DROP POLICY IF EXISTS "admin_page_touchpoint-slides_write" ON public.partner_touchpoint_slides;
DROP POLICY IF EXISTS "admin_page_club-owners_write" ON public.club_owner_assignments;
DROP POLICY IF EXISTS "admin_page_club-owners_read"  ON public.club_quota_ledger;
DROP POLICY IF EXISTS "admin_page_club-owners_read"  ON public.clubs;
DROP POLICY IF EXISTS "admin_page_club-owners_read"  ON public.courts;
DROP POLICY IF EXISTS "admin_page_club-owners_read"  ON public.profiles;
