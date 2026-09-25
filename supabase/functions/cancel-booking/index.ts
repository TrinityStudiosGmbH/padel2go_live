import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveResendKey, brandedEmailHtml, sendBrandedEmail } from "../_shared/email.ts";
import { resolveStripe } from "../_shared/stripe.ts";
import { CANCEL_CUTOFF_HOURS, cancelDeadline } from "../_shared/bookingPolicy.ts";

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
  console.log(`[CANCEL-BOOKING] ${step}${detailsStr}`);
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client for user auth; service client for writes (bypasses RLS).
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve the authenticated user from the Authorization JWT — required.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht angemeldet." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user?.id) {
      return new Response(JSON.stringify({ error: "Ungültige Sitzung." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Auth resolved", { userId: user.id });

    // Admins duerfen fremde Buchungen stornieren — und auch nach Spielbeginn,
    // denn genau das ist ein Kulanzfall. Ohne diesen Weg bliebe der Verwaltung
    // nur eine nackte Statusaenderung, bei der das Geld einbehalten wuerde.
    let isAdmin = user.email === "fsteinfelder@padel2go.eu";
    if (!isAdmin) {
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      isAdmin = !!roleRow;
    }
    logStep("Rolle", { isAdmin });

    const body = await req.json().catch(() => ({}));
    const bookingId: string | undefined = body?.booking_id;
    if (!bookingId) {
      return new Response(JSON.stringify({ error: "booking_id ist erforderlich." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Received booking_id", { bookingId });

    // Load the booking (service role, bypasses RLS).
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, status, start_time, credits_used, locations (name), courts (name)")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      logStep("Database error fetching booking", { error: bookingError.message });
      throw new Error("Buchung konnte nicht geladen werden.");
    }
    if (!booking) {
      return new Response(JSON.stringify({ error: "Buchung nicht gefunden." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership: the booking must belong to the authenticated user — ausser
    // die Verwaltung storniert im Namen eines Kunden oder eines Gastes.
    if (!isAdmin && booking.user_id !== user.id) {
      logStep("Access denied", { bookingUserId: booking.user_id, requestUserId: user.id });
      return new Response(JSON.stringify({ error: "Kein Zugriff auf diese Buchung." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotent: a booking already cancelled by a prior call (or the charge.refunded
    // webhook) needs no further work — the Stripe refund idempotency key already
    // prevented a double card refund and the RPC already returned the spent points.
    if (booking.status === "cancelled") {
      logStep("Booking already cancelled — idempotent success", { bookingId });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nur eine bestaetigte Buchung, und fuer den Kunden nur bis 24 Stunden vor
    // Spielbeginn — danach keine Erstattung, also auch keine Stornierung. Die
    // Verwaltung darf aus Kulanz jederzeit. Geprueft BEVOR Stripe angefasst
    // wird, damit nie erstattet wird, was nicht storniert werden darf.
    const deadline = cancelDeadline(booking.start_time);
    const withinFreeWindow = Date.now() < deadline.getTime();
    if (booking.status !== "confirmed" || (!withinFreeWindow && !isAdmin)) {
      const tooLate = booking.status === "confirmed" && !withinFreeWindow;
      logStep("Booking not cancellable", { status: booking.status, withinFreeWindow, deadline: deadline.toISOString() });
      return new Response(JSON.stringify({
        error: tooLate
          ? `Die kostenlose Stornierung ist nur bis ${CANCEL_CUTOFF_HOURS} Stunden vor Spielbeginn möglich. Diese Frist ist abgelaufen.`
          : "Diese Buchung kann nicht storniert werden.",
        code: tooLate ? "too_late" : "not_cancellable",
        cancel_deadline: deadline.toISOString(),
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REFUND FIRST ──────────────────────────────────────────────────────────
    // Load the payment for this booking. Only a completed card payment gets a Stripe
    // refund; a points-only / unpaid booking has no completed payment and skips this.
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("status, stripe_payment_intent_id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    let refundIssued = false;
    if (payment?.status === "completed" && payment.stripe_payment_intent_id) {
      // Modus und Schluessel kommen aus der gemeinsamen Aufloesung.
      const stripeKey = (await resolveStripe(supabaseAdmin)).secretKey;

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        // Schluessel am Zahlungsvorgang, nicht an der Buchung: ein wiederholter
        // Storno erzeugt weiterhin keine zweite Erstattung, aber zwei Zahlungen
        // auf dieselbe Buchung bleiben einzeln erstattbar.
        await stripe.refunds.create(
          { payment_intent: payment.stripe_payment_intent_id },
          { idempotencyKey: `bk_refund_${payment.stripe_payment_intent_id}` },
        );
        refundIssued = true;
        logStep("Stripe refund issued", { bookingId, paymentIntentId: payment.stripe_payment_intent_id });
      } catch (refundErr) {
        // Refund failed — do NOT cancel the booking. The user keeps the booking and can retry.
        logStep("Stripe refund failed — aborting cancel", { bookingId, error: (refundErr as Error).message });
        return new Response(JSON.stringify({ error: "Die Rückerstattung ist fehlgeschlagen. Die Buchung wurde nicht storniert. Bitte versuche es erneut." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── CANCEL + REFUND POINTS (atomic, single-winner) ────────────────────────
    // Only the call that flips confirmed -> cancelled returns the spent points to the
    // wallet, so this is safe against the charge.refunded webhook (which also flips to
    // cancelled but does NOT refund the spent points).
    const { data: cancelResult, error: cancelError } = isAdmin
      ? await supabaseAdmin.rpc("cancel_booking_admin", { p_booking_id: bookingId })
      : await supabaseAdmin.rpc("cancel_confirmed_booking", {
          p_booking_id: bookingId,
          p_user_id: user.id,
        });
    if (cancelError) {
      logStep("cancel_confirmed_booking RPC failed", { bookingId, error: cancelError.message });
      throw new Error("Die Buchung konnte nicht storniert werden.");
    }
    const row = Array.isArray(cancelResult) ? cancelResult[0] : cancelResult;
    const acted = (row as { acted?: boolean } | null)?.acted === true;
    const creditsRefunded = (row as { credits_refunded?: number } | null)?.credits_refunded ?? 0;

    if (!acted) {
      // The flip lost the race. If the booking is already cancelled (webhook / prior
      // call won), that is an idempotent success. Otherwise it is genuinely no longer
      // cancellable.
      const { data: fresh } = await supabaseAdmin
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .maybeSingle();
      if (fresh?.status === "cancelled") {
        logStep("RPC no-op but booking already cancelled — idempotent success", { bookingId });
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      logStep("Booking no longer cancellable", { bookingId, status: fresh?.status });
      return new Response(JSON.stringify({ error: "Diese Buchung kann nicht storniert werden." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Booking cancelled", { bookingId, creditsRefunded });

    // Wem die Stornierung mitgeteilt wird: dem Kunden. Bei einer Stornierung
    // durch die Verwaltung ist das jemand anderes als der Aufrufer — ohne diese
    // Unterscheidung bekaeme der Admin seine eigene Absage.
    const recipientUserId = booking.user_id ?? user.id;
    let recipientEmail: string | null = booking.user_id === user.id ? user.email ?? null : null;
    if (!recipientEmail) {
      if (booking.user_id) {
        const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(booking.user_id);
        recipientEmail = ownerData?.user?.email ?? null;
      } else {
        // Gastbuchung: die Adresse steht an der Buchung.
        const { data: guestRow } = await supabaseAdmin
          .from("bookings")
          .select("guest_email")
          .eq("id", bookingId)
          .maybeSingle();
        recipientEmail = (guestRow as { guest_email?: string } | null)?.guest_email ?? null;
      }
    }
    logStep("Empfaenger der Stornomitteilung", { recipientEmail, isAdmin });

    // Hat ein Vereinsmitglied Freikontingent verbraucht, gehen die Minuten zurück an den
    // Verein. Idempotent — eine bereits gutgeschriebene Buchung wird nicht doppelt erstattet.
    const { data: quotaRefunded, error: quotaError } = await supabaseAdmin.rpc("refund_member_quota", {
      p_booking_id: bookingId,
    });
    if (quotaError) {
      logStep("Member quota refund failed", { bookingId, error: quotaError.message });
    } else if (Number(quotaRefunded ?? 0) > 0) {
      logStep("Member quota refunded", { bookingId, minutes: quotaRefunded });
    }

    // ── Notify the user ───────────────────────────────────────────────────────
    try {
      const startDate = new Date(booking.start_time);
      const dateFormatted = startDate.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const timeFormatted = startDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const courtName = (booking.courts as unknown as { name: string } | null)?.name || "Court";
      const locationName = (booking.locations as unknown as { name: string } | null)?.name || "Standort";
      const creditsLine = creditsRefunded > 0
        ? ` ${creditsRefunded} Punkte wurden dir gutgeschrieben.`
        : "";
      await supabaseAdmin.from("notifications").insert({
        user_id: recipientUserId,
        type: "booking_cancelled",
        title: "Buchung storniert",
        message: `Deine Buchung auf ${courtName} (${locationName}) am ${dateFormatted} um ${timeFormatted} Uhr wurde storniert.${creditsLine}`,
        entity_type: "booking",
        entity_id: bookingId,
        cta_url: "/booking",
      });
      logStep("Cancellation notification sent", { userId: user.id });

      // Branded cancellation email (PADEL2GO design)
      const resendKey = await resolveResendKey(supabaseAdmin);
      if (resendKey && recipientEmail) {
        const refundNote = refundIssued
          ? "Der bezahlte Betrag wird auf dein Zahlungsmittel zurückerstattet."
          : creditsRefunded > 0
            ? `${creditsRefunded} Punkte wurden dir gutgeschrieben.`
            : "Wir hoffen, dich bald wieder auf dem Court zu sehen!";
        const html = brandedEmailHtml({
          title: "Buchung storniert",
          emoji: "🚫",
          heading: "Buchung storniert",
          intro: "Deine Court-Buchung wurde storniert.",
          rows: [
            { label: "Standort", value: locationName },
            { label: "Court", value: courtName },
            { label: "Datum", value: dateFormatted },
            { label: "Uhrzeit", value: `${timeFormatted} Uhr` },
          ],
          note: refundNote,
          ctaLabel: "Neue Buchung",
          ctaUrl: "https://www.padel2go-official.de/booking",
        });
        await sendBrandedEmail(resendKey, recipientEmail, "Deine Buchung wurde storniert", html);
        logStep("Cancellation email sent", { email: recipientEmail });
      }
    } catch (notifyErr) {
      logStep("Failed to send cancellation notification/email", { error: (notifyErr as Error).message });
    }

    // ── Reward claw-back ──────────────────────────────────────────────────────
    // Paid booking: the charge.refunded webhook already reverses earned rewards and
    // marks the payment refunded, so we do NOT reverse rewards here. Points-only /
    // unpaid booking: no Stripe refund was issued, so no webhook fires — fire the
    // bookingRefunded event ourselves to claw back any earned rewards.
    if (!refundIssued) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/rewards-trigger`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            event: "bookingRefunded",
            userId: user.id,
            bookingId,
            refundPercentage: 100,
          }),
        });
        logStep("Rewards reversal triggered (points-only/unpaid booking)", { userId: user.id, bookingId });
      } catch (rewardErr) {
        logStep("Failed to trigger rewards reversal", { error: (rewardErr as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
