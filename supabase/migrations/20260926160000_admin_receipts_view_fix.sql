-- ---------------------------------------------------------------------------
-- Belege-Sicht ohne Rekursion
-- ---------------------------------------------------------------------------
-- Mit security_invoker lief die Sicht unter den Zeilenregeln des Aufrufers.
-- Die Regeln von lobby_members verweisen auf lobbies, deren Regeln wieder auf
-- lobby_members — "infinite recursion detected in policy". Die Sicht laeuft
-- jetzt als Eigentuemer (Standard) und bringt ihre Zugriffsregel selbst mit:
-- Admins sehen alles, jeder andere nur seine eigenen Belege.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.admin_receipts;

CREATE VIEW public.admin_receipts AS
SELECT r.*,
  (CASE
     WHEN r.receipt_type LIKE 'booking%'     THEN 'booking'
     WHEN r.receipt_type LIKE 'lobby%'       THEN 'lobby'
     WHEN r.receipt_type LIKE 'marketplace%' THEN 'marketplace'
     WHEN r.receipt_type LIKE 'event%'       THEN 'event'
     ELSE 'other'
   END) AS category,
  (r.receipt_type LIKE '%\_refund') AS is_refund,
  (CASE
     WHEN r.receipt_type LIKE 'booking%' THEN (
       SELECT c.sport FROM public.bookings bk JOIN public.courts c ON c.id = bk.court_id WHERE bk.id = r.source_id)
     WHEN r.receipt_type LIKE 'lobby%' THEN (
       SELECT c.sport FROM public.lobby_members lm
       JOIN public.lobbies l ON l.id = lm.lobby_id
       JOIN public.courts c ON c.id = l.court_id
       WHERE lm.id = r.source_id)
     ELSE NULL
   END) AS sport,
  (CASE
     WHEN r.receipt_type LIKE 'marketplace%' THEN (
       SELECT o.reference_code FROM public.marketplace_redemptions o WHERE o.id = r.source_id)
     ELSE NULL
   END) AS reference_code
FROM public.receipts r
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
   OR (auth.jwt() ->> 'email') = 'fsteinfelder@padel2go.eu'
   OR r.user_id = auth.uid();

REVOKE ALL ON public.admin_receipts FROM PUBLIC, anon;
GRANT SELECT ON public.admin_receipts TO authenticated;
