-- ---------------------------------------------------------------------------
-- Aufraeumer fuer haengende Bestellungen und Buchungen
-- ---------------------------------------------------------------------------
-- Der Code verweist an vielen Stellen auf einen minuetlichen Hintergrundlauf,
-- der abgebrochene Bezahlvorgaenge zurueckholt. Die Funktionen dafuer gibt es,
-- aufgerufen wurden sie nie: pg_cron war nicht installiert. Diese Migration
-- schaltet die Erweiterung ein und plant beide Laeufe.
--
-- Zusaetzlich aendert sie das Verhalten im Marketplace: bisher wurde eine
-- Bestellung nach Ablauf der Haltefrist hart storniert. Kuenftig wird nur die
-- WARE freigegeben, die Bestellung bleibt offen und bezahlbar. Genau so macht
-- es ein Shop: kurze Reservierung, langer Warenkorb.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Weiches Auslaufen einer Marketplace-Bestellung
-- ---------------------------------------------------------------------------
-- Gibt Ware und Punkte frei, laesst die Bestellung aber im Status 'pending'
-- stehen. Der Kunde sieht sie weiter unter Konto -> Bestellungen und kann sie
-- nachzahlen; die Kasse legt dann eine frische Stripe-Sitzung dafuer an.
--
-- Die Punkte gehen zurueck aufs Konto und werden auf der Zeile genullt, sonst
-- waere spaeter unklar, ob sie noch reserviert sind. Der offene Betrag steigt
-- damit auf den vollen Preis — wer den Punkterabatt wieder will, kann die
-- Punkte beim naechsten Anlauf erneut einsetzen.
CREATE OR REPLACE FUNCTION public.expire_marketplace_hold(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT user_id, status, item_id, quantity, play_spent, reward_spent,
         stock_reserved, gross_cents
  INTO rec
  FROM public.marketplace_redemptions
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR rec.status <> 'pending' THEN
    RETURN false;
  END IF;

  -- Punkte zurueck aufs Konto.
  IF rec.user_id IS NOT NULL
     AND (COALESCE(rec.play_spent, 0) > 0 OR COALESCE(rec.reward_spent, 0) > 0) THEN
    UPDATE public.wallets
    SET play_credits   = play_credits + COALESCE(rec.play_spent, 0),
        reward_credits = reward_credits + COALESCE(rec.reward_spent, 0),
        updated_at     = now()
    WHERE user_id = rec.user_id;
  END IF;

  -- Ware zurueck ins Lager.
  IF COALESCE(rec.stock_reserved, false) THEN
    UPDATE public.marketplace_items
    SET stock_quantity = stock_quantity + COALESCE(rec.quantity, 0),
        updated_at     = now()
    WHERE id = rec.item_id
      AND stock_quantity IS NOT NULL;
  END IF;

  -- Bestellung bleibt offen, aber ohne Reservierung und ohne Rabatt.
  UPDATE public.marketplace_redemptions
  SET play_spent      = 0,
      reward_spent    = 0,
      discount_cents  = 0,
      amount_cents    = COALESCE(rec.gross_cents, amount_cents),
      stock_reserved  = false,
      hold_expires_at = NULL
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.expire_marketplace_hold(uuid) IS
  'Gibt Ware und Punkte einer abgelaufenen Bestellung frei, laesst sie aber offen und nachzahlbar.';

-- ---------------------------------------------------------------------------
-- 2. Aufraeumer: weich auslaufen statt stornieren
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_marketplace_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
  rec record;
BEGIN
  -- Haltefrist abgelaufen -> Ware und Punkte frei, Bestellung bleibt offen.
  FOR rec IN
    SELECT id
    FROM public.marketplace_redemptions
    WHERE status = 'pending'
      AND hold_expires_at IS NOT NULL
      AND now() > hold_expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.expire_marketplace_hold(rec.id);
    affected := affected + 1;
  END LOOP;

  -- Endgueltige Grenze: eine seit 30 Tagen unbezahlte Bestellung wird
  -- geschlossen, sonst stuende sie dem Kunden ewig im Konto.
  FOR rec IN
    SELECT id
    FROM public.marketplace_redemptions
    WHERE status = 'pending'
      AND created_at < now() - interval '30 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.release_marketplace_order(rec.id);
    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Zeitplan — laeuft ausserhalb der Transaktion
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Vorherige Planungen entfernen, damit ein erneuter Lauf nichts verdoppelt.
SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('p2g-cleanup-bookings', 'p2g-cleanup-marketplace');

-- Buchungen: abgelaufene Reservierungen freigeben, damit der Platz wieder
-- buchbar ist. Jede Minute, weil ein blockierter Court direkt Umsatz kostet.
SELECT cron.schedule(
  'p2g-cleanup-bookings',
  '* * * * *',
  $cron$ SELECT public.cleanup_expired_bookings(); $cron$
);

-- Marketplace: alle zwei Minuten reicht, Ware ist weniger zeitkritisch.
SELECT cron.schedule(
  'p2g-cleanup-marketplace',
  '*/2 * * * *',
  $cron$ SELECT public.cleanup_expired_marketplace_orders(); $cron$
);
