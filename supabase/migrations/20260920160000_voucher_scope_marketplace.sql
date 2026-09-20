-- ---------------------------------------------------------------------------
-- Gutscheine auch fuer den Marketplace
-- ---------------------------------------------------------------------------
-- Bisher galt jeder Gutschein fuer Platzbuchungen und nur dafuer:
-- voucher_redemptions.booking_id war Pflicht, user_id ebenfalls. Damit war
-- weder eine Warenbestellung noch ein Gast abbildbar.
--
-- Neu:
--   * voucher_codes.scope  — booking | marketplace | both
--   * voucher_redemptions  — booking_id ODER redemption_id, user_id optional
--
-- Der Geltungsbereich wird beim Anlegen gesetzt. Bestehende Gutscheine sind
-- als Buchungsgutscheine entstanden und bleiben es: 'booking' als Vorgabe
-- waere sonst eine stille Ausweitung auf Waren, die niemand beschlossen hat.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Geltungsbereich am Gutschein
-- ---------------------------------------------------------------------------
ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'booking';

ALTER TABLE public.voucher_codes
  DROP CONSTRAINT IF EXISTS voucher_codes_scope_check;

ALTER TABLE public.voucher_codes
  ADD CONSTRAINT voucher_codes_scope_check
  CHECK (scope IN ('booking', 'marketplace', 'both'));

COMMENT ON COLUMN public.voucher_codes.scope IS
  'Wo der Code gilt: booking (Platzbuchung), marketplace (Ware) oder both.';

-- ---------------------------------------------------------------------------
-- 2. Einloesung: Buchung ODER Bestellung, Gast erlaubt
-- ---------------------------------------------------------------------------
ALTER TABLE public.voucher_redemptions
  ADD COLUMN IF NOT EXISTS redemption_id UUID
    REFERENCES public.marketplace_redemptions (id) ON DELETE SET NULL;

ALTER TABLE public.voucher_redemptions
  ALTER COLUMN booking_id DROP NOT NULL;

-- Gastbesteller haben kein Konto. Die Zeile darf trotzdem entstehen, sonst
-- waere der Verbrauch des Codes nirgends dokumentiert.
ALTER TABLE public.voucher_redemptions
  ALTER COLUMN user_id DROP NOT NULL;

-- Genau eine Quelle. Ohne diese Regel koennte eine Zeile beides oder nichts
-- referenzieren und waere buchhalterisch nicht zuzuordnen.
ALTER TABLE public.voucher_redemptions
  DROP CONSTRAINT IF EXISTS voucher_redemptions_one_source;

ALTER TABLE public.voucher_redemptions
  ADD CONSTRAINT voucher_redemptions_one_source
  CHECK (
    (booking_id IS NOT NULL AND redemption_id IS NULL)
    OR (booking_id IS NULL AND redemption_id IS NOT NULL)
  );

-- Ein Code je Vorgang. Der Code in voucher-redeem prueft das bereits per
-- SELECT, aber eine gleichzeitige zweite Anfrage kaeme daran vorbei.
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_booking_unique
  ON public.voucher_redemptions (booking_id) WHERE booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_order_unique
  ON public.voucher_redemptions (redemption_id) WHERE redemption_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Gutschein an der Bestellung festhalten
-- ---------------------------------------------------------------------------
-- Wie bei den Punkten: der Rabatt muss an der Bestellung stehen, damit
-- Beleg, Erstattung und Wiederaufnahme einer abgebrochenen Zahlung wissen,
-- was gewaehrt wurde.
ALTER TABLE public.marketplace_redemptions
  ADD COLUMN IF NOT EXISTS voucher_id UUID
    REFERENCES public.voucher_codes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_discount_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.marketplace_redemptions.voucher_discount_cents IS
  'Rabatt aus dem Gutschein in Cent. Getrennt von discount_cents (Punkte).';

-- ---------------------------------------------------------------------------
-- 4. Zwei neue Kacheln auf der Startseite
-- ---------------------------------------------------------------------------
-- Die Bento-Kacheln "Marketplace" und "Payback" haben als einzige kein Bild.
INSERT INTO public.site_visuals (key, label, category, description, placeholder_url)
VALUES
  ('home.network.market', 'Network – Marketplace Kachel', 'Homepage',
   'Hintergrundbild der Marketplace-Kachel im Bento-Raster auf der Startseite.', ''),
  ('home.network.payback', 'Network – P2G Points Kachel', 'Homepage',
   'Hintergrundbild der Payback-Kachel (+250 P2G Points) auf der Startseite.', '')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Gutschein-Nutzung freigeben, wenn eine Bestellung verfaellt
