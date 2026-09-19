import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "npm:stripe@18.5.0";
import { resolveStripe } from "../_shared/stripe.ts";

// Native in-app payments (Apple Pay / saved cards) for COURT BOOKINGS via Stripe's
// PaymentSheet. Mirrors create-checkout-session's validation + pricing + voucher logic, but
// returns a PaymentIntent client secret instead of a hosted-checkout URL.
//
// Settlement is NOT duplicated: the intent carries the SAME metadata as a checkout session
// plus `flow: "native_sheet"`, and stripe-webhook normalizes `payment_intent.succeeded`
// events with that flag into a session-shaped object — so the existing (battle-tested)
// booking settlement path runs unchanged.
//
// Marketplace deliberately stays on hosted checkout (points/stock reservation logic lives
// there); Apple Pay is available there through the in-app browser.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const logStep = (step: string, details?: Record<string, unknown>) =>
  console.log(`[CREATE-PAYMENT-INTENT] ${step}${details ? ` ${JSON.stringify(details)}` : ""}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Modus, Geheim- und oeffentlicher Schluessel aus einer Hand. Wichtig ist,
    // dass beide zum selben Modus gehoeren: die App baut ihr Stripe-SDK mit dem
    // oeffentlichen Schluessel auf, den wir hier zurueckgeben.
    const stripeCreds = await resolveStripe(supabaseAdmin);
    const stripeKey = stripeCreds.secretKey;

    // Auth — native payments are for signed-in users only (guests use hosted checkout).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const { data: userData } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user?.id || !user.email) return json({ error: "Authentication required" }, 401);

    const publishableKey = stripeCreds.publishableKey;
    if (!publishableKey) {
      throw new Error("Kein öffentlicher Stripe-Schlüssel für diesen Modus hinterlegt");
    }

    const { booking_id, voucher_id } = await req.json();
    if (!booking_id) return json({ error: "booking_id is required" }, 400);

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("*, locations (name), courts (name)")
      .eq("id", booking_id)
      .maybeSingle();
    if (bookingError) throw new Error("Failed to fetch booking");
    if (!booking) return json({ error: "Booking not found" }, 404);
    if (booking.user_id !== user.id) return json({ error: "Access denied" }, 403);
    if (booking.status !== "pending_payment") {
      return json({ error: `Booking is not awaiting payment. Status: ${booking.status}` }, 409);
    }
    if (new Date(booking.start_time).getTime() < Date.now() - 15 * 60 * 1000) {
      return json({ error: "Der gebuchte Zeitraum liegt in der Vergangenheit" }, 409);
    }

    const startTime = new Date(booking.start_time);
    const endTime = new Date(booking.end_time);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    // Server-recomputed price via resolve_booking_rate (Standort-Ausnahme und Zeitfenster schlagen
    // den globalen Standardpreis) — never trust the client-inserted booking.price_cents.
    // Mitglieder-Kondition inklusive; die Buchung zählt beim Monatslimit nicht sich selbst.
    const { data: rateData, error: rateError } = await supabaseAdmin.rpc("resolve_booking_rate", {
      p_court_id: booking.court_id,
      p_start: booking.start_time,
      p_duration_minutes: durationMinutes,
      p_user_id: booking.user_id,
      p_exclude_booking_id: booking.id,
    });
    if (rateError) {
      logStep("Error resolving booking rate", { error: rateError.message });
      throw new Error("Failed to fetch price");
    }
    const rate = (Array.isArray(rateData) ? rateData[0] : rateData) as {
      price_cents: number | null;
      price_band_name: string | null;
      court_sport: string | null;
      member_scope: string | null;
      member_discount_cents: number | null;
    } | null;
    const priceCents: number | null = rate?.price_cents ?? null;
    if (priceCents === null) throw new Error(`No price configured for duration (${durationMinutes} min)`);

    // Tennis wird ausschließlich in 60-Minuten-Slots gespielt — eine abweichende Dauer
    // wird abgelehnt statt still bezahlt. Sportart notfalls direkt am Court lesen.
    let courtSport: string | null = rate?.court_sport ?? null;
    if (!courtSport) {
      const { data: courtRow } = await supabaseAdmin
        .from("courts")
        .select("sport")
        .eq("id", booking.court_id)
        .maybeSingle();
      courtSport = ((courtRow as any)?.sport as string | null) ?? null;
    }
    if (courtSport === "tennis" && durationMinutes !== 60) {
      logStep("Invalid tennis duration", { booking_id, durationMinutes });
      return json({ error: "Tennis-Plätze können nur für 60 Minuten gebucht werden" }, 409);
    }

    logStep("Rate resolved", {
      priceCents,
      priceBand: rate?.price_band_name ?? null,
      courtSport,
      memberScope: rate?.member_scope ?? null,
      memberDiscountCents: rate?.member_discount_cents ?? 0,
    });
    // Kontingent-Buchung: claim_member_quota hat bereits auf 0 gesetzt und Minuten
    // verbucht — der aufgelöste Preis darf das nicht rückgängig machen.
    let amountCents = (booking as any).is_free_allocation === true ? 0 : priceCents;

    // Kostenlose Buchung (Heim-Tennis eines Vereinsmitglieds oder Kontingent): hier gibt
    // es nichts zu kassieren. Ohne diesen Ausstieg würde der Math.max(50, …) weiter unten
    // 50 Cent auf eine 0-€-Buchung schlagen. Der Client bestätigt sie über
    // create-checkout-session (Free-Path: settle + Bestätigungsmail).
    if (amountCents <= 0) {
      logStep("Free booking — no PaymentIntent needed", { booking_id: booking.id });
      return json({ free: true, amount_cents: 0, publishable_key: publishableKey });
    }

    // Partial voucher discount — identical semantics to create-checkout-session
    // (fully-free vouchers must go through voucher-redeem, sub-minimum clamps to 50c).
    let appliedVoucherId: string | undefined;
    if (voucher_id) {
      const { data: voucher } = await supabaseAdmin
        .from("voucher_codes")
        .select("id, is_active, discount_type, discount_value, max_uses, current_uses, valid_from, valid_until")
        .eq("id", voucher_id).single();
      if (voucher?.is_active) {
        const now = new Date();
        const withinWindow = new Date(voucher.valid_from) <= now &&
          (!voucher.valid_until || new Date(voucher.valid_until) > now);
        const hasUses = voucher.max_uses === null || voucher.current_uses < voucher.max_uses;
        if (withinWindow && hasUses) {
          const { data: reserved } = await supabaseAdmin
            .from("voucher_codes")
            .update({ current_uses: voucher.current_uses + 1 })
            .eq("id", voucher.id).eq("current_uses", voucher.current_uses).select("id");
          if (reserved && reserved.length > 0) {
            const dt = voucher.discount_type ?? "free";
            const dv = voucher.discount_value ?? 0;
            if (dt === "percentage" && dv > 0 && dv < 100) {
              amountCents = Math.max(0, Math.ceil(amountCents * (1 - dv / 100)));
            } else if (dt === "fixed" && dv > 0) {
              amountCents = Math.max(0, amountCents - dv);
            }
            if (amountCents === 0) {
              await supabaseAdmin.from("voucher_codes")
                .update({ current_uses: voucher.current_uses })
                .eq("id", voucher.id).eq("current_uses", voucher.current_uses + 1);
              return json({ error: "Dieser Gutschein macht die Buchung kostenlos — bitte über 'Kostenlos buchen' einlösen" }, 409);
            }
            if (amountCents < 50) amountCents = 50;
            appliedVoucherId = voucher.id;
            logStep("Voucher applied", { voucherId: voucher.id, amountCents });
          }
        }
      }
    }
    amountCents = Math.max(50, amountCents);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Reuse (or create) the Stripe customer so PaymentSheet can offer saved cards.
    let customerId: string;
    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    customerId = existing.data.length > 0
      ? existing.data[0].id
      : (await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } })).id;

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2025-08-27.basil" },
    );

    const locationName = (booking.locations as { name: string })?.name || "Court";
    const courtName = (booking.courts as { name: string })?.name || "";

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: (booking.currency || "eur").toLowerCase(),
      customer: customerId,
      receipt_email: user.email,
      description: `Padel Court - ${locationName} · ${courtName} · ${durationMinutes} Min`,
      automatic_payment_methods: { enabled: true },
      // Same keys the checkout session sets — the webhook reads these verbatim.
      metadata: {
        booking_id: booking.id,
        location_id: booking.location_id,
        court_id: booking.court_id,
        start_time: booking.start_time,
        end_time: booking.end_time,
        duration_minutes: durationMinutes.toString(),
        owner_amount_cents: amountCents.toString(),
        user_id: user.id,
        flow: "native_sheet",
        ...(appliedVoucherId ? { voucher_id: appliedVoucherId } : {}),
      },
    }, { idempotencyKey: `pi_${booking.id}_${amountCents}` });

    logStep("PaymentIntent created", { intentId: intent.id, amountCents, mode: stripeCreds.mode });

    return json({
      publishable_key: publishableKey,
      client_secret: intent.client_secret,
      customer_id: customerId,
      ephemeral_key: ephemeralKey.secret,
      amount_cents: amountCents,
      test_mode: stripeCreds.mode === "test",
    });
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    logStep("ERROR", { message });
    return json({ error: message }, 500);
  }
});
