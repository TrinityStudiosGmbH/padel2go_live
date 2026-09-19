import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@4.0.0";
import { resolveResendKey, DEFAULT_FROM, INTERNAL_INBOX, brandedEmailHtml } from "../_shared/email.ts";
import { resolveStripe } from "../_shared/stripe.ts";

const allowedOrigins = [
  "https://www.padel2go-official.com",
  "https://padel2go-official.com",
  "https://www.padel2go-official.de",
  "https://padel2go-official.de",
  "https://padel2go.lovable.app",
  "https://padel2go.de",
  "http://localhost:5173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = !!origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.vercel.app')
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MARKETPLACE-CHECKOUT] ${step}${detailsStr}`);
};

// Untrusted values (guest/shipping/profile/email/reference/item fields) must never be
// interpolated raw into the internal HTML fulfillment email — this neutralizes HTML/content
// injection while leaving the value itself unchanged for safe input.
const escapeHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// CSPRNG reference code (not Math.random) — this code identifies the order for fulfilment.
const generateReferenceCode = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // 36 chars
  const max = Math.floor(256 / chars.length) * chars.length; // reject above to avoid modulo bias
  let code = "";
  while (code.length < 10) {
    const buf = new Uint8Array(10);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && code.length < 10; i++) {
      if (buf[i] < max) code += chars.charAt(buf[i] % chars.length);
    }
  }
  return `P2G-${code}`;
};

serve(async (req) => {
  // Native app calls (React Native fetch) send no Origin header — fall back to the
  // public site so success/cancel URLs always resolve (the app polls booking/order
  // status itself and shows its own confirmation).
  const origin = req.headers.get("origin") ?? "https://www.padel2go-official.de";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // OPTIONAL JWT: a token means a logged-in user (points allowed); none means guest (cash only).
    let user: { id: string; email: string } | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseClient.auth.getUser(token);
      if (userData?.user?.id && userData.user.email) {
        user = userData.user as { id: string; email: string };
      }
    }
    logStep("Auth resolved", { userId: user?.id ?? "guest" });

    const body = await req.json();
    const itemId: string | undefined = body.item_id;
    const pointsToUse = Math.max(0, Math.floor(Number(body.points_to_use ?? 0)) || 0);
    const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)) || 1);
    const shipping = body.shipping as
      | { address_line1?: string; postal_code?: string; city?: string; country?: string }
      | undefined;
    const guestEmail: string | undefined = body.guest_email;
    const guestName: string | undefined = body.guest_name;

    if (!itemId) return json({ error: "Item ID fehlt" }, 400);

    // Re-fetch the item server-side — never trust a client-sent price.
    const { data: item, error: itemError } = await supabaseAdmin
      .from("marketplace_items")
      .select("*")
      .eq("id", itemId)
      .eq("is_active", true)
      .maybeSingle();

    if (itemError || !item) {
      logStep("Item not found or inactive", { itemId, error: itemError?.message });
      return json({ error: "Item nicht gefunden oder nicht verfügbar" }, 404);
    }

    const unitPriceCents: number | null = item.price_cents ?? null;
    if (unitPriceCents === null || unitPriceCents <= 0) {
      logStep("Item has no valid price", { itemId, price_cents: unitPriceCents });
      return json({ error: "Dieser Artikel ist nicht käuflich" }, 400);
    }
    const priceCents = unitPriceCents * quantity;

    // Stock: null = unlimited; otherwise it must cover the requested quantity.
    const tracksStock = item.stock_quantity !== null && item.stock_quantity !== undefined;
    if (tracksStock && item.stock_quantity < quantity) {
      logStep("Insufficient stock", { itemId, stock: item.stock_quantity, quantity });
      return json({ error: "Item ist ausverkauft" }, 400);
    }

    // Physical products need a full shipping address.
    if (item.product_type === "purchase") {
      if (!shipping || !shipping.address_line1 || !shipping.postal_code || !shipping.city || !shipping.country) {
        return json({ error: "Lieferadresse ist erforderlich für dieses Produkt" }, 400);
      }
    }

    // Cash payer email: logged-in user's email, or the guest-supplied email.
    const effectiveEmail = user ? user.email : (guestEmail ?? "").trim();
    if (!effectiveEmail) {
      return json({ error: "E-Mail-Adresse ist erforderlich" }, 400);
    }

    // ── Points discount (logged-in only; guests are cash-only) ─────────────────
    // The wallet debit itself happens ATOMICALLY inside insert_marketplace_order (same txn
    // as the order row), never here — see that RPC. Here we only size the discount and the
    // number of points to reserve; actualDiscountCents stays provisional until the RPC
    // reports how many points it actually took.
    let appliedPlay = 0;
    let appliedReward = 0;
    let actualDiscountCents = 0;
    let pointsToReserve = 0;

    if (user && pointsToUse > 0) {
      const { data: siteSettings } = await supabaseAdmin
        .from("site_settings")
        .select("feature_credits_payment_enabled, credits_per_euro, credits_payment_max_percent")
        .eq("id", "global")
        .single();

      const creditsEnabled = (siteSettings as any)?.feature_credits_payment_enabled ?? false;
      const creditsPerEuro: number = (siteSettings as any)?.credits_per_euro ?? 100;
      const maxPercent: number = Math.min(
        100,
        Math.max(0, Number((siteSettings as any)?.credits_payment_max_percent ?? 50) || 0),
      );

      if (!creditsEnabled) {
        return json({ error: "Punkte-Zahlung ist aktuell nicht aktiviert" }, 400);
      }

      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("play_credits, reward_credits")
        .eq("user_id", user.id)
        .single();

      const availablePoints = (wallet?.play_credits ?? 0) + (wallet?.reward_credits ?? 0);
      const centsPerPoint = 100 / creditsPerEuro;
      // Deckel je Bestellung: ein fester Anteil des Warenwerts, global gesetzt
      // unter Preise & Punkte. Kein Feld mehr am Produkt — 170 € bei 50 % sind
      // 85 € Rabatt, egal welches Produkt. priceCents ist bereits der Wert der
      // gesamten Menge, der Anteil gilt also auf die ganze Position.
      const capByPercentCents = Math.floor((priceCents * maxPercent) / 100);
      const requestedDiscountCents = Math.floor(pointsToUse * centsPerPoint);
      actualDiscountCents = Math.min(
        requestedDiscountCents,
        capByPercentCents,
        priceCents,
        Math.floor(availablePoints * centsPerPoint),
      );
      // Never leave a remainder Stripe can't charge (the 0<x<50c band): trim the discount
      // so exactly 50c remains, otherwise points would be burned for a discount never
      // delivered AND the user overcharged the Stripe minimum on top. (Full-coverage → free path.)
      const remainderIfApplied = priceCents - actualDiscountCents;
      if (remainderIfApplied > 0 && remainderIfApplied < 50) {
        actualDiscountCents = Math.max(0, priceCents - 50);
      }
      pointsToReserve = Math.ceil(actualDiscountCents / centsPerPoint);
      if (pointsToReserve <= 0) {
        pointsToReserve = 0;
        actualDiscountCents = 0;
      }
    }

    // Provisional: assumes the reserve inside insert_marketplace_order takes the full
    // pointsToReserve. Recomputed from that RPC's authoritative result before any charge.
    let remainderCents = priceCents - actualDiscountCents;

    // ── Create the PENDING order row (mirrors bookings: the order exists before the
    // webhook so we never oversell and never pay-without-a-row). ────────────────
    const referenceCode = generateReferenceCode();
    const orderId = crypto.randomUUID();
    // Cron backstop reclaims a pending order after this deadline. Set it beyond the
    // 30-min Stripe session expiry so the checkout.session.expired webhook reclaims first.
    const holdExpiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const redemptionData: Record<string, unknown> = {
      id: orderId,
      user_id: user?.id ?? null,
      item_id: itemId,
      // Point columns are overwritten by insert_marketplace_order with the ACTUAL amounts it
      // reserves in-txn; amount_cents is provisional (the Stripe path re-persists the charge).
      credit_cost: 0,
      amount_cents: Math.max(0, remainderCents),
      play_spent: 0,
      reward_spent: 0,
      unit_price_cents: unitPriceCents,
      gross_cents: priceCents,
      discount_cents: actualDiscountCents,
      tax_rate: Number((item as any).tax_rate ?? 19),
      quantity,
      status: "pending",
      reference_code: referenceCode,
      fulfillment_status: item.product_type === "purchase" ? "pending" : "delivered",
      hold_expires_at: holdExpiresAt,
      created_at: new Date().toISOString(),
    };
    if (!user) {
      redemptionData.guest_email = effectiveEmail;
      redemptionData.guest_name = guestName ?? null;
    }
    if (item.product_type === "purchase" && shipping) {
      redemptionData.shipping_address_line1 = shipping.address_line1;
      redemptionData.shipping_postal_code = shipping.postal_code;
      redemptionData.shipping_city = shipping.city;
      redemptionData.shipping_country = shipping.country || "DE";
    }

    // Create the pending order AND reserve the points under one per-(user,item) advisory
    // lock, in a single transaction: a rapid double-submit is rejected here (no row) BEFORE
    // any debit, and a failed insert rolls the debit back — so no rollback path can strand
    // debited-but-unrecorded points (previously a best-effort refund_points could silently
    // lose them). Guests self-heal via release.
    const { data: insertResult, error: orderError } = await supabaseAdmin.rpc(
      "insert_marketplace_order",
      { p_order: redemptionData, p_reserve: pointsToReserve },
    );

    if (orderError) {
      logStep("Failed to create pending order", { error: orderError.message });
      return json({ error: "Fehler beim Erstellen der Bestellung – bitte erneut versuchen" }, 500);
    }
    const insertedRow = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    if (!insertedRow || !(insertedRow as any).order_id) {
      // Es laeuft bereits eine Bestellung fuer diesen Artikel. Frueher endete das
      // hier in einer Sackgasse: 45 Minuten lang nur die Meldung "laeuft bereits",
      // ohne Weg zur angefangenen Zahlung. Jetzt holen wir die offene
      // Stripe-Sitzung und schicken den Kunden dorthin zurueck — genau so, wie es
      // die Court-Buchung schon macht. Eine zweite Abbuchung kann daraus nicht
      // entstehen, weil es dieselbe Sitzung ist.
      logStep("Laufende Bestellung gefunden — versuche Wiederaufnahme", { userId: user?.id ?? "guest", itemId });

      const openOrderQuery = supabaseAdmin
        .from("marketplace_redemptions")
        .select("id, stripe_session_id, reference_code")
        .eq("item_id", itemId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: openOrder } = user
        ? await openOrderQuery.eq("user_id", user.id).maybeSingle()
        : await openOrderQuery.eq("guest_email", effectiveEmail).maybeSingle();

      if (openOrder?.stripe_session_id) {
        const resumeKey = await resolveStripe(supabaseAdmin).then((c) => c.secretKey).catch(() => null);
        if (resumeKey) {
          try {
            const existing = await new Stripe(resumeKey, { apiVersion: "2025-08-27.basil" })
              .checkout.sessions.retrieve(openOrder.stripe_session_id);
            if (existing.status === "open" && existing.url) {
              logStep("Offene Sitzung wiederverwendet", { orderId: openOrder.id });
              return json({ url: existing.url, resumed: true }, 200);
            }
          } catch (resumeErr) {
            logStep("Offene Sitzung nicht abrufbar", { error: (resumeErr as Error).message });
          }
        }
      }

      // Keine offene Sitzung mehr — die Haltefrist ist abgelaufen und der
      // Aufraeumer hat Ware und Punkte freigegeben, die Bestellung aber offen
      // gelassen. Jetzt legen wir eine FRISCHE Sitzung fuer dieselbe Bestellung
      // an, zum vollen Preis (der Punkterabatt ging mit der Freigabe zurueck).
      if (openOrder) {
        // Ware neu reservieren. Ist sie inzwischen weg, sagen wir das ehrlich,
        // statt den Kunden zahlen zu lassen und nicht liefern zu koennen.
        if (tracksStock) {
          const { data: ok, error: stockErr } = await supabaseAdmin.rpc(
            "marketplace_decrement_stock",
            { p_item_id: itemId, p_quantity: quantity, p_order_id: openOrder.id },
          );
          if (stockErr || ok !== true) {
            logStep("Wiederaufnahme: Artikel nicht mehr verfuegbar", { orderId: openOrder.id });
            return json({ error: "Dieser Artikel ist inzwischen ausverkauft." }, 409);
          }
        }

        const renewKey = await resolveStripe(supabaseAdmin).then((c) => c.secretKey).catch(() => null);
        if (!renewKey) return json({ error: "Zahlungsanbieter ist nicht konfiguriert" }, 500);

        const renewAmount = Math.max(50, priceCents);
        try {
          const renewed = await new Stripe(renewKey, { apiVersion: "2025-08-27.basil" })
            .checkout.sessions.create({
              customer_email: effectiveEmail,
              payment_method_types: ["card", "paypal"],
              expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
              line_items: [{
                price_data: {
                  currency: "eur",
                  product_data: { name: item.name, description: item.partner_name || undefined },
                  unit_amount: renewAmount,
                },
                quantity: 1,
              }],
              mode: "payment",
              success_url: `${origin}/marketplace/success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${origin}/marketplace?checkout=cancelled`,
              metadata: { type: "marketplace_purchase", redemption_id: openOrder.id },
            }, {
              // Enthaelt die vorherige Sitzung: ein wiederholter Aufruf desselben
              // Anlaufs bekommt dieselbe Sitzung, ein spaeterer Anlauf eine neue.
              idempotencyKey: `mp_sess_${openOrder.id}_${openOrder.stripe_session_id ?? "first"}`,
            });

          await supabaseAdmin
            .from("marketplace_redemptions")
            .update({
              stripe_session_id: renewed.id,
              amount_cents: renewAmount,
              hold_expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
            })
            .eq("id", openOrder.id);

          logStep("Neue Sitzung fuer offene Bestellung angelegt", { orderId: openOrder.id });
          return json({ url: renewed.url, renewed: true }, 200);
        } catch (renewErr) {
          logStep("Neue Sitzung fehlgeschlagen", { orderId: openOrder.id, error: (renewErr as Error).message });
          if (tracksStock) {
            await supabaseAdmin.rpc("expire_marketplace_hold", { p_order_id: openOrder.id });
          }
          return json({ error: "Die Zahlung konnte nicht gestartet werden. Bitte später erneut versuchen." }, 502);
        }
      }

      return json({
        error: "Für diesen Artikel läuft bereits ein Bezahlvorgang. Du findest ihn unter Konto → Bestellungen.",
      }, 409);
    }

    // The RPC reserved the points in-txn and reports what it ACTUALLY took (a concurrent
    // spend can leave the wallet short → it takes 0 → no discount). Correct the discount and
    // the remainder from that authoritative result before any charge/free-path decision.
    appliedPlay = (insertedRow as any).play_reserved ?? 0;
    appliedReward = (insertedRow as any).reward_reserved ?? 0;
    if (appliedPlay + appliedReward === 0) {
      actualDiscountCents = 0;
    }
    remainderCents = priceCents - actualDiscountCents;

    // Atomic, idempotent rollback of a still-pending order: cancels it, refunds the reserved
    // points (from the row) and restores any reserved stock in one guarded step. Pending-only,
    // so it races safely with the cron backstop calling the same RPC — a silent failure here
    // is reclaimed by the cron, never double-applied.
    const releaseOrder = async () => {
      const { error: releaseError } = await supabaseAdmin.rpc("release_marketplace_order", {
        p_order_id: orderId,
      });
      if (releaseError) logStep("Failed to release order — cron backstop will reclaim", { orderId, error: releaseError.message });
    };

    // Reserve the unit(s) via an ATOMIC column-relative decrement (never a stale-read
    // absolute write) so concurrent buyers can never oversell.
    if (tracksStock) {
      const { data: decremented, error: decError } = await supabaseAdmin.rpc(
        "marketplace_decrement_stock",
        { p_item_id: itemId, p_quantity: quantity, p_order_id: orderId },
      );

      if (decError || decremented !== true) {
        logStep("Stock reservation lost race — rolling back", { itemId, quantity, error: decError?.message });
        // Route the rollback through the stock_reserved-aware, idempotent release RPC — NOT
        // a DELETE. release restores stock ONLY when the decrement actually committed
        // (stock_reserved=true) and no-ops the restore otherwise, so it is correct for BOTH
        // a genuinely-lost race (nothing taken) AND the false-negative decError case where
        // marketplace_decrement_stock COMMITTED (stock 5->4, stock_reserved=true) but the
        // .rpc() call surfaced a transport error. A DELETE here would drop the only row
        // carrying stock_reserved=true and permanently deflate inventory, and remove the
        // artifact the cron backstop needs to refund the reserved points. release also
        // refunds those points from the row, so a transient failure just leaves the row
        // pending for the per-minute cron to reclaim.
        await releaseOrder();
        return json({ error: "Item ist ausverkauft" }, 409);
      }

      // stock_reserved is set atomically inside marketplace_decrement_stock (same txn as
      // the decrement), so a crash can never leave a decremented-but-unflagged order.
    }

    // ── FULL COVERAGE (logged-in): points cover the whole price → skip Stripe. ──
    if (user && remainderCents <= 0) {
      const { data: flipped } = await supabaseAdmin
        .from("marketplace_redemptions")
        .update({ status: "success" })
        .eq("id", orderId)
        .eq("status", "pending")
        .select("id");

      if (!flipped || flipped.length === 0) {
        logStep("Free path: order no longer pending", { orderId });
      }

      // Economic snapshot in a SEPARATE update: must never block the status flip
      // (columns only exist once the July-2026 compliance migrations ran).
      const { error: snapshotError } = await supabaseAdmin
        .from("marketplace_redemptions")
        .update({ discount_cents: priceCents, tax_cents: 0 })
        .eq("id", orderId);
      if (snapshotError) logStep("Free path: snapshot update failed (migration pending?)", { error: snapshotError.message });

      // GoBD: every completed order gets a sequential receipt — €0.00 orders too
      // (full points coverage = Entgeltminderung to zero, no VAT).
      const { error: receiptError } = await supabaseAdmin.rpc("create_receipt", {
        p_receipt_type: "marketplace_order",
        p_source_id: orderId,
        p_user_id: user.id,
        p_recipient_email: effectiveEmail,
        p_recipient_name: guestName ?? null,
        p_description: `${item.name} × ${quantity} (${referenceCode})`,
        p_gross_cents: priceCents,
        p_discount_cents: priceCents,
        p_paid_cents: 0,
        p_tax_rate: Number((item as any).tax_rate ?? 19),
      });
      if (receiptError) logStep("Free path: receipt creation failed", { orderId, error: receiptError.message });

      const { data: postWallet } = await supabaseAdmin
        .from("wallets")
        .select("play_credits, reward_credits")
        .eq("user_id", user.id)
        .single();
      const balanceAfter = (postWallet?.play_credits ?? 0) + (postWallet?.reward_credits ?? 0);

      const { error: ledgerError } = await supabaseAdmin.from("points_ledger").insert({
        user_id: user.id,
        credit_type: "REWARD",
        delta_points: -(appliedPlay + appliedReward),
        balance_after: balanceAfter,
        entry_type: "REDEMPTION",
        description: `Marketplace: ${item.name}`,
        source_type: "REDEMPTION",
        source_id: referenceCode,
      });
      if (ledgerError) logStep("Free path: ledger insert failed", { error: ledgerError.message });

      // Admin order alert for EVERY product type (previously physical-only, which left
      // digital/rental orders invisible until someone opened the admin queue).
      {
        try {
          const resendApiKey = await resolveResendKey(supabaseAdmin);
          if (resendApiKey) {
            const { data: userProfile } = await supabaseAdmin
              .from("profiles")
              .select("display_name, username")
              .eq("user_id", user.id)
              .single();
            const displayName = userProfile?.display_name || userProfile?.username || "Unbekannt";
            const formattedAddress = item.product_type === "purchase"
              ? `${shipping!.address_line1}\n${shipping!.postal_code} ${shipping!.city}\n${shipping!.country || "Deutschland"}`
              : "— (kein Versand nötig)";
            const resend = new Resend(resendApiKey);
            await resend.emails.send({
              from: DEFAULT_FROM,
              to: [INTERNAL_INBOX],
              subject: `Neue Marketplace-Bestellung: ${item.name} - ${referenceCode}`,
              html: brandedEmailHtml({
                internal: true,
                title: `Neue Marketplace-Bestellung: ${item.name}`,
                preheader: `${referenceCode} · ${displayName}`,
                emoji: "🛍️",
                heading: "Neue Marketplace-Bestellung",
                intro: "Eine Bestellung wartet auf Bearbeitung.",
                rowsTitle: "Bestelldetails",
                rows: [
                  { label: "Referenz", value: referenceCode },
                  { label: "Produkt", value: item.name },
                  { label: "Kategorie", value: item.category },
                  { label: "Menge", value: String(quantity) },
                  { label: "Bezahlt mit Punkten", value: String(appliedPlay + appliedReward) },
                  { label: "Bezahlt bar", value: `${(Math.max(0, remainderCents) / 100).toFixed(2).replace(".", ",")} €` },
                  { label: "Kunde", value: displayName },
                  { label: "E-Mail", value: effectiveEmail },
                  { label: "Lieferadresse", value: formattedAddress.replace(/\n/g, ", ") },
                ],
                ctaLabel: "Bestellung im Admin öffnen",
                ctaUrl: "https://www.padel2go-official.de/admin/marketplace",
              }),
            });
            logStep("Free path: fulfillment email sent", { referenceCode });
          } else {
            logStep("Free path: RESEND_API_KEY not configured — skipping email");
          }
        } catch (emailError) {
          logStep("Free path: fulfillment email failed", { error: (emailError as Error).message });
        }
      }

      // Fire-and-forget customer order-confirmation (idempotent inside the function).
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-marketplace-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ order_id: orderId }),
        });
      } catch (confErr) {
        logStep("Free path: customer confirmation trigger failed", { orderId, error: (confErr as Error).message });
      }

      logStep("Free path: order completed via points", { orderId, appliedPlay, appliedReward });
      return json({ free: true, reference_code: referenceCode }, 200);
    }

    // ── ELSE: charge the remainder via Stripe (respect the 50c minimum). ────────
    // Der Schalter im Admin bestimmt Echt- oder Testbetrieb. Die frühere
    // Freischaltung einzelner Tester-Adressen entfaellt damit: ein Schalter für
    // die ganze Plattform ist eindeutig, eine halb umgestellte Kasse nicht.
    let stripeKey: string;
    try {
      stripeKey = (await resolveStripe(supabaseAdmin)).secretKey;
    } catch (e) {
      logStep("Stripe nicht nutzbar — Bestellung wird freigegeben", { error: (e as Error).message });
      await releaseOrder();
      return json({ error: (e as Error).message }, 500);
    }

    if (!origin) {
      await releaseOrder();
      return json({ error: "Origin header is missing — cannot build success/cancel URLs." }, 400);
    }

    const chargeCents = Math.max(50, remainderCents);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        customer_email: effectiveEmail,
        payment_method_types: ["card", "paypal"],
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: item.name,
                description: item.partner_name || undefined,
              },
              unit_amount: chargeCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/marketplace/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/marketplace?checkout=cancelled`,
        metadata: {
          type: "marketplace_purchase",
          redemption_id: orderId,
        },
      },
      {
        // Siehe create-checkout-session: schuetzt gegen eine zweite Sitzung,
        // wenn die Verbindung nach dem Anlegen abbricht und der Client den
        // Aufruf wiederholt. Die Bestellung ist neu, deshalb genuegt ihre ID.
        idempotencyKey: `mp_sess_${orderId}_first`,
      });
    } catch (stripeErr) {
      logStep("Stripe session creation failed — rolling back", { error: (stripeErr as Error).message });
      await releaseOrder();
      throw stripeErr;
    }

    // Persist the session id (webhook idempotency key) + the actual charged amount.
    const { error: persistError } = await supabaseAdmin
      .from("marketplace_redemptions")
      .update({ stripe_session_id: session.id, amount_cents: chargeCents })
      .eq("id", orderId);
    if (persistError) logStep("Failed to persist stripe_session_id", { error: persistError.message });

    // Economic snapshot in a SEPARATE, non-fatal update: discount_cents is the
    // discount actually delivered (the 50c floor can shrink it), tax on the amount
    // actually paid (Entgeltminderung, § 17 UStG). Columns exist only after the
    // July-2026 compliance migrations.
    const mpTaxRate = Number((item as any).tax_rate ?? 19);
    const { error: snapshotError } = await supabaseAdmin
      .from("marketplace_redemptions")
      .update({
        discount_cents: Math.max(0, priceCents - chargeCents),
        tax_cents: Math.round(chargeCents - chargeCents / (1 + mpTaxRate / 100)),
      })
      .eq("id", orderId);
    if (snapshotError) logStep("Snapshot update failed (migration pending?)", { error: snapshotError.message });

    logStep("Checkout session created", { orderId, sessionId: session.id });
    return json({ url: session.url }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return json({ error: errorMessage }, 500);
  }
});
