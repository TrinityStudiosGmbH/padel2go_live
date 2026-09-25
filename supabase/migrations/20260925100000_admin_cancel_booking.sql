-- ---------------------------------------------------------------------------
-- Stornierung durch die Verwaltung
-- ---------------------------------------------------------------------------
-- Admin -> Buchungen setzte den Status bisher mit einer nackten Aenderung auf
-- 'cancelled'. Damit blieb das Geld einbehalten, eingesetzte Punkte kamen nicht
-- zurueck, das Vereins-Freikontingent verfiel, es entstand keine Stornorechnung
-- und der Kunde erfuhr nichts. Und weil Gaeste gar nicht selbst stornieren
-- koennen, war genau dieser Weg der, den die Verwaltung fuer sie benutzt haette.
--
-- cancel_confirmed_booking() taugt dafuer nicht: sie verlangt den Eigentuemer
-- (ein Admin ist ein anderer) und sperrt Stornierungen nach Spielbeginn (ein
-- Kulanzfall ist genau das). Deshalb diese Variante — gleiche Buchhaltung,
-- ohne die beiden Sperren.
--
-- Nur service_role darf sie ausfuehren; die Berechtigungspruefung sitzt in der
-- Edge Function, die sich den Aufrufer ueber sein Anmelde-Token beschafft.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_booking_admin(p_booking_id uuid)
RETURNS TABLE(acted boolean, credits_refunded integer, booking_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  rec record;
  v_credits integer := 0;
BEGIN
  SELECT user_id, status, credits_used
  INTO rec
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    acted := false; credits_refunded := 0; booking_user_id := NULL; RETURN NEXT; RETURN;
  END IF;

  -- Nur eine bestaetigte Buchung wird storniert. Eine bereits stornierte meldet
  -- sich als 'nichts getan' zurueck — der Aufrufer behandelt das als Erfolg.
  IF rec.status <> 'confirmed' THEN
    acted := false; credits_refunded := 0; booking_user_id := rec.user_id; RETURN NEXT; RETURN;
  END IF;

  v_credits := COALESCE(rec.credits_used, 0);

  UPDATE public.bookings
  SET status       = 'cancelled',
      cancelled_at = now(),
      credits_used = 0
  WHERE id = p_booking_id;

  -- Eingesetzte Punkte zurueck aufs Konto des KUNDEN, nicht des Admins.
  -- Eine Gastbuchung hat kein Konto und ueberspringt das.
  IF v_credits > 0 AND rec.user_id IS NOT NULL THEN
    UPDATE public.wallets
    SET reward_credits = reward_credits + v_credits,
        updated_at     = now()
    WHERE user_id = rec.user_id;

    PERFORM public.log_points_ledger(
      rec.user_id, v_credits, 'REVERSAL', 'REWARD',
      'booking_cancel', p_booking_id::text, 'Buchung durch Verwaltung storniert — Points zurückgebucht'
    );
  END IF;

  acted := true;
  credits_refunded := v_credits;
  booking_user_id := rec.user_id;
  RETURN NEXT;
  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_booking_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_admin(uuid) TO service_role;
