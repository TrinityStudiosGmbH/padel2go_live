import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
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

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client for user auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    // Service client for writes
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve Stripe key: env var takes precedence, DB config is fallback
    let stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      const { data: ic } = await supabaseAdmin.from("site_integration_configs").select("config").eq("service", "stripe").single();
      stripeKey = (ic?.config as Record<string, string>)?.secret_key;
    }
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    // Try to resolve authenticated user — for guests this will return null
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

    // TEST MODE: allowlisted tester accounts check out against Stripe TEST mode
    // (sandbox cards like 4242 4242 4242 4242) — everyone else stays on the live key.
    {
      const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
      const testEmails = (Deno.env.get("STRIPE_TEST_USER_EMAILS") ?? "")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (testKey && user?.email && testEmails.includes(user.email.toLowerCase())) {
        stripeKey = testKey;
        logStep("TEST MODE checkout (sandbox key)", { email: user.email });
      }
    }

    const body = await req.json();
    const { booking_id, voucher_id } = body;
    // Court bookings are MONEY-ONLY: P2G points are never redeemable for court
    // bookings (only for marketplace equipment). Force to 0 so the reserve_points
    // block below stays inert — no points discount, no reserved points, no
    // points-only free path — regardless of any points_to_use sent by the client.
    const pointsToUse = 0;
    if (!booking_id) throw new Error("booking_id is required");
    logStep("Received booking_id", { booking_id });

    // Fetch booking using service role (bypasses RLS) — works for both auth and guest
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(`
        *,
        locations (name, slug),
        courts (name)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError) {
      logStep("Database error fetching booking", { error: bookingError.message });
      throw new Error("Failed to fetch booking");
    }

    if (!booking) {
      logStep("Booking not found", { booking_id });
      throw new Error("Booking not found");
    }

    // Ownership check:
    //   - Authenticated booking → user_id must match JWT user
    //   - Guest booking (user_id IS NULL) → UUID is the credential, no user required
    const isGuestBooking = booking.user_id === null;
    if (!isGuestBooking) {
      if (!user) throw new Error("Authentication required for this booking");
      if (booking.user_id !== user.id) {
        logStep("Access denied", { booking_user_id: booking.user_id, request_user_id: user.id });
        throw new Error("Access denied");
      }
    } else {
      // Guest booking — must have guest_email stored on record
      if (!(booking as any).guest_email) throw new Error("Guest booking is missing email");
      logStep("Guest booking access granted", { booking_id, guest_email: (booking as any).guest_email });
    }

    // Verify booking is in pending_payment status
    if (booking.status !== "pending_payment") {
      logStep("Invalid booking status", { status: booking.status });
      throw new Error(`Booking is not awaiting payment. Status: ${booking.status}`);
    }

    // Never sell a slot that already started (REQ-G06; opening hours themselves
    // are enforced by the enforce_booking_window trigger at INSERT time).
    if (new Date(booking.start_time).getTime() < Date.now() - 15 * 60 * 1000) {
      logStep("Booking start in the past", { booking_id, start_time: booking.start_time });
      throw new Error("Der gebuchte Zeitraum liegt in der Vergangenheit");
    }

    // Hold limit: max 3 active unpaid holds per authenticated user.
    // Guests are exempt — each guest booking is a one-off transaction.
    if (!isGuestBooking && user) {
      const now = new Date().toISOString();
      const { count: activeHolds, error: holdCountError } = await supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending_payment")
        .gt("hold_expires_at", now)
        .neq("id", booking_id);

      if (holdCountError) {
        logStep("Error checking active holds", { error: holdCountError.message });
      } else if ((activeHolds ?? 0) >= 10) {
        logStep("Hold limit exceeded", { userId: user.id, activeHolds });
        throw new Error("Buchungslimit erreicht: Du hast bereits 10 offene Reservierungen.");
      }

      // Daily confirmed booking cap: max 15 successful bookings per day (platform-wide).
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: dailyConfirmed, error: dailyError } = await supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("start_time", todayStart.toISOString());

      if (dailyError) {
        logStep("Error checking daily booking count", { error: dailyError.message });
      } else if ((dailyConfirmed ?? 0) >= 15) {
        logStep("Daily booking limit reached", { dailyConfirmed });
        throw new Error("Tageslimit erreicht: Für heute sind bereits alle 15 verfügbaren Slots gebucht. Bitte versuche es morgen erneut.");
      }
    }

    logStep("Booking verified", {
      booking_id: booking.id,
      status: booking.status,
      price_cents: booking.price_cents,
      court_id: booking.court_id
    });

    // Calculate duration
    const startTime = new Date(booking.start_time);
    const endTime = new Date(booking.end_time);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    // Preis UND Punkte-Faktor kommen aus resolve_booking_rate — der einzigen Wahrheit.
    // Greift ein Zeitfenster-Band, gewinnt dessen Preis; sonst der court_prices-Standard.
    // p_user_id: Vereinsmitglieder zahlen ihre Kondition (Heim/Fremd) statt des Externenpreises.
    // p_exclude_booking_id: DIESE Buchung darf sich beim Monatslimit nicht selbst mitzählen —
    // sonst fände der Checkout das Limit erschöpft und höbe den Preis nachträglich an.
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
      payback_points: number | null;
      price_band_name: string | null;
      court_sport: string | null;
      base_price_cents: number | null;
      member_club_id: string | null;
      member_scope: string | null;
      member_discount_cents: number | null;
    } | null;

    const priceCents: number | null = rate?.price_cents ?? null;
    const memberDiscountCents = Number(rate?.member_discount_cents ?? 0) || 0;

    // Sportart nie allein aus der Rate ableiten: liefert sie keine, wird sie am Court
    // gelesen — sie entscheidet über Payback UND erlaubte Buchungsdauer.
    let courtSport: string | null = rate?.court_sport ?? null;
    if (!courtSport) {
      const { data: courtRow } = await supabaseAdmin
        .from("courts")
        .select("sport")
        .eq("id", booking.court_id)
        .maybeSingle();
      courtSport = ((courtRow as any)?.sport as string | null) ?? null;
    }

    if (priceCents === null) {
      logStep("No price configured for duration", { duration: durationMinutes });
      throw new Error(`No price configured for duration (${durationMinutes} min)`);
    }

    // Tennis wird ausschließlich in 60-Minuten-Slots gespielt — eine abweichende Dauer
    // darf nicht still weiterberechnet werden.
    if (courtSport === "tennis" && durationMinutes !== 60) {
      logStep("Invalid tennis duration", { booking_id, duration: durationMinutes });
      throw new Error("Tennis-Plätze können nur für 60 Minuten gebucht werden");
    }

    logStep("Rate resolved", {
      court_id: booking.court_id,
      priceCents,
      basePriceCents: rate?.base_price_cents ?? null,
      memberScope: rate?.member_scope ?? null,
      memberDiscountCents,
      priceBand: rate?.price_band_name ?? null,
      paybackPoints: Number(rate?.payback_points ?? 0) || 0,
      courtSport,
    });

    // Kontingent-Buchung: claim_member_quota hat den Preis bereits auf 0 gesetzt und
    // Minuten aus dem Vereinskontingent verbucht. Der aufgelöste Preis darf das nicht
    // überschreiben — sonst würde eine bereits bezahlte Kontingent-Buchung erneut belastet.
    const isQuotaBooking = (booking as any).is_free_allocation === true;

    // Always charge the server-recomputed price — booking.price_cents may be client-inserted
    if (!isQuotaBooking && (
      booking.price_cents !== priceCents ||
      Number((booking as any).member_discount_cents ?? 0) !== memberDiscountCents
    )) {
      logStep("Booking price/member discount differs from server value — overriding", {
        bookingPriceCents: booking.price_cents,
        serverPriceCents: priceCents,
        memberDiscountCents,
      });
      await supabaseAdmin
        .from("bookings")
        .update({
          price_cents: priceCents,
          member_club_id: rate?.member_club_id ?? null,
          member_scope: rate?.member_scope ?? null,
          member_discount_cents: memberDiscountCents,
        })
        .eq("id", booking.id);
    }
    const totalPriceCents = isQuotaBooking ? 0 : priceCents;
    logStep("Price determined", { totalPriceCents, isQuotaBooking });

    // Serialize checkout per booking so only ONE attempt can ever hold a points reserve
    // on this booking. claim_checkout runs the check+set under one row-locked txn, so a
    // concurrent double-click loses here and is rejected BEFORE it releases/reserves
    // anything — it has no reserve to refund and cannot clobber the winner's reserve.
    const checkoutToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_checkout", {
      p_booking_id: booking.id,
      p_token: checkoutToken,
    });
    if (claimError || claimed !== true) {
      logStep("Checkout claim not granted", { bookingId: booking.id, error: claimError?.message });

      // Don't dead-end the user. Two recoverable cases:
      //  (1) the booking is already paid → tell them clearly (no new session);
      //  (2) a prior attempt (crash / abandoned redirect) left a STILL-OPEN Stripe
      //      session → send them straight to it to finish paying, instead of erroring.
      const { data: curBooking } = await supabaseAdmin
        .from("bookings")
        .select("status")
        .eq("id", booking.id)
        .maybeSingle();
      if (curBooking?.status === "confirmed") {
        return new Response(JSON.stringify({
          error: "Diese Buchung ist bereits bezahlt.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 });
      }

      try {
        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("stripe_checkout_session_id")
          .eq("booking_id", booking.id)
          .maybeSingle();
        if (existing?.stripe_checkout_session_id) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          const existingSession = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id);
          if (existingSession.status === "open" && existingSession.url) {
            logStep("Returning existing open checkout session", { bookingId: booking.id, sessionId: existingSession.id });
            return new Response(JSON.stringify({ url: existingSession.url }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
            });
          }
        }
      } catch (recoverErr) {
        logStep("Could not recover existing session", { error: (recoverErr as Error).message });
      }

      return new Response(JSON.stringify({
        error: "Ein Bezahlvorgang für diese Buchung läuft gerade. Bitte einige Sekunden warten und erneut versuchen.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 409,
      });
    }

    // Idempotency: release any reserve left over from a PRIOR checkout attempt on
    // this booking (payment retry / re-click). The booking stores only the latest
    // reserve, so without this a prior reserve is orphaned — permanently losing the
    // user's credits and leaking voucher uses. Atomic + safe no-op when nothing set.
    const { error: priorReleaseError } = await supabaseAdmin.rpc("release_booking_reserves", {
      p_booking_id: booking.id,
    });
    if (priorReleaseError) {
      // Abort rather than re-reserve on top of an unreleased prior reserve — that would
      // orphan the earlier credit/voucher hold (permanent loss). The user can retry.
      logStep("Failed to release prior reserves — aborting", { bookingId: booking.id, error: priorReleaseError.message });
      throw new Error("Buchung konnte nicht vorbereitet werden. Bitte versuche es erneut.");
    }

    let ownerPaymentCents = totalPriceCents;

    // Apply partial voucher discount if provided.
    // Fully-free vouchers (discount_type='free' or percentage=100) bypass Stripe via
    // voucher-redeem; this path handles percentage < 100 and fixed-amount codes.
    let appliedVoucherId: string | undefined;
    if (voucher_id) {
      const { data: voucher, error: vErr } = await supabaseAdmin
        .from("voucher_codes")
        .select("id, is_active, discount_type, discount_value, max_uses, current_uses, valid_from, valid_until")
        .eq("id", voucher_id)
        .single();

      if (!vErr && voucher && voucher.is_active) {
        const vNow = new Date();
        const validFrom = new Date(voucher.valid_from);
        const validUntil = voucher.valid_until ? new Date(voucher.valid_until) : null;
        const withinWindow = validFrom <= vNow && (!validUntil || validUntil > vNow);
        const hasUses = voucher.max_uses === null || voucher.current_uses < voucher.max_uses;

        if (withinWindow && hasUses) {
          // Soft-reserve a use slot atomically (same optimistic-lock pattern as voucher-redeem)
          const { data: reserved } = await supabaseAdmin
            .from("voucher_codes")
            .update({ current_uses: voucher.current_uses + 1 })
            .eq("id", voucher.id)
            .eq("current_uses", voucher.current_uses)
            .select("id");

          if (reserved && reserved.length > 0) {
            const dt: string = voucher.discount_type ?? "free";
            const dv: number = voucher.discount_value ?? 0;
            const before = ownerPaymentCents;

            if (dt === "percentage" && dv > 0 && dv < 100) {
              ownerPaymentCents = Math.max(0, Math.ceil(ownerPaymentCents * (1 - dv / 100)));
            } else if (dt === "fixed" && dv > 0) {
              ownerPaymentCents = Math.max(0, ownerPaymentCents - dv);
            }

            // If the discount makes the price zero, release the reserve and reject —
            // fully-free vouchers must go through voucher-redeem (bypasses Stripe).
            if (ownerPaymentCents === 0) {
              await supabaseAdmin
                .from("voucher_codes")
                .update({ current_uses: voucher.current_uses })
                .eq("id", voucher.id)
                .eq("current_uses", voucher.current_uses + 1);
              throw new Error("Dieser Gutschein macht die Buchung kostenlos — bitte über 'Kostenlos buchen' einlösen");
            }

            // Stripe rejects charges under 50 cents. If a partial voucher leaves a
            // sub-minimum remainder, charge the 50-cent minimum (the voucher use is
            // still consumed) so checkout proceeds instead of Stripe erroring out.
            if (ownerPaymentCents < 50) {
              logStep("Voucher left sub-minimum remainder — clamping to Stripe 50c minimum", { before, after: ownerPaymentCents });
              ownerPaymentCents = 50;
            }

            appliedVoucherId = voucher.id;
            logStep("Voucher discount applied", { voucherId: voucher.id, dt, dv, before, after: ownerPaymentCents });
          } else {
            logStep("Voucher soft-reserve failed (concurrent use)", { voucherId: voucher_id });
          }
        } else {
          logStep("Voucher no longer valid at checkout time", { voucherId: voucher_id });
        }
      } else {
        logStep("Voucher not found or inactive", { voucherId: voucher_id });
      }
    }

    // ── Apply points discount (play spent first, then reward; auth users only) ─
    let appliedPlay = 0;
    let appliedReward = 0;
    if (pointsToUse > 0 && !isGuestBooking && user) {
      const { data: siteSettings } = await supabaseAdmin
        .from("site_settings")
        .select("feature_credits_payment_enabled, credits_payment_max_percent, credits_per_euro")
        .eq("id", "global")
        .single();

      const creditsEnabled = (siteSettings as any)?.feature_credits_payment_enabled ?? false;
      const maxPercent: number = (siteSettings as any)?.credits_payment_max_percent ?? 50;
      const creditsPerEuro: number = (siteSettings as any)?.credits_per_euro ?? 100;

      if (!creditsEnabled) {
        throw new Error("Punkte-Zahlung ist aktuell nicht aktiviert");
      }

      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("play_credits, reward_credits")
        .eq("user_id", user.id)
        .single();

      const availablePoints = (wallet?.play_credits ?? 0) + (wallet?.reward_credits ?? 0);

      // 100 points = 1 euro = 100 cents at the default rate → centsPerPoint = 100 / credits_per_euro
      const centsPerPoint = 100 / creditsPerEuro;
      const maxDiscountCents = Math.floor(ownerPaymentCents * maxPercent / 100);
      const requestedDiscountCents = Math.floor(pointsToUse * centsPerPoint);
      let actualDiscountCents = Math.min(
        requestedDiscountCents,
        maxDiscountCents,
        Math.floor(availablePoints * centsPerPoint),
      );
      // Never reserve points for a discount that can't actually be granted. Stripe
      // cannot charge a remainder in the (0,50)c band, so if applying the full
      // discount would leave such a remainder, trim the discount so exactly 50c
      // remains to be charged. A remainder of 0 — points cover the whole amount — is
      // fine and is handled by the free path below. Without this guard the user's
      // points are burned for a discount that is never delivered AND they are then
      // overcharged the 50c Stripe minimum on top. (Mirrors the pre-free-path clamp.)
      const remainderIfApplied = ownerPaymentCents - actualDiscountCents;
      if (remainderIfApplied > 0 && remainderIfApplied < 50) {
        actualDiscountCents = Math.max(0, ownerPaymentCents - 50);
      }
      const appliedPoints = Math.ceil(actualDiscountCents / centsPerPoint);

      if (appliedPoints > 0) {
        // Atomic reserve — spends play first, then reward, never overdrawing.
        const { data: spent, error: reserveError } = await supabaseAdmin.rpc("reserve_points", {
          p_user_id: user.id,
          p_amount: appliedPoints,
        });
        const row = Array.isArray(spent) ? spent[0] : spent;
        const playSpent = (row as any)?.play_spent ?? 0;
        const rewardSpent = (row as any)?.reward_spent ?? 0;

        if (reserveError || playSpent + rewardSpent === 0) {
          // Insufficient balance (or concurrent drain) — proceed with no discount.
          logStep("Points reserve returned nothing — no discount", { error: reserveError?.message });
        } else {
          appliedPlay = playSpent;
          appliedReward = rewardSpent;
          ownerPaymentCents -= actualDiscountCents;
          logStep("Points discount applied", {
            pointsToUse, appliedPoints, appliedPlay, appliedReward, actualDiscountCents, newPrice: ownerPaymentCents,
          });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Compensation: undo reserves if checkout cannot proceed after they were taken.
    // resetBooking=false is used when the persist LOST a concurrent race: the booking's
    // reserved_* columns then belong to the request that won, so we must refund only THIS
    // request's own wallet/voucher hold and never zero the winner's reserve.
    const releaseReserves = async (opts?: { resetBooking?: boolean }) => {
      const resetBooking = opts?.resetBooking !== false;
      if (resetBooking) {
        // Persist WON: reserved_credits / reserved_reward / reserved_voucher_id on the
        // booking row ARE this request's reserve. Refund via the idempotent RPC (mirrors
        // how marketplace releaseOrder uses release_marketplace_order) instead of a manual
        // refund_points + voucher decrement + column zero. The RPC refunds
        // reserved_credits->play + reserved_reward->reward, decrements the soft-reserved
        // voucher use, and zeroes the reserved_* columns — all row-locked and pending-only.
        // Because it refunds FROM the booking columns (not this request's in-memory
        // applied* values), it is a harmless no-op when the per-minute
        // cleanup_expired_bookings cron already released the same reserve via the same RPC
        // — so no double refund against the cron.
        const { error: releaseError } = await supabaseAdmin.rpc("release_booking_reserves", {
          p_booking_id: booking.id,
        });
        if (releaseError) {
          logStep("Failed to release booking reserves", { bookingId: booking.id, error: releaseError.message });
        } else {
          logStep("Booking reserves released (idempotent)", { bookingId: booking.id, play: appliedPlay, reward: appliedReward, voucherId: appliedVoucherId ?? null });
        }
        // release_booking_reserves deliberately does NOT clear the checkout claim (it is
        // also called at start-of-request to refund a PRIOR reserve, where clearing would
        // drop the winner's fresh claim). Clear it here so a legitimate sequential retry
        // can re-claim immediately (no 2-minute staleness wait).
        await supabaseAdmin
          .from("bookings")
          .update({ checkout_claim: null, checkout_claimed_at: null })
          .eq("id", booking.id);
        return;
      }
      // Persist LOST: this request debited the wallet + soft-reserved the voucher but never
      // wrote them onto the booking row (the reserved_* columns belong to the winning
      // request), so refund only THIS request's own orphaned wallet debit and release its
      // own voucher soft-reserve; never touch the booking columns.
      if ((appliedPlay > 0 || appliedReward > 0) && user) {
        const { error: refundError } = await supabaseAdmin.rpc("refund_points", {
          p_user_id: user.id,
          p_play: appliedPlay,
          p_reward: appliedReward,
        });
        if (refundError) {
          logStep("Failed to refund reserved points", { userId: user.id, error: refundError.message });
        } else {
          logStep("Reserved points refunded", { userId: user.id, play: appliedPlay, reward: appliedReward });
        }
      }
      if (appliedVoucherId) {
        const { data: vData } = await supabaseAdmin
          .from("voucher_codes")
          .select("current_uses")
          .eq("id", appliedVoucherId)
          .single();
        if (vData && vData.current_uses > 0) {
          await supabaseAdmin
            .from("voucher_codes")
            .update({ current_uses: vData.current_uses - 1 })
            .eq("id", appliedVoucherId)
            .eq("current_uses", vData.current_uses); // optimistic lock
          logStep("Voucher soft reserve released", { voucherId: appliedVoucherId });
        }
      }
    };

    // Persist reserves on the booking so the webhook and auto-cancel cron can settle
    // or refund them. Guard on status so we never write a reserve onto a booking that
    // was confirmed/cancelled concurrently (that reserve would later be wrongly refunded).
    // Also guard on reserved_*=0 / reserved_voucher_id IS NULL so only ONE writer wins:
    // two concurrent requests each pass the no-op start release and each debit the wallet
    // via reserve_points (which has no per-booking idempotency), but the booking stores a
    // single last-writer-wins reserve — without this guard the loser's debit is orphaned
    // and never refunded (permanent points loss). The start release_booking_reserves
    // always zeroes these columns, so a legitimate (sequential) request/retry still passes.
    const { data: persisted, error: reserveUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({ reserved_credits: appliedPlay, reserved_reward: appliedReward, reserved_voucher_id: appliedVoucherId ?? null })
      .eq("id", booking.id)
      .eq("status", "pending_payment")
      .eq("reserved_credits", 0)
      .eq("reserved_reward", 0)
      .is("reserved_voucher_id", null)
      .select("id");

    if (reserveUpdateError || !persisted || persisted.length === 0) {
      logStep("Failed to persist reserves on booking (no longer pending or a concurrent reserve won)", {
        error: reserveUpdateError?.message,
        rows: persisted?.length ?? 0,
      });
      // Refund only THIS request's own wallet/voucher hold; do NOT zero the booking's
      // reserved_* — if a concurrent request won the persist, those columns are its
      // reserve and zeroing them here would strand ITS credits instead.
      await releaseReserves({ resetBooking: false });
      throw new Error("Buchung konnte nicht aktualisiert werden. Bitte versuche es erneut.");
    }

    // ── Full-coverage path: points (or a 0-price booking) cover the whole amount ──
    // Confirm without Stripe. Mirrors the webhook's confirmed-booking branch and the
    // free voucher-redeem flow: settle → award → rewards trigger → confirmation email.
    if (ownerPaymentCents <= 0) {
      // Single settle codepath (same RPC the webhook uses): confirm + finalize
      // credits_used from the LOCKED reserved_credits, only if still pending_payment.
      // Returns false for a booking a concurrent call already settled — never award twice.
      const { data: settled, error: settleError } = await supabaseAdmin.rpc("settle_booking_reserves", {
        p_booking_id: booking.id,
      });
      if (settleError) {
        logStep("Free path: settle failed — releasing reserves", { bookingId: booking.id, error: settleError.message });
        await releaseReserves();
        throw new Error("Buchung konnte nicht bestätigt werden. Bitte versuche es erneut.");
      }
      if (settled !== true) {
        // This settle lost the race. Either (a) a concurrent request already confirmed
        // the booking — its settle finalized credits_used from the booking's reserved_*,
        // so THIS request's own reserve_points debit is redundant: it was never finalized
        // onto the booking and (no Stripe session, status now 'confirmed' so the cron
        // no-ops) never refunded — leaving the user's points silently lost; or (b) the
        // auto-cancel cron already cancelled + refunded via release_booking_reserves.
        // Re-read status to tell them apart: refund only in case (a); refunding in case
        // (b) would double-credit the wallet.
        const { data: current } = await supabaseAdmin
          .from("bookings")
          .select("status")
          .eq("id", booking.id)
          .single();
        if (current?.status === "confirmed" && (appliedPlay > 0 || appliedReward > 0) && user) {
          const { error: refundError } = await supabaseAdmin.rpc("refund_points", {
            p_user_id: user.id,
            p_play: appliedPlay,
            p_reward: appliedReward,
          });
          if (refundError) {
            logStep("Free path: failed to refund redundant reserve after lost settle race", { userId: user.id, error: refundError.message });
          } else {
            logStep("Free path: refunded redundant reserve after lost settle race", { userId: user.id, play: appliedPlay, reward: appliedReward });
          }
        } else {
          logStep("Free path: already settled/cancelled — no refund needed", { bookingId: booking.id, status: current?.status });
        }
        return new Response(JSON.stringify({ url: null, free: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      logStep("Free path: booking confirmed via points", { bookingId: booking.id, appliedPlay, appliedReward });

      // A PRIOR partial-payment attempt on this same booking may have left a still-payable
      // Stripe Checkout session (+ pending payment row) behind. Points now cover the whole
      // amount and the booking is confirmed for free, so expire that leftover session —
      // otherwise the user could still complete it (back button / second tab) within its
      // 30-min window and be charged real cash for an already-free booking, and the webhook
      // would then find the booking already confirmed (settle → false) and never refund.
      // Best-effort: if the session was already completed/expired, expire() throws — swallow.
      try {
        const { data: priorPayment } = await supabaseAdmin
          .from("payments")
          .select("id, stripe_checkout_session_id, status")
          .eq("booking_id", booking.id)
          .maybeSingle();
        if (priorPayment?.stripe_checkout_session_id && priorPayment.status === "pending") {
          try {
            const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
            await stripe.checkout.sessions.expire(priorPayment.stripe_checkout_session_id);
            logStep("Free path: expired leftover Stripe session", { sessionId: priorPayment.stripe_checkout_session_id });
          } catch (expireErr) {
            logStep("Free path: could not expire leftover Stripe session (already completed/expired?)", { error: (expireErr as Error).message });
          }
          await supabaseAdmin
            .from("payments")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", priorPayment.id);
        }
      } catch (cleanupErr) {
        logStep("Free path: leftover session cleanup failed", { error: (cleanupErr as Error).message });
      }

      // Kein Payback auf dem kostenlosen Weg. Punkte gibt es nur fuer tatsaechlich
      // gezahltes Geld; hier ist der Betrag 0, weil Punkte, ein Gutschein oder ein
      // Vereinskontingent alles gedeckt haben. Die Gutschrift fuer bezahlte Buchungen
      // passiert ausschliesslich im Stripe-Webhook.

      // Record voucher redemption if a partial-discount voucher was also applied.
      if (appliedVoucherId) {
        await supabaseAdmin.from("voucher_redemptions").insert({
          voucher_id: appliedVoucherId,
          booking_id: booking.id,
          user_id: user?.id ?? "",
        });
        logStep("Free path: voucher redemption recorded", { voucherId: appliedVoucherId, bookingId: booking.id });
      }

      // Confirmation email — same call as the webhook's owner/guest branches.
      // NOTE: BOOKING_PAID rewards are earned on the CASH charged (the webhook passes
      // session.amount_total). On the free path no cash is charged — points covered the
      // whole amount — so, exactly like the webhook's `&& priceCents` guard, we do NOT
      // fire the bookingPaid rewards trigger here. Firing it with the full price would
      // award reward points for money the user never paid.
      if (!isGuestBooking && user) {
        try {
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ booking_id: booking.id, user_id: user.id, payment_type: "owner", amount_cents: 0 }),
          });
          if (!emailResp.ok) {
            logStep("Free path: owner confirmation FAILED", { status: emailResp.status, body: await emailResp.text().catch(() => "") });
          } else {
            logStep("Free path: owner confirmation email triggered", { userId: user.id });
          }
        } catch (emailErr) {
          logStep("Free path: failed to send owner confirmation", { error: (emailErr as Error).message });
        }
      } else if (isGuestBooking) {
        try {
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({
              booking_id: booking.id,
              guest_email: (booking as any).guest_email,
              guest_name: (booking as any).guest_name || "Gast",
              payment_type: "owner",
              amount_cents: 0,
            }),
          });
          if (!emailResp.ok) {
            logStep("Free path: guest confirmation FAILED", { status: emailResp.status, body: await emailResp.text().catch(() => "") });
          } else {
            logStep("Free path: guest confirmation email triggered", { guestEmail: (booking as any).guest_email });
          }
        } catch (emailErr) {
          logStep("Free path: failed to send guest confirmation", { error: (emailErr as Error).message });
        }
      }

      return new Response(JSON.stringify({ url: null, free: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Remainder > 0 → charge it via Stripe (respect the 50-cent minimum).
    ownerPaymentCents = Math.max(50, ownerPaymentCents);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Resolve email for Stripe checkout
    const effectiveEmail = isGuestBooking
      ? (booking as any).guest_email as string
      : (user!.email as string);

    // Check for existing Stripe customer (only for authenticated users)
    let customerId: string | undefined;
    if (!isGuestBooking) {
      const customers = await stripe.customers.list({ email: effectiveEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Existing Stripe customer found", { customerId });
      }
    }

    if (!origin) {
      throw new Error("Origin header is missing — cannot build success/cancel URLs.");
    }
    const requestOrigin = origin;
    const locationName = (booking.locations as { name: string })?.name || "Court";
    const courtName = (booking.courts as { name: string })?.name || "";

    // Build description
    const description = `${courtName} • ${durationMinutes} Minuten • ${startTime.toLocaleDateString('de-DE')} ${startTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;

    // Session expires in 30 minutes — keeps the court slot hold short
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

    // Create Stripe Checkout Session
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : effectiveEmail,
        payment_method_types: ["card", "paypal"],
        expires_at: sessionExpiresAt,
        line_items: [
          {
            price_data: {
              currency: booking.currency || "eur",
              product_data: {
                name: `Padel Court - ${locationName}`,
                description,
              },
              unit_amount: ownerPaymentCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${requestOrigin}/booking/success?session_id={CHECKOUT_SESSION_ID}${isGuestBooking ? "&guest=1" : ""}`,
        cancel_url: `${requestOrigin}/booking/cancel?booking_id=${booking_id}`,
        metadata: {
          booking_id: booking.id,
          location_id: booking.location_id,
          court_id: booking.court_id,
          start_time: booking.start_time,
          end_time: booking.end_time,
          duration_minutes: durationMinutes.toString(),
          owner_amount_cents: ownerPaymentCents.toString(),
          ...(isGuestBooking
            ? {
                is_guest: "1",
                guest_email: (booking as any).guest_email,
                guest_name: (booking as any).guest_name ?? "",
              }
            : { user_id: user!.id }),
          ...(appliedVoucherId ? { voucher_id: appliedVoucherId } : {}),
          ...(appliedPlay + appliedReward > 0 ? { points_used: (appliedPlay + appliedReward).toString() } : {}),
        },
      });
    } catch (stripeErr) {
      logStep("Stripe session creation failed — releasing reserves", { error: (stripeErr as Error).message });
      await releaseReserves();
      throw stripeErr;
    }

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Extend both hold_expires_at (read by the client countdown timer) and
    // expires_at to match the 30-minute Stripe session window.
    // Before this point hold_expires_at was set to only 15 min at booking creation;
    // we sync it here so the timer on the checkout page stays accurate.
    const expiresAtIso = new Date(sessionExpiresAt * 1000).toISOString();
    await supabaseAdmin
      .from("bookings")
      .update({ hold_expires_at: expiresAtIso, expires_at: expiresAtIso })
      .eq("id", booking.id)
      .eq("status", "pending_payment");
    logStep("Booking expiry set", { expiresAt: expiresAtIso });

    // Check for existing payment record and upsert
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (existingPayment) {
      // Update existing payment with new session
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({
          stripe_checkout_session_id: session.id,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id);

      if (updateError) {
        logStep("Payment record update failed", { error: updateError.message });
      } else {
        logStep("Existing payment record updated");
      }
    } else {
      // Create new payment record
      const { error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          booking_id: booking.id,
          user_id: isGuestBooking ? null : user!.id,
          stripe_checkout_session_id: session.id,
          amount_total_cents: ownerPaymentCents,
          currency: booking.currency || "EUR",
          status: "pending",
        });

      if (paymentError) {
        logStep("Payment record creation failed", { error: paymentError.message });
      } else {
        logStep("Payment record created");
      }
    }

    return new Response(JSON.stringify({ url: session.url }), {
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
