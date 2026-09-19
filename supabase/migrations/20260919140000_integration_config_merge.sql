-- ---------------------------------------------------------------------------
-- Integrations-Konfiguration zusammenfuehren statt ersetzen
-- ---------------------------------------------------------------------------
-- Bisher schrieb das Admin-Formular die komplette Konfiguration neu. Geheime
-- Werte lassen sich aber nicht zurueck in den Browser laden (sie kommen
-- maskiert an), also fehlten sie beim Speichern und wurden geloescht. Wer nur
-- ein einziges Feld aendern wollte, musste alle anderen Schluessel erneut
-- eintippen — sonst waren sie weg.
--
-- Mit dem Stripe-Moduswechsel und sechs Schluesselfeldern waere das eine
-- ernste Falle: ein Speichern nach dem Eintragen der Sandbox-Schluessel haette
-- die Live-Schluessel mitgenommen.
--
-- merge_integration_config legt nur die uebergebenen Felder ueber die
-- vorhandene Konfiguration. Was nicht im Aufruf steht, bleibt unberuehrt.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_integration_config(
  p_service text,
  p_patch   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    (auth.jwt() ->> 'email') = 'fsteinfelder@padel2go.eu'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  IF p_service IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Ungueltige Eingabe';
  END IF;

  UPDATE public.site_integration_configs
  SET config     = COALESCE(config, '{}'::jsonb) || p_patch,
      updated_at = now()
  WHERE service = p_service;

  IF NOT FOUND THEN
    INSERT INTO public.site_integration_configs (service, config)
    VALUES (p_service, p_patch);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.merge_integration_config(text, jsonb) IS
  'Legt einzelne Felder ueber die Integrations-Konfiguration, ohne die uebrigen zu verlieren.';

REVOKE ALL ON FUNCTION public.merge_integration_config(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_integration_config(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ein Feld gezielt entfernen — fuer den seltenen Fall, dass ein Schluessel weg soll.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_integration_config_key(
  p_service text,
  p_key     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    (auth.jwt() ->> 'email') = 'fsteinfelder@padel2go.eu'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  UPDATE public.site_integration_configs
  SET config     = COALESCE(config, '{}'::jsonb) - p_key,
      updated_at = now()
  WHERE service = p_service;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_integration_config_key(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_integration_config_key(text, text) TO authenticated;

COMMIT;
