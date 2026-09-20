import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@4.0.0";
import { resolveResendKey, DEFAULT_FROM, INTERNAL_INBOX, brandedEmailHtml } from "../_shared/email.ts";
import { bookingDescription } from "../_shared/receiptText.ts";
import { resolveWebhookSecrets } from "../_shared/stripe.ts";

// Stripe webhooks are server-to-server, minimal CORS needed
const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Untrusted values (guest/shipping/profile/email/reference/item fields) must never be
// interpolated raw into the internal HTML fulfillment/alert emails — this neutralizes HTML/
// content injection while leaving the value itself unchanged for safe input.
const escapeHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Beide Signatur-Geheimnisse, das des aktiven Modus zuerst. Waehrend einer
    // Umstellung kann Stripe noch ein Ereignis aus dem anderen Modus
    // nachliefern; das darf nicht als ungueltige Signatur abprallen.
    const { secrets: webhookSecrets, keyFor } = await resolveWebhookSecrets(supabaseAdmin);
    if (webhookSecrets.length === 0) {
      throw new Error("Kein Stripe-Webhook-Geheimnis hinterlegt (Admin → Integrationen → Stripe)");
    }

    let stripe = new Stripe(keyFor[webhookSecrets[0].mode] || keyFor.live || keyFor.test, {
      apiVersion: "2025-08-27.basil",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No Stripe signature found");

    const body = await req.text();
    let event!: Stripe.Event;
    let verifiedMode: "live" | "test" | null = null;

    for (const candidate of webhookSecrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, candidate.secret);
        verifiedMode = candidate.mode;
        break;
      } catch { /* naechstes Geheimnis probieren */ }
    }

    if (!verifiedMode) {
      logStep("Webhook signature verification failed");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Folgeaufrufe (Erstattungen etc.) muessen im selben Modus laufen wie das
    // Ereignis, sonst kennt Stripe die Zahlung nicht.
    if (keyFor[verifiedMode]) {
      stripe = new Stripe(keyFor[verifiedMode], { apiVersion: "2025-08-27.basil" });
    }
    logStep("Event verified", { type: event.type, id: event.id, mode: verifiedMode });

    // Native PaymentSheet (Apple Pay / saved cards, see create-payment-intent) settles
    // through the SAME code path as hosted checkout: normalize the succeeded intent into a
    // Checkout-Session-shaped object. Guarded by metadata.flow so intents created BY a
    // checkout session (which already fire checkout.session.completed) are never touched —
    // no double settlement.
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.flow !== "native_sheet") {
        logStep("payment_intent.succeeded ignored (not a native-sheet intent)", { intentId: pi.id });
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      logStep("Native-sheet intent — normalizing to session shape", { intentId: pi.id, amount: pi.amount });
      event = {
        ...event,
        type: "checkout.session.completed",
        data: {
          object: {
            id: pi.id,
            object: "checkout.session",
            mode: "payment",
            payment_status: "paid",
            status: "complete",
            amount_total: pi.amount,
            currency: pi.currency,
            customer: pi.customer,
            customer_email: pi.receipt_email,
            customer_details: { email: pi.receipt_email },
            payment_intent: pi.id,
            metadata: pi.metadata,
          } as unknown as Stripe.Checkout.Session,
        },
      } as Stripe.Event;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id;
        const paymentType = session.metadata?.type;

        logStep("Processing completed checkout", {
          sessionId: session.id,
          bookingId,
          paymentType,
          paymentStatus: session.payment_status
        });

        if (session.payment_status === "paid") {
          // ============================================
          // MARKETPLACE PURCHASE (money +/- points)
          // ============================================
          if (paymentType === "marketplace_purchase") {
            const redemptionId = session.metadata?.redemption_id;
            if (!redemptionId) {
              logStep("Marketplace session missing redemption_id", { sessionId: session.id });
              break;
            }

            // Idempotent settle: flips pending -> success exactly once. A duplicate
            // webhook (or an order a sibling expired/cron already cancelled) returns
            // false, so we never re-ledger or re-ship.
            const { data: settled, error: settleError } = await supabaseAdmin.rpc("settle_marketplace_order", {
              p_order_id: redemptionId,
            });
            if (settleError) {
              // Return non-2xx so Stripe RETRIES this PAID event. A `break` here returns 200,
              // Stripe treats the event as delivered and stops retrying, and the still-pending
              // order is then cron-cancelled + points-refunded + restocked at hold_expires_at —
              // a single transient DB error would guarantee a paid-for-nothing order. Retrying
              // lets a later attempt still settle it before the cron reclaims it.
              logStep("CRITICAL: paid marketplace order settle failed — returning 500 so Stripe retries", { redemptionId, error: settleError.message });
              return new Response(JSON.stringify({ error: "marketplace_settle_failed" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            if (settled !== true) {
              // settle returned false for one of two very different reasons:
              //  1) benign duplicate — the order is already 'success' (re-delivered webhook).
              //  2) paid-for-nothing — the cron backstop / expiry already released this order
              //     (status 'cancelled', or the row is gone) before this delayed webhook landed,
              //     so the points were refunded + stock restored while Stripe still holds the
              //     card money. This must NEVER be silently skipped: refund the customer's card
              //     and alert an admin to reconcile.
              const { data: releasedOrder, error: reReadError } = await supabaseAdmin
                .from("marketplace_redemptions")
                .select("status, reference_code")
                .eq("id", redemptionId)
                .maybeSingle();

              if (reReadError) {
                // A failed re-read cannot distinguish a shipped duplicate ('success') from a
                // genuinely released order. Refunding on that guess would refund an already-
                // fulfilled order, so return 500 and let Stripe retry (mirrors settleError).
                logStep("CRITICAL: marketplace order status re-read failed — returning 500 so Stripe retries", { redemptionId, error: reReadError.message });
                return new Response(JSON.stringify({ error: "marketplace_reread_failed" }), {
                  status: 500,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              if (releasedOrder?.status === "success") {
                // Not a blind skip: the first delivery's fulfillment side-effects (ledger +
                // physical-ship email) may have failed transiently AFTER settle committed, so
                // fall through to the idempotent fulfillment block below. It no-ops if the work
                // already landed and otherwise finishes it (Stripe keeps retrying via 500).
                logStep("Marketplace order already settled — verifying fulfillment", { redemptionId });
              } else {
                // Genuinely released: the cron backstop / expiry already cancelled this order
                // (status 'cancelled', or the row is gone) while Stripe still holds the card
                // money. Refund the customer + alert an admin (points/stock already reversed).
                logStep("CRITICAL: paid marketplace order was already released — refunding customer", {
                  redemptionId,
                  status: releasedOrder?.status ?? "missing",
                });

              const paymentIntentId = typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id;
              let refundOk = false;
              if (paymentIntentId) {
                try {
                  // Schluessel am ZAHLUNGSVORGANG, nicht an der Bestellung. Eine
                  // Wiederholung desselben Webhooks erzeugt damit weiterhin keine
                  // zweite Erstattung. Ein bestellungsweiter Schluessel waere aber
                  // falsch: zahlt jemand versehentlich zweimal auf dieselbe
                  // Bestellung, muessen BEIDE Vorgaenge einzeln erstattbar sein —
                  // sonst haette Stripe die zweite Erstattung als Dublette
                  // verworfen und das Geld waere beim Kunden nie angekommen.
                  await stripe.refunds.create(
                    { payment_intent: paymentIntentId },
                    { idempotencyKey: `mp_refund_${paymentIntentId}` },
                  );
                  refundOk = true;
                  logStep("Marketplace: auto-refund issued for released paid order", { redemptionId, paymentIntentId });
                } catch (refundErr) {
                  // Return 500 so Stripe re-delivers and retries the refund (mp_refund idempotency
                  // key makes the retry double-safe) rather than silently relying on a manual alert.
                  logStep("CRITICAL: auto-refund failed for released paid order — returning 500 so Stripe retries", { redemptionId, paymentIntentId, error: (refundErr as Error).message });
                  return new Response(JSON.stringify({ error: "marketplace_refund_failed" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
              }

              try {
                const resendApiKey = await resolveResendKey(supabaseAdmin);
                if (resendApiKey) {
                  const resend = new Resend(resendApiKey);
                  await resend.emails.send({
                    from: DEFAULT_FROM,
                    to: [INTERNAL_INBOX],
                    subject: `KRITISCH: Bezahlte Marketplace-Bestellung storniert - ${releasedOrder?.reference_code ?? redemptionId}`,
                    html: brandedEmailHtml({
                      internal: true,
                      title: "KRITISCH: Bezahlte Marketplace-Bestellung storniert",
                      emoji: "🚨",
                      heading: "Bezahlte Bestellung wurde storniert",
                      intro: "Eine per Karte bezahlte Marketplace-Bestellung wurde storniert, bevor der Zahlungs-Webhook eintraf. Punkte und Bestand wurden bereits zurückgebucht.",
                      rows: [
                        { label: "Referenz", value: String(releasedOrder?.reference_code ?? redemptionId) },
                        { label: "Bestell-ID", value: redemptionId },
                        { label: "Status", value: String(releasedOrder?.status ?? "nicht gefunden") },
                        { label: "Stripe Session", value: session.id },
                        { label: "Bezahlt", value: `${((session.amount_total ?? 0) / 100).toFixed(2).replace(".", ",")} €` },
                      ],
                      highlight: { label: "Automatische Rückerstattung", value: refundOk ? "ausgelöst" : "FEHLGESCHLAGEN" },
                      note: refundOk ? "Keine weitere Aktion nötig." : "Bitte manuell in Stripe prüfen und erstatten.",
                    }),
                  });
                  logStep("Marketplace: critical release alert emailed", { redemptionId });
                } else {
                  logStep("Marketplace: RESEND_API_KEY not configured — critical release alert not emailed", { redemptionId });
                }
              } catch (alertErr) {
                logStep("Marketplace: critical release alert email failed", { redemptionId, error: (alertErr as Error).message });
              }
                break;
              }
            } else {
              logStep("Marketplace order settled", { redemptionId });
            }

            const { data: order, error: orderReadError } = await supabaseAdmin
              .from("marketplace_redemptions")
              .select("user_id, item_id, quantity, play_spent, reward_spent, amount_cents, reference_code, guest_email, guest_name, shipping_address_line1, shipping_postal_code, shipping_city, shipping_country, fulfillment_notified_at, voucher_id")
              .eq("id", redemptionId)
              .single();

            if (orderReadError || !order) {
              // The order row drives the ledger + the physical-ship email. A discarded re-read
              // error here (after settle already committed status='success') would skip the
              // fulfillment email yet still return 200, so Stripe never retries and a paid
              // physical order is never shipped. Return 500 so Stripe re-delivers this event.
              logStep("CRITICAL: settled marketplace order re-read failed — returning 500 so Stripe retries", { redemptionId, error: orderReadError?.message });
              return new Response(JSON.stringify({ error: "marketplace_fulfillment_reread_failed" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            let item: { name: string; category: string; partner_name: string | null; product_type: string } | null = null;
            if (order?.item_id) {
              const { data: itemRow } = await supabaseAdmin
                .from("marketplace_items")
                .select("name, category, partner_name, product_type")
                .eq("id", order.item_id)
                .single();
              item = itemRow as typeof item;
            }

            // Gutschein-Einloesung dokumentieren. Die Nutzung wurde schon beim
            // Checkout reserviert; hier wird festgehalten, wofuer. Eindeutiger
            // Index auf redemption_id macht eine erneute Zustellung harmlos.
            if (settled === true && (order as { voucher_id?: string }).voucher_id) {
              const { error: vrError } = await supabaseAdmin.from("voucher_redemptions").insert({
                voucher_id: (order as { voucher_id?: string }).voucher_id,
                redemption_id: redemptionId,
                user_id: order.user_id ?? null,
              });
              if (vrError && !/duplicate|unique/i.test(vrError.message)) {
                logStep("Gutschein-Einloesung nicht protokolliert", { redemptionId, error: vrError.message });
              }
            }

            // GoBD: sequential receipt for the settled order (idempotent per source).
            // Snapshot columns are read in a SEPARATE query so a pending migration
            // can never break the settle/fulfillment path (fallback: amount only).
            if (settled === true) {
              let grossCents = order.amount_cents ?? 0;
              let discountCents = 0;
              let taxRate = 19;
              const { data: snapshot } = await supabaseAdmin
                .from("marketplace_redemptions")
                .select("gross_cents, discount_cents, tax_rate")
                .eq("id", redemptionId)
                .maybeSingle();
              if (snapshot) {
                grossCents = (snapshot as any).gross_cents ?? grossCents;
                discountCents = (snapshot as any).discount_cents ?? 0;
                taxRate = Number((snapshot as any).tax_rate ?? 19);
              }
              const { error: receiptError } = await supabaseAdmin.rpc("create_receipt", {
                p_receipt_type: "marketplace_order",
                p_source_id: redemptionId,
                p_user_id: order.user_id ?? null,
                p_recipient_email: order.guest_email ?? null,
                p_recipient_name: order.guest_name ?? null,
                p_description: `${item?.name ?? "Artikel"} × ${order.quantity ?? 1} (${order.reference_code ?? redemptionId})`,
                p_gross_cents: grossCents,
                p_discount_cents: discountCents,
                p_paid_cents: order.amount_cents ?? 0,
                p_tax_rate: taxRate,
              });
              if (receiptError) logStep("Marketplace: receipt creation failed", { redemptionId, error: receiptError.message });
            }

            // Finalize the points spend in the ledger. The wallet was already debited at
            // checkout by reserve_points; this records the movement (mirrors the free path).
            // Gated on the settle-winner (settled === true) so a concurrent duplicate delivery
            // that fell through on status='success' cannot double-insert the REDEMPTION row;
            // the existence check below is defense-in-depth.
            const pointsSpent = (order.play_spent ?? 0) + (order.reward_spent ?? 0);
            const ledgerSourceId = order.reference_code ?? redemptionId;
            if (settled === true && order.user_id && pointsSpent > 0) {
              const { data: existingLedger } = await supabaseAdmin
                .from("points_ledger")
                .select("id")
                .eq("source_id", ledgerSourceId)
                .eq("entry_type", "REDEMPTION")
                .limit(1);
              if (!existingLedger || existingLedger.length === 0) {
                const { data: postWallet } = await supabaseAdmin
                  .from("wallets")
                  .select("play_credits, reward_credits")
                  .eq("user_id", order.user_id)
                  .single();
                const balanceAfter = (postWallet?.play_credits ?? 0) + (postWallet?.reward_credits ?? 0);
                const { error: ledgerError } = await supabaseAdmin.from("points_ledger").insert({
                  user_id: order.user_id,
                  credit_type: "REWARD",
                  delta_points: -pointsSpent,
                  balance_after: balanceAfter,
                  entry_type: "REDEMPTION",
                  description: `Marketplace: ${item?.name ?? "Artikel"}`,
                  source_type: "REDEMPTION",
                  source_id: ledgerSourceId,
                });
                if (ledgerError) logStep("Marketplace: ledger insert failed", { redemptionId, error: ledgerError.message });
              }
            }

            // Fulfillment email for physical products (mirrors the checkout free path). This is
            // the ONLY ship signal, so it must survive transient failures: it is gated on
            // fulfillment_notified_at (set only after a successful send) and a send failure
            // returns 500 so Stripe re-delivers and this block retries until it lands.
            // Atomically CLAIM the fulfillment notification (flip fulfillment_notified_at from
            // NULL to now) so two concurrent duplicate webhook deliveries cannot both email the
            // admin. Sent for EVERY product type (admin order alert); for physical products it
            // doubles as the ship signal. Only the instance that wins the flip sends; the claim
            // is released back to NULL if the send cannot complete, so it still retries.
            let fulfillmentClaimed = false;
            if (!order.fulfillment_notified_at) {
              const { data: notifyClaim } = await supabaseAdmin
                .from("marketplace_redemptions")
                .update({ fulfillment_notified_at: new Date().toISOString() })
                .eq("id", redemptionId)
                .is("fulfillment_notified_at", null)
                .select("id");
              fulfillmentClaimed = !!(notifyClaim && notifyClaim.length > 0);
            }
            if (fulfillmentClaimed) {
              const resendApiKey = await resolveResendKey(supabaseAdmin);
              if (!resendApiKey) {
                logStep("Marketplace: RESEND_API_KEY not configured — fulfillment email not sent, order stays in admin queue", { redemptionId });
                // Release the claim so a later delivery re-sends once the key is configured.
                await supabaseAdmin
                  .from("marketplace_redemptions")
                  .update({ fulfillment_notified_at: null })
                  .eq("id", redemptionId);
              } else {
                try {
                  let customerName = order?.guest_name || "Gast";
                  if (order?.user_id) {
                    const { data: profile } = await supabaseAdmin
                      .from("profiles")
                      .select("display_name, username")
                      .eq("user_id", order.user_id)
                      .single();
                    customerName = profile?.display_name || profile?.username || "Unbekannt";
                  }
                  const customerEmail = session.customer_details?.email || session.customer_email || order?.guest_email || "";
                  const formattedAddress = item?.product_type === "purchase"
                    ? `${order?.shipping_address_line1 ?? ""}\n${order?.shipping_postal_code ?? ""} ${order?.shipping_city ?? ""}\n${order?.shipping_country ?? "Deutschland"}`
                    : "— (kein Versand nötig)";
                  // `item` kommt aus einem untypisierten Select (never) — lokal typisieren.
                  const itemInfo = item as { name?: string; category?: string } | null;
                  const resend = new Resend(resendApiKey);
                  await resend.emails.send({
                    from: DEFAULT_FROM,
                    to: [INTERNAL_INBOX],
                    subject: `Neue Marketplace-Bestellung: ${item.name} - ${order?.reference_code ?? redemptionId}`,
                    html: brandedEmailHtml({
                      internal: true,
                      title: `Neue Marketplace-Bestellung: ${itemInfo?.name ?? "Artikel"}`,
                      preheader: `${order?.reference_code ?? redemptionId} · ${customerName}`,
                      emoji: "🛍️",
                      heading: "Neue Marketplace-Bestellung",
                      intro: "Eine bezahlte Bestellung wartet auf Bearbeitung.",
                      rowsTitle: "Bestelldetails",
                      rows: [
                        { label: "Referenz", value: String(order?.reference_code ?? redemptionId) },
                        { label: "Produkt", value: itemInfo?.name ?? "Artikel" },
                        { label: "Kategorie", value: itemInfo?.category ?? "-" },
                        { label: "Menge", value: String(order?.quantity ?? 1) },
                        { label: "Bezahlt mit Punkten", value: String(pointsSpent) },
                        { label: "Bezahlt bar", value: `${((order?.amount_cents ?? session.amount_total ?? 0) / 100).toFixed(2).replace(".", ",")} €` },
                        { label: "Kunde", value: customerName },
                        { label: "E-Mail", value: customerEmail },
                        { label: "Lieferadresse", value: formattedAddress.replace(/\n/g, ", ") },
                      ],
                      ctaLabel: "Bestellung im Admin öffnen",
                      ctaUrl: "https://www.padel2go-official.de/admin/marketplace",
                    }),
                  });
                  logStep("Marketplace: fulfillment email sent", { redemptionId });
                } catch (emailError) {
                  // Release the claim so the next Stripe delivery re-sends (this send did not land).
                  await supabaseAdmin
                    .from("marketplace_redemptions")
                    .update({ fulfillment_notified_at: null })
                    .eq("id", redemptionId);
                  logStep("CRITICAL: marketplace fulfillment email failed — returning 500 so Stripe retries", { redemptionId, error: (emailError as Error).message });
                  return new Response(JSON.stringify({ error: "marketplace_fulfillment_email_failed" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
              }
            }

            // Fire-and-forget customer order-confirmation. Idempotent inside the function
            // (customer_confirmation_sent_at claim), so a retried webhook never double-mails;
            // a failure here never blocks settlement.
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-marketplace-confirmation`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({ order_id: redemptionId }),
              });
              logStep("Marketplace: customer confirmation triggered", { redemptionId });
            } catch (confErr) {
              logStep("Marketplace: customer confirmation trigger failed", { redemptionId, error: (confErr as Error).message });
            }
          }
          // ============================================
          // LOBBY JOIN PAYMENT
          // ============================================
          else if (paymentType === "lobby_join") {
            const lobbyId = session.metadata?.lobby_id;
            const lobbyMemberId = session.metadata?.lobby_member_id;
            const userId = session.metadata?.user_id;

            logStep("Processing lobby join payment", { lobbyId, lobbyMemberId, userId });

            if (lobbyMemberId) {
              // Idempotency check: skip if already processed
              const { data: currentMember } = await supabaseAdmin
                .from("lobby_members")
                .select("status")
                .eq("id", lobbyMemberId)
                .single();

              if (currentMember?.status === "paid") {
                logStep("Lobby member already paid — duplicate webhook ignored", { lobbyMemberId });
                break;
              }

              // Update member to paid
              const { error: memberError } = await supabaseAdmin
                .from("lobby_members")
                .update({
                  status: "paid",
                  paid_at: new Date().toISOString(),
                  payment_intent_id: session.payment_intent as string,
                })
                .eq("id", lobbyMemberId);

              if (memberError) {
                logStep("Failed to update lobby member", { error: memberError.message });
              } else {
                logStep("Lobby member marked as paid", { lobbyMemberId });

                // Create lobby event
                await supabaseAdmin.from("lobby_events").insert({
                  lobby_id: lobbyId,
                  actor_id: userId,
                  event_type: "member_paid",
                  metadata: { member_id: lobbyMemberId, amount: session.amount_total },
                });

                // Check if lobby is now full
                const { data: lobby } = await supabaseAdmin
                  .from("lobbies")
                  .select("capacity, host_user_id")
                  .eq("id", lobbyId)
                  .single();

                const { data: paidMembers } = await supabaseAdmin
                  .from("lobby_members")
                  .select("id")
                  .eq("lobby_id", lobbyId)
                  .eq("status", "paid");

                const paidCount = paidMembers?.length || 0;
                
                if (lobby && paidCount >= lobby.capacity) {
                  await supabaseAdmin
                    .from("lobbies")
                    .update({ status: "full" })
                    .eq("id", lobbyId);

                  await supabaseAdmin.from("lobby_events").insert({
                    lobby_id: lobbyId,
                    event_type: "lobby_full",
                    metadata: { paid_count: paidCount },
                  });

                  logStep("Lobby marked as full", { lobbyId, paidCount });
                }

                // Notify host and other paid members
                const { data: otherMembers } = await supabaseAdmin
                  .from("lobby_members")
                  .select("user_id")
                  .eq("lobby_id", lobbyId)
                  .eq("status", "paid")
                  .neq("user_id", userId);

                const { data: userProfile } = await supabaseAdmin
                  .from("profiles")
                  .select("display_name")
                  .eq("user_id", userId)
                  .single();

                const notifyIds = [
                  lobby?.host_user_id,
                  ...(otherMembers || []).map((m: any) => m.user_id)
                ].filter((id, i, arr) => id && id !== userId && arr.indexOf(id) === i);

                for (const notifyId of notifyIds) {
                  await supabaseAdmin.from("notifications").insert({
                    user_id: notifyId,
                    type: "lobby_member_paid",
                    title: "Spieler hat bezahlt",
                    message: `${userProfile?.display_name || 'Ein Spieler'} hat seinen Anteil bezahlt.`,
                    entity_type: "lobby",
                    entity_id: lobbyId,
                    cta_url: `/lobbies/${lobbyId}`,
                  });
                }

                // If lobby is full, notify everyone
                if (lobby && paidCount >= lobby.capacity) {
                  const allMemberIds = [...notifyIds, userId].filter((id, i, arr) => arr.indexOf(id) === i);
                  for (const memberId of allMemberIds) {
                    await supabaseAdmin.from("notifications").insert({
                      user_id: memberId,
                      type: "lobby_full",
                      title: "Lobby vollständig!",
                      message: "Alle Spieler haben bezahlt. Viel Spaß beim Spiel!",
                      entity_type: "lobby",
                      entity_id: lobbyId,
                      cta_url: `/lobbies/${lobbyId}`,
                    });
                  }
                }
              }
            }
          }
          // Handle regular booking payment
          else if (bookingId) {
            // Atomically settle: confirm the booking + finalize credits_used from the
            // LOCKED reserved_credits, only if it is still pending_payment. Returns
            // false for a duplicate (already-confirmed) webhook OR a booking a sibling
            // expired session already cancelled — in both cases we must NOT confirm or
            // award, which would leak credits (reserves already refunded on cancel).
            // Exactly one caller ever wins the settle, so the award below can't double-run.
            const { data: settled, error: settleError } = await supabaseAdmin.rpc("settle_booking_reserves", {
              p_booking_id: bookingId,
            });

            if (settleError) {
              logStep("CRITICAL: paid booking could not be settled", { bookingId, error: settleError.message });
              break;
            }
            if (settled !== true) {
              // settle returned false for one of two very different reasons:
              //  1) benign duplicate — the booking is already 'confirmed' (re-delivered webhook).
              //  2) paid-for-nothing — a sibling expired session / cron backstop already cancelled
              //     this booking (status 'cancelled'/'expired', or the row is gone) before this
              //     delayed webhook landed, so the reserves were already refunded while Stripe
              //     still holds the card money. This must NEVER be silently skipped: refund the
              //     customer's card and alert an admin to reconcile.
              const { data: releasedBooking, error: reReadError } = await supabaseAdmin
                .from("bookings")
                .select("status")
                .eq("id", bookingId)
                .maybeSingle();

              if (reReadError) {
                // A failed re-read cannot distinguish a confirmed duplicate from a genuinely
                // cancelled booking. Refunding on that guess would refund an already-confirmed
                // booking, so return 500 and let Stripe retry (mirrors settleError handling).
                logStep("CRITICAL: booking status re-read failed — returning 500 so Stripe retries", { bookingId, error: reReadError.message });
                return new Response(JSON.stringify({ error: "booking_reread_failed" }), {
                  status: 500,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              if (releasedBooking?.status === "confirmed") {
                // Benign duplicate: the first delivery already confirmed + awarded. No-op.
                logStep("Booking already settled — duplicate webhook ignored", { bookingId });
                break;
              }

              // A non-'confirmed' status is NOT proof of a paid-for-nothing release. A booking
              // that an earlier delivery already confirmed + paid + awarded, and the user then
              // CANCELLED (MyBookings, governed by the AGB policy — no refund <24h before start),
              // is now 'cancelled' with the card money lawfully kept. Its payment row stays
              // 'completed' (the cancel flow never touches payments). Re-read the payment for this
              // session: only a payment that never completed (still 'pending'/'failed') is a
              // genuine paid-for-nothing release this webhook must refund. If it already
              // completed (or was already refunded), do NOT auto-refund — that would claw back
              // money the business is entitled to keep.
              const { data: paymentRow, error: paymentReadError } = await supabaseAdmin
                .from("payments")
                .select("status")
                .eq("stripe_checkout_session_id", session.id)
                .maybeSingle();

              if (paymentReadError) {
                // Can't tell a completed-then-cancelled booking from a never-completed one.
                // Refunding on that guess could claw back money the business lawfully holds,
                // so return 500 and let Stripe retry (mirrors settleError / status re-read).
                logStep("CRITICAL: payment status re-read failed — returning 500 so Stripe retries", { bookingId, error: paymentReadError.message });
                return new Response(JSON.stringify({ error: "payment_reread_failed" }), {
                  status: 500,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              if (paymentRow?.status === "completed" || paymentRow?.status === "refunded") {
                // The booking was already confirmed + paid (and credits awarded) by an earlier
                // delivery; any later cancellation is a post-confirmation user cancel governed by
                // the AGB refund policy, not a paid-for-nothing release. Do NOT auto-refund.
                logStep("Booking already confirmed+paid — later cancellation handled by cancel flow, no auto-refund", {
                  bookingId,
                  bookingStatus: releasedBooking?.status ?? "missing",
                  paymentStatus: paymentRow?.status,
                });
                break;
              }

              // Genuinely released: the payment never completed and a sibling expired session /
              // cron backstop already cancelled this booking (status 'cancelled'/'expired', or the
              // row is gone) while Stripe still holds the card money. Refund the customer + alert
              // an admin (reserves already reversed on cancel).
              logStep("CRITICAL: paid booking was already cancelled — refunding customer", {
                bookingId,
                status: releasedBooking?.status ?? "missing",
              });

              const paymentIntentId = typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id;
              let refundOk = false;
              if (paymentIntentId) {
                try {
                  // Schluessel am ZAHLUNGSVORGANG, nicht an der Buchung — siehe
                  // die gleiche Stelle im Marketplace-Zweig. Zahlt jemand
                  // versehentlich zweimal auf dieselbe Buchung, muss jede Zahlung
                  // einzeln erstattbar bleiben.
                  await stripe.refunds.create(
                    { payment_intent: paymentIntentId },
                    { idempotencyKey: `bk_refund_${paymentIntentId}` },
                  );
                  refundOk = true;
                  logStep("Booking: auto-refund issued for cancelled paid booking", { bookingId, paymentIntentId });
                } catch (refundErr) {
                  // Do NOT mark the payment refunded or return 200 on a failed refund — that would
                  // silently strand the customer's money with a falsified DB state. Return 500 so
                  // Stripe re-delivers; the bk_refund idempotency key makes the retry double-safe.
                  logStep("CRITICAL: auto-refund failed for cancelled paid booking — returning 500 so Stripe retries", { bookingId, paymentIntentId, error: (refundErr as Error).message });
                  return new Response(JSON.stringify({ error: "booking_refund_failed" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
              }

              // Mark the payment row refunded ONLY when the refund actually succeeded, so the DB
              // never falsely reads 'refunded'. A missing payment_intent (cannot auto-refund) falls
              // through to the manual-intervention alert below without falsifying the payment state.
              if (refundOk) {
                const { error: paymentRefundError } = await supabaseAdmin
                  .from("payments")
                  .update({ status: "refunded" })
                  .eq("stripe_checkout_session_id", session.id);
                if (paymentRefundError) logStep("Booking: failed to mark payment refunded", { bookingId, error: paymentRefundError.message });
              }

              try {
                const resendApiKey = await resolveResendKey(supabaseAdmin);
                if (resendApiKey) {
                  const resend = new Resend(resendApiKey);
                  await resend.emails.send({
                    from: DEFAULT_FROM,
                    to: [INTERNAL_INBOX],
                    subject: `KRITISCH: Bezahlte Buchung storniert - ${bookingId}`,
                    html: brandedEmailHtml({
                      internal: true,
                      title: "KRITISCH: Bezahlte Buchung storniert",
                      emoji: "🚨",
                      heading: "Bezahlte Buchung wurde storniert",
                      intro: "Eine per Karte bezahlte Buchung wurde storniert, bevor der Zahlungs-Webhook eintraf. Die reservierten Credits wurden bereits zurückgebucht.",
                      rows: [
                        { label: "Buchungs-ID", value: bookingId },
                        { label: "Status", value: String(releasedBooking?.status ?? "nicht gefunden") },
                        { label: "Stripe Session", value: session.id },
                        { label: "Bezahlt", value: `${((session.amount_total ?? 0) / 100).toFixed(2).replace(".", ",")} €` },
                      ],
                      highlight: { label: "Automatische Rückerstattung", value: refundOk ? "ausgelöst" : "FEHLGESCHLAGEN" },
                      note: refundOk ? "Keine weitere Aktion nötig." : "Bitte manuell in Stripe prüfen und erstatten.",
                    }),
                  });
                  logStep("Booking: critical release alert emailed", { bookingId });
                } else {
                  logStep("Booking: RESEND_API_KEY not configured — critical release alert not emailed", { bookingId });
                }
              } catch (alertErr) {
                logStep("Booking: critical release alert email failed", { bookingId, error: (alertErr as Error).message });
              }
              break;
            }
            logStep("Booking confirmed", { bookingId });

            const isGuestWebhook = session.metadata?.is_guest === "1";
            const guestEmail = session.metadata?.guest_email;
            const guestName = session.metadata?.guest_name;

            // ── Award play credits for this booking (authenticated users only) ─
            if (!isGuestWebhook) try {
              const { data: bk } = await supabaseAdmin
                .from("bookings")
                .select("court_id, start_time, end_time, user_id, status, play_credits_awarded")
                .eq("id", bookingId)
                .single();

              // Punkte gibt es nur fuer tatsaechlich gezahltes Geld. amount_total ist der
              // Endbetrag nach Gutschein und nach eingeloesten Punkten — deckt ein Gutschein
              // alles ab oder ist es eine Freistunde, steht hier 0 und es gibt keine Punkte.
              const amountPaidCents = Number(session.amount_total ?? 0) || 0;

              // Nie auf einer stornierten Buchung vergeben — nach dem Storno-Clawback steht
              // play_credits_awarded wieder auf 0, ein verspaeteter Webhook-Retry darf das
              // Payback dann nicht erneut gutschreiben.
              if (bk && bk.play_credits_awarded === 0 && bk.user_id && amountPaidCents > 0 && (bk as any).status !== "cancelled") {
                // ── P2G Payback = feste Punktzahl je Dauer ──
                // 60 Minuten = Grundwert, 90 = x1.5, 120 = x2.0. Der Grundwert steht global
                // in site_settings und kann je Standort ueberschrieben werden. Die Datenbank
                // ist die einzige Quelle, damit Checkout-Vorschau und Gutschrift nie
                // auseinanderlaufen. Tennis liefert dort 0.
                const durationMin = Math.round(
                  (new Date(bk.end_time).getTime() - new Date(bk.start_time).getTime()) / 60000,
                );

                let creditsToAward = 0;
                const { data: pointsData, error: pointsError } = await supabaseAdmin.rpc(
                  "resolve_booking_points",
                  { p_court_id: (bk as any).court_id, p_duration_minutes: durationMin },
                );
                if (pointsError) {
                  // Lieber keine Punkte als falsche — der Clawback rechnet auf dieser Spalte.
                  logStep("Payback: points lookup failed — awarding none", { bookingId, error: pointsError.message });
                } else {
                  creditsToAward = Number(pointsData ?? 0) || 0;
                }

                if (creditsToAward > 0) {
                  // Gutschrift + play_credits_awarded in EINER Transaktion unter Row-Lock.
                  // Vorher lief erst die Wallet-Gutschrift und danach das UPDATE: schlug
                  // das UPDATE fehl, schrieb ein Stripe-Retry ERNEUT gut, und der
                  // Storno-Clawback konnte es nie zurueckholen (er liest genau die Spalte).
                  // Die RPC verweigert ausserdem Tennis, Gaeste, Stornos und Doppelvergabe.
                  const { data: awardedRaw, error: awardError } = await supabaseAdmin.rpc(
                    "award_booking_payback",
                    { p_booking_id: bookingId, p_points: creditsToAward },
                  );

                  if (awardError) {
                    logStep("Failed to award payback credits", { bookingId, error: awardError.message });
                  } else {
                    const awarded = Number(awardedRaw) || 0;
                    if (awarded > 0) {
                      logStep("Payback credits awarded", { bookingId, creditsToAward: awarded, durationMin, amountPaidCents });
                    } else {
                      logStep("Payback not awarded (already awarded, cancelled, guest or non-padel)", { bookingId });
                    }
                  }
                }
              } else if (bk && amountPaidCents <= 0) {
                logStep("Payback skipped — nothing paid (voucher, points or free allocation)", { bookingId });
              }
            } catch (creditErr) {
              logStep("Failed to award play credits", { error: (creditErr as Error).message });
            }
            // ────────────────────────────────────────────────────────────────


            // Update payment record
            const { error: paymentError } = await supabaseAdmin
              .from("payments")
              .update({ 
                status: "completed",
                stripe_payment_intent_id: session.payment_intent as string,
              })
              .eq("stripe_checkout_session_id", session.id);

            if (paymentError) {
              logStep("Failed to update payment", { error: paymentError.message });
            } else {
              logStep("Payment record updated");
            }

            // GoBD: sequential receipt for the paid booking (idempotent per source).
            {
              const paidCents = session.amount_total ?? 0;
              const { error: receiptError } = await supabaseAdmin.rpc("create_receipt", {
                p_receipt_type: "booking",
                p_source_id: bookingId,
                p_user_id: isGuestWebhook ? null : (session.metadata?.user_id || null),
                p_recipient_email: isGuestWebhook ? (guestEmail ?? null) : null,
                p_recipient_name: isGuestWebhook ? (guestName ?? null) : null,
                p_description: await bookingDescription(supabaseAdmin, bookingId),
                p_gross_cents: paidCents,
                p_discount_cents: 0,
                p_paid_cents: paidCents,
                p_tax_rate: 19,
              });
              if (receiptError) logStep("Booking: receipt creation failed", { bookingId, error: receiptError.message });
            }

            // Record voucher redemption if a partial-discount voucher was applied.
            // (current_uses was already incremented as a soft-reserve in create-checkout-session)
            const appliedVoucherId = session.metadata?.voucher_id;
            if (appliedVoucherId) {
              await supabaseAdmin.from("voucher_redemptions").insert({
                voucher_id: appliedVoucherId,
                booking_id: bookingId,
                user_id: session.metadata?.user_id ?? "",
              });
              logStep("Voucher redemption recorded", { voucherId: appliedVoucherId, bookingId });
            }

            const userId = session.metadata?.user_id;
            const priceCents = session.amount_total;

            if (!isGuestWebhook && userId && priceCents) {
              // ── Authenticated user: send confirmation ──
              // (Payback points are awarded directly above via award_booking_payback;
              //  the old rewards-trigger percentage award has been removed.)
              try {
                const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    booking_id: bookingId,
                    user_id: userId,
                    payment_type: "owner",
                    amount_cents: priceCents,
                  }),
                });
                if (!emailResp.ok) {
                  logStep("Owner confirmation FAILED", { status: emailResp.status, body: await emailResp.text().catch(() => "") });
                } else {
                  logStep("Owner confirmation email triggered", { userId });
                }
              } catch (emailErr) {
                logStep("Failed to send owner confirmation", { error: (emailErr as Error).message });
              }
            } else if (isGuestWebhook && guestEmail) {
              // ── Guest: send confirmation to guest email, skip rewards ──
              try {
                const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    booking_id: bookingId,
                    guest_email: guestEmail,
                    guest_name: guestName || "Gast",
                    payment_type: "owner",
                    amount_cents: priceCents,
                  }),
                });
                if (!emailResp.ok) {
                  logStep("Guest confirmation FAILED", { status: emailResp.status, body: await emailResp.text().catch(() => "") });
                } else {
                  logStep("Guest confirmation email triggered", { guestEmail });
                }
              } catch (emailErr) {
                logStep("Failed to send guest confirmation", { error: (emailErr as Error).message });
              }
            }
          } else {
            logStep("No booking_id or lobby in metadata", { sessionId: session.id });
          }
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Marketplace: an abandoned/expired order must refund its reserved points and
        // restore its reserved stock. The release RPC is idempotent + pending-only, so
        // it is race-free against the cron backstop calling the same RPC.
        if (session.metadata?.type === "marketplace_purchase") {
          const redemptionId = session.metadata?.redemption_id;
          if (!redemptionId) {
            logStep("Marketplace expired session missing redemption_id", { sessionId: session.id });
            break;
          }
          const { error: releaseError } = await supabaseAdmin.rpc("release_marketplace_order", {
            p_order_id: redemptionId,
          });
          if (releaseError) {
            logStep("Failed to release expired marketplace order", { redemptionId, error: releaseError.message });
          } else {
            logStep("Marketplace order released (points refunded, stock restored)", { redemptionId });
          }
          break;
        }

        const bookingId = session.metadata?.booking_id;

        if (!bookingId) {
          logStep("No booking_id in metadata for expired session");
          break;
        }

        logStep("Processing expired checkout", { sessionId: session.id, bookingId });

        // Cancel booking (unpaid — session expired)
        const { error: bookingError } = await supabaseAdmin
          .from("bookings")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", bookingId)
          .eq("status", "pending_payment"); // Only cancel if still unpaid

        if (bookingError) {
          logStep("Failed to cancel expired booking", { error: bookingError.message });
        } else {
          logStep("Booking cancelled (unpaid session expired)", { bookingId });
        }

        // Update payment record
        const { error: paymentError } = await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_checkout_session_id", session.id);

        if (paymentError) {
          logStep("Failed to update payment status", { error: paymentError.message });
        }

        // Refund reserved play credits AND release the soft-reserved voucher use
        // atomically. Keying off the booking's reserved_* columns (not the Stripe
        // session metadata) makes this idempotent and race-free against the cron,
        // which calls the same RPC — so credits/voucher uses can't be double-released.
        const { error: releaseError } = await supabaseAdmin.rpc("release_booking_reserves", {
          p_booking_id: bookingId,
        });
        if (releaseError) {
          logStep("Failed to release booking reserves", { bookingId, error: releaseError.message });
        } else {
          logStep("Booking reserves released (credits refunded, voucher freed)", { bookingId });
        }
        break;
      }

      // ============================================
      // REFUND HANDLING
      // ============================================
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        logStep("Processing refund", { 
          chargeId: charge.id,
          amountRefunded: charge.amount_refunded,
          amountCaptured: charge.amount_captured,
        });

        // Get payment intent to find booking
        const paymentIntentId = typeof charge.payment_intent === 'string' 
          ? charge.payment_intent 
          : charge.payment_intent?.id;

        if (!paymentIntentId) {
          logStep("No payment_intent in charge");
          break;
        }

        // Find payment record by payment intent
        const { data: payment, error: paymentFetchError } = await supabaseAdmin
          .from("payments")
          .select("booking_id, user_id, amount_total_cents")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .single();

        if (paymentFetchError || !payment) {
          logStep("Payment record not found", { paymentIntentId, error: paymentFetchError?.message });
          break;
        }

        const bookingId = payment.booking_id;
        const userId = payment.user_id;
        const originalAmount = payment.amount_total_cents || charge.amount_captured;

        // Calculate refund percentage
        const refundPercentage = originalAmount > 0 
          ? Math.round((charge.amount_refunded / originalAmount) * 100)
          : 100;

        const isFullRefund = refundPercentage >= 100;

        logStep("Refund details", { 
          bookingId, 
          userId, 
          originalAmount, 
          amountRefunded: charge.amount_refunded,
          refundPercentage,
          isFullRefund 
        });

        // Update booking status
        if (isFullRefund) {
          const { error: bookingError } = await supabaseAdmin
            .from("bookings")
            .update({ 
              status: "cancelled",
              cancelled_at: new Date().toISOString()
            })
            .eq("id", bookingId);

          if (bookingError) {
            logStep("Failed to update booking to cancelled", { error: bookingError.message });
          } else {
            logStep("Booking marked as cancelled", { bookingId });
          }
        }

        // Update payment status + persist the refund record (GoBD: amounts must survive).
        const { error: paymentUpdateError } = await supabaseAdmin
          .from("payments")
          .update({
            status: isFullRefund ? "refunded" : "partially_refunded",
            refunded_amount_cents: charge.amount_refunded,
            refunded_at: new Date().toISOString(),
            stripe_refund_id: (charge as any).refunds?.data?.[0]?.id ?? null,
          })
          .eq("stripe_payment_intent_id", paymentIntentId);

        if (paymentUpdateError) {
          logStep("Failed to update payment status", { error: paymentUpdateError.message });
        }

        // Negative receipt for the booking refund (idempotent per booking).
        {
          const { error: receiptError } = await supabaseAdmin.rpc("create_receipt", {
            p_receipt_type: "booking_refund",
            p_source_id: bookingId,
            p_user_id: userId ?? null,
            p_recipient_email: null,
            p_recipient_name: null,
            p_description: await bookingDescription(supabaseAdmin, bookingId, { refund: true }),
            p_gross_cents: -charge.amount_refunded,
            p_discount_cents: 0,
            p_paid_cents: -charge.amount_refunded,
            p_tax_rate: 19,
          });
          if (receiptError) logStep("Booking refund: receipt creation failed", { bookingId, error: receiptError.message });
        }

        // Trigger rewards reversal
        try {
          await fetch(`${supabaseUrl}/functions/v1/rewards-trigger`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              event: "bookingRefunded",
              userId,
              bookingId,
              refundPercentage,
            }),
          });
          logStep("Rewards reversal triggered", { userId, bookingId, refundPercentage });
        } catch (rewardErr) {
          logStep("Failed to trigger rewards reversal", { error: (rewardErr as Error).message });
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.booking_id;

        logStep("Payment failed", { 
          paymentIntentId: paymentIntent.id, 
          bookingId,
          lastError: paymentIntent.last_payment_error?.message 
        });

        if (bookingId) {
          // Update payment record
          const { error: paymentError } = await supabaseAdmin
            .from("payments")
            .update({ status: "failed" })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (paymentError) {
            logStep("Failed to update payment status", { error: paymentError.message });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
