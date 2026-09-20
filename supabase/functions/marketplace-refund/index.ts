import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveResendKey, brandedEmailHtml, sendBrandedEmail } from "../_shared/email.ts";
import { hasAdminAccess } from "../_shared/adminAccess.ts";
import { resolveStripe } from "../_shared/stripe.ts";

// Admin-only refund/cancellation for a paid marketplace order.
// Flow (idempotent + retry-safe):
//   1. verify caller is an admin
//   2. load the order; only a 'success' order can be refunded
//   3. issue the Stripe money refund (skipped if a refund already exists, or if the
//      order was fully points-covered / has no Stripe session)
//   4. reverse the DB side via refund_marketplace_order (stock + points + status)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPERADMIN_EMAIL = "fsteinfelder@padel2go.eu";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth: caller must be an admin ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Nicht autorisiert" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) return json({ error: "Nicht autorisiert" }, 401);

    if (!(await hasAdminAccess(supabaseAdmin, user, "marketplace"))) {
      return json({ error: "Keine Admin-Berechtigung" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const orderId = (body as { order_id?: string }).order_id;
    if (!orderId) return json({ error: "order_id fehlt" }, 400);

    // ── Load order ─────────────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("marketplace_redemptions")
      .select("id, status, amount_cents, stripe_session_id, reference_code, user_id, item_id, quantity, play_spent, reward_spent, guest_email, guest_name, tax_rate")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "Bestellung nicht gefunden" }, 404);
    if (order.status === "refunded") return json({ error: "Bestellung wurde bereits erstattet" }, 400);
    if (order.status !== "success") {
      return json({ error: "Nur bezahlte Bestellungen können storniert werden" }, 400);
    }

    // ── Stripe money refund (only if actually paid with money) ──────────────────
    const amount = Number((order as { amount_cents?: number }).amount_cents ?? 0);
    const sessionId = (order as { stripe_session_id?: string }).stripe_session_id;
    let refundAmountCents = 0;
    let stripeRefundId: string | null = null;
    if (amount > 0 && sessionId) {
      let stripeKey: string;
      try {
        stripeKey = (await resolveStripe(supabaseAdmin)).secretKey;
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      let paymentIntentId: string | null = null;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent as { id?: string } | null)?.id ?? null;
      } catch (e) {
        return json({ error: "Stripe-Zahlung konnte nicht geladen werden: " + (e as Error).message }, 502);
      }
      if (!paymentIntentId) {
        return json({ error: "Zu dieser Bestellung wurde keine Stripe-Zahlung gefunden" }, 400);
      }

      // Idempotent: skip only if a refund that actually returns money already exists
      // (succeeded or still pending). A prior failed/canceled refund must NOT block a
      // real one — otherwise the DB would flip to 'refunded' with no money returned.
      const existing = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 10 });
      const alreadyActive = existing.data.find(
        (r) => r.status === "succeeded" || r.status === "pending",
      );
      if (alreadyActive) {
        refundAmountCents = alreadyActive.amount;
        stripeRefundId = alreadyActive.id;
      } else {
        try {
          // Schluessel am Zahlungsvorgang, nicht an der Bestellung — siehe
          // cancel-booking. Haelt wiederholte Erstattungen ab, ohne eine zweite
          // Zahlung auf dieselbe Bestellung unerstattbar zu machen.
          const created = await stripe.refunds.create(
            { payment_intent: paymentIntentId },
            { idempotencyKey: `mp_refund_${paymentIntentId}` },
          );
          refundAmountCents = created.amount;
          stripeRefundId = created.id;
        } catch (e) {
          // Money not refunded → do NOT touch the DB; admin can retry safely.
          return json({ error: "Stripe-Rückerstattung fehlgeschlagen: " + (e as Error).message }, 502);
        }
      }
    }

    // ── Reverse the DB side (stock + points + status + refund record). Idempotent. ──
    let { data: refunded, error: rpcErr } = await supabaseAdmin.rpc("refund_marketplace_order", {
      p_order_id: orderId,
      p_refund_amount_cents: refundAmountCents,
      p_stripe_refund_id: stripeRefundId,
    });
    if (rpcErr && /does not exist|PGRST202/i.test(rpcErr.message ?? "")) {
      // Pre-migration DB still has the single-arg signature — degrade gracefully.
      ({ data: refunded, error: rpcErr } = await supabaseAdmin.rpc("refund_marketplace_order", {
        p_order_id: orderId,
      }));
    }
    if (rpcErr) {
      return json({ error: "Rückabwicklung in der Datenbank fehlgeschlagen: " + rpcErr.message }, 500);
    }

    // Negative receipt for the refund (idempotent per order; only when money flowed back).
    if (refunded === true && refundAmountCents > 0) {
      const { error: receiptError } = await supabaseAdmin.rpc("create_receipt", {
        p_receipt_type: "marketplace_refund",
        p_source_id: orderId,
        p_user_id: null,
        p_recipient_email: null,
        p_recipient_name: null,
        p_description: `Erstattung Bestellung ${(order as { reference_code?: string }).reference_code ?? orderId}`,
        p_gross_cents: -refundAmountCents,
        p_discount_cents: 0,
        p_paid_cents: -refundAmountCents,
        // Der Satz der Bestellung, nicht fest 19. Die Bestellung haelt ihn seit
        // dem Kauf fest, die Gutschrift muss denselben ausweisen — sonst waere
        // sie bei einem 7-Prozent-Produkt still falsch.
        p_tax_rate: Number((order as { tax_rate?: number }).tax_rate ?? 19),
      });
      if (receiptError) console.log("[marketplace-refund] receipt creation failed:", receiptError.message);
    }

    // Fire-and-forget branded refund confirmation to the customer (non-fatal to the refund).
    // Idempotent claim so a concurrent admin double-refund can't send two emails.
    const { data: mailClaim } = await supabaseAdmin
      .from("marketplace_redemptions")
      .update({ refund_confirmation_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("refund_confirmation_sent_at", null)
      .select("id");
    if (mailClaim && mailClaim.length > 0) try {
      const resendKey = await resolveResendKey(supabaseAdmin);
      if (resendKey) {
        let email: string | null = (order as { guest_email?: string | null }).guest_email ?? null;
        let name = (order as { guest_name?: string | null }).guest_name || "Gast";
        const orderUserId = (order as { user_id?: string | null }).user_id ?? null;
        if (!email && orderUserId) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(orderUserId);
          email = u.user?.email ?? null;
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("display_name, username")
            .eq("user_id", orderUserId)
            .maybeSingle();
          name = profile?.display_name || profile?.username || "Spieler";
        }
        if (email) {
          let itemName = "Artikel";
          const itemId = (order as { item_id?: string | null }).item_id ?? null;
          if (itemId) {
            const { data: itemRow } = await supabaseAdmin
              .from("marketplace_items")
              .select("name")
              .eq("id", itemId)
              .maybeSingle();
            if (itemRow?.name) itemName = itemRow.name;
          }
          const pointsBack =
            ((order as { play_spent?: number }).play_spent ?? 0) +
            ((order as { reward_spent?: number }).reward_spent ?? 0);
          const rows = [
            { label: "Produkt", value: itemName },
            { label: "Bestellnr.", value: order.reference_code ?? order.id.substring(0, 8).toUpperCase() },
          ];
          if (amount > 0) rows.push({ label: "Zurückerstattet", value: `${(amount / 100).toFixed(2).replace(".", ",")} €` });
          if (pointsBack > 0) rows.push({ label: "Punkte gutgeschrieben", value: `${pointsBack} Punkte` });
          const html = brandedEmailHtml({
            title: "Rückerstattung bestätigt",
            emoji: "↩️",
            heading: "Rückerstattung bestätigt",
            intro: "Deine Bestellung wurde storniert und erstattet.",
            greetingName: name,
            rows,
            note: amount > 0
              ? "Der Betrag wird auf dein Zahlungsmittel zurückerstattet — das kann einige Tage dauern."
              : "Deine Punkte wurden deinem Konto wieder gutgeschrieben.",
            ctaLabel: "Zum Shop",
            ctaUrl: "https://www.padel2go-official.de/marketplace",
          });
          await sendBrandedEmail(resendKey, email, `Rückerstattung bestätigt: ${itemName}`, html);
        }
      }
    } catch (mailErr) {
      console.log("[MARKETPLACE-REFUND] confirmation email failed:", (mailErr as Error).message);
    }

    return json({ success: true, refunded: !!refunded, reference_code: order.reference_code }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
