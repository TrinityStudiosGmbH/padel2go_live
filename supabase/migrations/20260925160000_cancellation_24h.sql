-- ---------------------------------------------------------------------------
-- Stornoregel: kostenlos bis 24 Stunden vor Spielbeginn
-- ---------------------------------------------------------------------------
-- Bisher konnte der Kunde bis zur letzten Minute vor Spielbeginn stornieren
-- und bekam alles zurueck. Neu: bis 24 Stunden vor Spielbeginn volle
-- Erstattung, danach keine Stornierung mehr. Die Verwaltung (cancel_booking_admin)
-- bleibt davon unberuehrt — sie storniert aus Kulanz jederzeit.
--
-- Dieselbe Zahl steht in supabase/functions/_shared/bookingPolicy.ts und in
-- src/lib/bookingPolicy.ts. Die Datenbank ist die letzte Instanz: selbst wenn
-- Oberflaeche und Edge Function etwas anderes behaupten, geht hier nichts
-- innerhalb der Frist durch.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_confirmed_booking(p_booking_id uuid, p_user_id uuid)
RETURNS TABLE(acted boolean, credits_refunded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cancel_confirmed_booking$
DECLARE
  rec record;
  v_credits integer := 0;
BEGIN
  SELECT user_id, status, start_time, credits_used
  INTO rec
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    acted := false; credits_refunded := 0; RETURN NEXT; RETURN;
  END IF;

  IF rec.user_id IS DISTINCT FROM p_user_id THEN
    acted := false; credits_refunded := 0; RETURN NEXT; RETURN;
  END IF;

  -- Frist: 24 Stunden vor Spielbeginn. Danach ist Schluss.
  IF rec.status != 'confirmed' OR now() >= rec.start_time - interval '24 hours' THEN
    acted := false; credits_refunded := 0; RETURN NEXT; RETURN;
  END IF;

  v_credits := COALESCE(rec.credits_used, 0);

  UPDATE public.bookings
  SET status       = 'cancelled',
      cancelled_at = now(),
      credits_used = 0
  WHERE id = p_booking_id;

  IF v_credits > 0 THEN
    UPDATE public.wallets
    SET reward_credits = reward_credits + v_credits,
        updated_at     = now()
    WHERE user_id = p_user_id;

    PERFORM public.log_points_ledger(
      p_user_id, v_credits, 'REVERSAL', 'REWARD',
      'booking_cancel', p_booking_id::text, 'Buchung storniert — Points zurückgebucht'
    );
  END IF;

  acted := true;
  credits_refunded := v_credits;
  RETURN NEXT;
  RETURN;
END;
$cancel_confirmed_booking$;
