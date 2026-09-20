-- ---------------------------------------------------------------------------
-- Zeitplan aufraeumen: Doppellaeufe raus, liegengebliebene Aufraeumer rein
-- ---------------------------------------------------------------------------
-- Zwei Befunde aus der Skalierungsdurchsicht:
--
-- 1. Doppelte Jobs. Aeltere Migrationen planten 'cleanup-expired-bookings' und
--    'cleanup-expired-marketplace-orders'. Am 19.09. kamen 'p2g-cleanup-bookings'
--    und 'p2g-cleanup-marketplace' dazu, die dieselben Funktionen aufrufen —
--    abgemeldet wurden damals aber nur die eigenen Namen. Laufen die alten
--    noch, macht die Datenbank dieselbe Arbeit zweimal pro Minute. Schaden
--    richtet das keinen (die Funktionen sind idempotent), es kostet nur CPU auf
--    genau der Instanz, die bei Last zuerst eng wird.
--
-- 2. Zwei Aufraeumer ohne Zeitplan. cleanup_rate_limit_log() gibt es seit
--    Dezember, cleanup_expired_notifications() seit Januar — beide wurden nie
--    eingeplant. rate_limit_log waechst damit unbegrenzt, und seit dem
--    20.09. schreibt auch die Gutscheinpruefung hinein.
--
-- Laeuft ausserhalb einer Transaktion: cron.schedule/unschedule vertragen
-- keine Verschachtelung in einen Block, der spaeter zurueckgerollt werden kann.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- 1. Altlasten abmelden — nur, wenn der Nachfolger wirklich existiert
-- ---------------------------------------------------------------------------
-- Ohne diese Bedingung stuende die Plattform ohne Aufraeumer da, falls die
-- p2g-Jobs aus irgendeinem Grund fehlen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'p2g-cleanup-bookings') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-expired-bookings';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'p2g-cleanup-marketplace') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-expired-marketplace-orders';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Die beiden liegengebliebenen Aufraeumer einplanen
-- ---------------------------------------------------------------------------
-- Einmal taeglich reicht: beide loeschen nach Alter, nicht nach Ereignis.
SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('p2g-cleanup-rate-limit', 'p2g-cleanup-notifications');

SELECT cron.schedule(
  'p2g-cleanup-rate-limit',
  '17 3 * * *',
  $cron$ SELECT public.cleanup_rate_limit_log(); $cron$
);

SELECT cron.schedule(
  'p2g-cleanup-notifications',
  '27 3 * * *',
  $cron$ SELECT public.cleanup_expired_notifications(); $cron$
);

-- ---------------------------------------------------------------------------
-- 3. Kontrolle
-- ---------------------------------------------------------------------------
-- Danach sollten genau diese Jobs stehen:
--   p2g-cleanup-bookings        * * * * *
--   p2g-cleanup-marketplace     */2 * * * *
--   p2g-cleanup-rate-limit      17 3 * * *
--   p2g-cleanup-notifications   27 3 * * *
--   trigger-match-reminders     */2 * * * *
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