-- ---------------------------------------------------------------------------
-- Ohne das verbrennt jeder Abbruch eine Nutzung: die Kasse reserviert sie beim
-- Anlegen der Bestellung, nicht erst bei der Zahlung. Genau wie Punkte und
-- Ware muss sie zurueck, wenn nie bezahlt wurde.
--
-- Beide Wege sind betroffen: release (Storno) und expire_marketplace_hold
-- (Haltefrist abgelaufen, Bestellung bleibt offen). In beiden Faellen gibt es
-- danach keinen Gutschein mehr auf der Bestellung — wer ihn weiter will, gibt
-- ihn beim naechsten Anlauf erneut ein.
CREATE OR REPLACE FUNCTION public.release_order_voucher(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $release_voucher$
DECLARE
  v_voucher uuid;
BEGIN
  SELECT voucher_id INTO v_voucher
  FROM public.marketplace_redemptions
  WHERE id = p_order_id;

  IF v_voucher IS NULL THEN
    RETURN;
  END IF;

  -- Nur zurueckgeben, wenn die Einloesung nicht schon verbucht ist: sonst
  -- wuerde eine spaet zugestellte Zahlung die Nutzung doppelt freigeben.
  IF EXISTS (SELECT 1 FROM public.voucher_redemptions WHERE redemption_id = p_order_id) THEN
    RETURN;
  END IF;

  UPDATE public.voucher_codes
  SET current_uses = GREATEST(0, current_uses - 1)
  WHERE id = v_voucher;

  UPDATE public.marketplace_redemptions
  SET voucher_id = NULL,
      voucher_discount_cents = 0
  WHERE id = p_order_id;
END;
$release_voucher$;

REVOKE ALL ON FUNCTION public.release_order_voucher(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_voucher(uuid) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. Die beiden Ruecknahmewege rufen die Freigabe mit auf
-- ---------------------------------------------------------------------------
-- Unveraenderte Koerper aus 20260702040000 und 20260919120000, ergaenzt um
-- genau eine Zeile: PERFORM public.release_order_voucher(p_order_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.release_marketplace_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $mp_release_order$
DECLARE
  rec record;
BEGIN
  SELECT user_id, status, item_id, quantity, play_spent, reward_spent, stock_reserved
  INTO rec
  FROM public.marketplace_redemptions
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF rec.status != 'pending' THEN
    RETURN false;
  END IF;

  -- Gutschein-Nutzung zurueck, bevor die Bestellung storniert wird.
  PERFORM public.release_order_voucher(p_order_id);

  UPDATE public.marketplace_redemptions
  SET status             = 'cancelled',
      fulfillment_status = 'cancelled'
  WHERE id = p_order_id;

  IF rec.user_id IS NOT NULL
     AND (COALESCE(rec.play_spent, 0) > 0 OR COALESCE(rec.reward_spent, 0) > 0) THEN
    UPDATE public.wallets
    SET play_credits   = play_credits + COALESCE(rec.play_spent, 0),
        reward_credits = reward_credits + COALESCE(rec.reward_spent, 0),
        updated_at     = now()
    WHERE user_id = rec.user_id;
  END IF;

  IF COALESCE(rec.stock_reserved, false) THEN
    UPDATE public.marketplace_items
    SET stock_quantity = stock_quantity + COALESCE(rec.quantity, 0),
        updated_at     = now()
    WHERE id = rec.item_id
      AND stock_quantity IS NOT NULL;
  END IF;

  RETURN true;
END;
$mp_release_order$;

CREATE OR REPLACE FUNCTION public.expire_marketplace_hold(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire_hold$
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

  -- Gutschein-Nutzung zurueck: die Bestellung bleibt offen, aber ohne Rabatt.
  PERFORM public.release_order_voucher(p_order_id);

  IF rec.user_id IS NOT NULL
     AND (COALESCE(rec.play_spent, 0) > 0 OR COALESCE(rec.reward_spent, 0) > 0) THEN
    UPDATE public.wallets
    SET play_credits   = play_credits + COALESCE(rec.play_spent, 0),
        reward_credits = reward_credits + COALESCE(rec.reward_spent, 0),
        updated_at     = now()
    WHERE user_id = rec.user_id;
  END IF;

  IF COALESCE(rec.stock_reserved, false) THEN
    UPDATE public.marketplace_items
    SET stock_quantity = stock_quantity + COALESCE(rec.quantity, 0),
        updated_at     = now()
    WHERE id = rec.item_id
      AND stock_quantity IS NOT NULL;
  END IF;

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
$expire_hold$;

COMMIT;
