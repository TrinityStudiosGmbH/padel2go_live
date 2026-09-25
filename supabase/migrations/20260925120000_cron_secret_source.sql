-- ---------------------------------------------------------------------------
-- Eine Quelle fuer das Cron-Geheimnis — und der Abgleich mit Stripe im Plan
-- ---------------------------------------------------------------------------
-- Drei Funktionen lasen das Geheimnis aus current_setting('app.cron_secret').
-- Dieser Parameter laesst sich auf Supabase nicht setzen: postgres ist dort
-- kein Superuser, ALTER DATABASE ... SET endet mit 42501. current_setting mit
-- missing_ok = true liefert dann NULL — und alle drei Funktionen behandeln NULL
-- als "noch nicht eingerichtet" und kehren still zurueck. Kein Fehler, kein
-- Eintrag, nichts. Die Folgen:
--
--   * notify_push()             — es wurde nie eine Push-Nachricht verschickt.
--   * trigger_match_reminders() — dasselbe; live bereits auf die Tabelle
--                                 umgestellt, im Repo stand noch die alte
--                                 Fassung. Jetzt stimmen beide ueberein.
--
-- Das Geheimnis steht in private.cron_secrets. Die Tabelle liegt ausserhalb von
-- public, ist von anon und authenticated nicht erreichbar und wird nur von
-- SECURITY DEFINER-Funktionen gelesen. Ein vorhandener Wert bleibt unberuehrt.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.cron_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.cron_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cron_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Eine Stelle, an der das Geheimnis gelesen wird, statt dreimal derselbe
-- Ausdruck. Gibt NULL zurueck, wenn nichts hinterlegt ist — die Aufrufer
-- entscheiden selbst, was das bedeutet.
CREATE OR REPLACE FUNCTION private.cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private
AS $fn$
  SELECT value FROM private.cron_secrets WHERE name = 'cron_secret';
$fn$;

REVOKE ALL ON FUNCTION private.cron_secret() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push-Benachrichtigungen
-- ---------------------------------------------------------------------------
-- Unveraendert bis auf die Herkunft des Geheimnisses.
CREATE OR REPLACE FUNCTION public.notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $notify_push$
DECLARE
  v_secret text := private.cron_secret();
  v_opt_in boolean;
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RETURN NEW; -- push not activated yet — in-app notification still works
  END IF;

  -- Marketing pushes are strictly opt-in (§ 7 UWG); transactional ones pass.
  IF NEW.category = 'marketing' THEN
    SELECT push_marketing_opt_in INTO v_opt_in
    FROM public.profiles WHERE user_id = NEW.user_id;
    IF NOT COALESCE(v_opt_in, false) THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://wvvdkuextsbsecqbfksb.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || v_secret
                 ),
      body    := jsonb_build_object(
                   'user_id', NEW.user_id,
                   'title',   NEW.title,
                   'body',    NEW.message,
                   'data',    COALESCE(NEW.metadata, '{}'::jsonb)
                 )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_push failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$notify_push$;

-- ---------------------------------------------------------------------------
-- Match-Erinnerungen — bringt das Repo auf den Stand der Produktion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_match_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_secret text := private.cron_secret();
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'cron_secret nicht hinterlegt — Erinnerungen werden uebersprungen';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://wvvdkuextsbsecqbfksb.supabase.co/functions/v1/send-match-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Abgleich mit Stripe
-- ---------------------------------------------------------------------------
-- Der Webhook ist der einzige Weg, auf dem eine Zahlung zur Buchung wird.
-- Bleibt er aus, liegt das Geld bei Stripe und niemandem faellt es auf. Diese
-- Funktion verbucht nichts — sie schaut nach und meldet per Mail. Alle 30
-- Minuten reicht: die Funktion schaut sechs Stunden zurueck, ein Fund kann also
-- nicht durchrutschen, und jeder Lauf kostet ein paar Stripe-Abfragen.
CREATE OR REPLACE FUNCTION public.trigger_reconcile_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_secret text := private.cron_secret();
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'cron_secret nicht hinterlegt — Abgleich wird uebersprungen';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://wvvdkuextsbsecqbfksb.supabase.co/functions/v1/reconcile-payments',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.trigger_reconcile_payments() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'p2g-reconcile-payments';

SELECT cron.schedule(
  'p2g-reconcile-payments',
  '*/30 * * * *',
  $cron$ SELECT public.trigger_reconcile_payments(); $cron$
);
