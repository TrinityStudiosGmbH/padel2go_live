-- WhatsApp-Gruppe pro Standort: Einladungslink fuer Teaser-Standorte und buchbare Standorte.
ALTER TABLE public.location_teasers
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text;

COMMENT ON COLUMN public.location_teasers.whatsapp_group_url IS
  'Einladungslink zur PADEL2GO-WhatsApp-Gruppe des Standorts (https://chat.whatsapp.com/...)';

COMMENT ON COLUMN public.locations.whatsapp_group_url IS
  'Einladungslink zur PADEL2GO-WhatsApp-Gruppe des Standorts (https://chat.whatsapp.com/...)';
