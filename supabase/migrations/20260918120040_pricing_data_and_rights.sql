-- Teil 5/5: Preise vereinheitlichen und Rechte umhaengen.
BEGIN;

-- Der haeufigste Preis je Sportart und Dauer wird der globale Standard.
-- Produktiv sind alle 7 bepreisten Courts identisch (24/36/40 EUR), die
-- Zusammenfuehrung ist also verlustfrei. Acht Courts hatten gar keinen Preis
-- und waren an der Kasse nicht buchbar; die bekommen damit erstmals einen.
CREATE TEMP TABLE _global_defaults ON COMMIT DROP AS
WITH tally AS (
  SELECT c.sport, cp.duration_minutes, cp.price_cents, count(*) AS hits
  FROM public.court_prices cp
  JOIN public.courts c ON c.id = cp.court_id
  WHERE cp.court_id IS NOT NULL
    AND (c.sport <> 'tennis' OR cp.duration_minutes = 60)
  GROUP BY 1, 2, 3
)
SELECT DISTINCT ON (sport, duration_minutes) sport, duration_minutes, price_cents
FROM tally
ORDER BY sport, duration_minutes, hits DESC, price_cents ASC;

DELETE FROM public.court_prices;

-- Die alten Eindeutigkeits-Regeln muessen VOR den neuen Zeilen fallen: die
-- bisherige globale Regel steht auf (duration_minutes) allein und wuerde Padel
-- 60 Min und Tennis 60 Min nicht nebeneinander zulassen.
ALTER TABLE public.court_prices DROP CONSTRAINT IF EXISTS court_prices_court_duration_unique;
DROP INDEX IF EXISTS public.court_prices_global_unique;
DROP INDEX IF EXISTS public.court_prices_court_unique;

INSERT INTO public.court_prices (court_id, sport, duration_minutes, price_cents)
SELECT NULL::uuid, sport, duration_minutes, price_cents FROM _global_defaults;

INSERT INTO public.court_prices (court_id, sport, duration_minutes, price_cents)
SELECT NULL::uuid, 'padel', v.d, v.p
FROM (VALUES (60, 2400), (90, 3600), (120, 4000)) AS v(d, p)
WHERE NOT EXISTS (
  SELECT 1 FROM public.court_prices WHERE sport = 'padel' AND duration_minutes = v.d
);

INSERT INTO public.court_prices (court_id, sport, duration_minutes, price_cents)
SELECT NULL::uuid, 'tennis', 60, 2000
WHERE NOT EXISTS (
  SELECT 1 FROM public.court_prices WHERE sport = 'tennis' AND duration_minutes = 60
);

CREATE UNIQUE INDEX court_prices_global_unique
  ON public.court_prices (sport, duration_minutes);

-- Court-Preise sind ab sofort verboten. Die Spalte faellt erst in der
-- Aufraeum-Migration, damit ein Rueckweg bleibt.
ALTER TABLE public.court_prices DROP CONSTRAINT IF EXISTS court_prices_no_court_scope;
ALTER TABLE public.court_prices
  ADD CONSTRAINT court_prices_no_court_scope CHECK (court_id IS NULL);

-- Preise sind nur noch ueber "Preise & Punkte" pflegbar.
DELETE FROM public.admin_page_tables
WHERE page_key = 'courts' AND table_name = 'court_prices';

INSERT INTO public.admin_page_tables (page_key, table_name, access)
VALUES ('pricing', 'location_price_exceptions', 'write')
ON CONFLICT DO NOTHING;

-- "P2G Points" ist in "Preise & Punkte" aufgegangen; die Rechte wandern mit.
INSERT INTO public.admin_page_tables (page_key, table_name, access)
SELECT 'pricing', t.table_name, t.access
FROM public.admin_page_tables t
WHERE t.page_key = 'p2g-points' AND t.table_name <> 'expert_levels_config'
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_role_pages (role_id, page_key)
SELECT rp.role_id, 'pricing'
FROM public.admin_role_pages rp
WHERE rp.page_key = 'p2g-points'
ON CONFLICT DO NOTHING;

DELETE FROM public.admin_role_pages WHERE page_key = 'p2g-points';
DELETE FROM public.admin_page_tables WHERE page_key = 'p2g-points';
DELETE FROM public.admin_pages WHERE key = 'p2g-points';

-- Ohne diesen Aufruf bleiben die RLS-Policies auf dem alten Stand: die neue
-- Ausnahmentabelle haette keine Schreibregel fuer delegierte Preis-Admins, und
-- die Courts-Seite duerfte weiterhin Preise schreiben.
SELECT public.sync_admin_page_policies();

COMMIT;
