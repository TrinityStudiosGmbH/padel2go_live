import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    origin.endsWith(".lovable.app") ||
    origin.endsWith(".lovableproject.com") ||
    origin.endsWith(".vercel.app")
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowedOrigins[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const log = (step: string, details?: Record<string, unknown>) =>
  console.log(
    `[CREATE-GUEST-BOOKING] ${step}${details ? " - " + JSON.stringify(details) : ""}`
  );

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Rate limit (Sicherheitsaudit 2026-07-31, Fund 11) ─────────────────────
    // Unauthentifizierter Endpunkt, der Court-Slots 15 Min blockiert. Ohne Limit
    // ließen sich alle Slots dauerhaft blockieren (DoS). Max. 8 Holds / IP / Stunde.
    // Cloudflare setzt cf-connecting-ip serverseitig (nicht vom Client fälschbar);
    // Fallback auf x-forwarded-for nur, wenn der vertrauenswürdige Header fehlt.
    const clientIP =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
      "unknown";
    const GUEST_BOOKING_LIMIT = 8;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: rlCount } = await supabaseAdmin
      .from("rate_limit_log")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", clientIP)
      .eq("action", "guest_booking")
      .gte("created_at", windowStart);
    if (rlCount !== null && rlCount >= GUEST_BOOKING_LIMIT) {
      log("Rate limit exceeded", { clientIP, rlCount });
      return new Response(
        JSON.stringify({ error: "Zu viele Buchungsversuche. Bitte versuche es später erneut." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const {
      court_id,
      location_id,
      start_time,
      end_time,
      guest_name,
      guest_email,
      guest_phone,
    } = await req.json();

    // ── Input validation ─────────────────────────────────────────────────────
    if (!court_id || !location_id || !start_time || !end_time) {
      throw new Error("court_id, location_id, start_time, end_time are required");
    }
    if (!guest_name?.trim()) {
      throw new Error("guest_name is required");
    }
    if (!guest_email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest_email.trim())) {
      throw new Error("A valid guest_email is required");
    }

    log("Input validated", { court_id, location_id, start_time, end_time, guest_email });

    // ── Verify court is active and belongs to location ───────────────────────
    const { data: court, error: courtError } = await supabaseAdmin
      .from("courts")
      .select("id, is_active, location_id, sport")
      .eq("id", court_id)
      .eq("is_active", true)
      .maybeSingle();

    if (courtError || !court) {
      throw new Error("Court not found or inactive");
    }
    if (court.location_id !== location_id) {
      throw new Error("Court does not belong to this location");
    }

    // ── Calculate duration ────────────────────────────────────────────────────
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid start_time or end_time");
    }
    const durationMinutes = Math.round(
      (endDate.getTime() - startDate.getTime()) / 60000
    );
    if (durationMinutes <= 0 || durationMinutes > 240) {
      throw new Error(`Invalid booking duration: ${durationMinutes} min`);
    }
    // Tennis wird ausschließlich in 60-Minuten-Slots gespielt (Produktregel).
    if ((court as any).sport === "tennis" && durationMinutes !== 60) {
      throw new Error("Tennis-Plätze können nur für 60 Minuten gebucht werden");
    }

    // ── Booking window (REQ-G06): never in the past, never outside the
    // location's opening hours. Mirrors the authoritative DB trigger
    // enforce_booking_window, but with a readable error for the UI.
    if (startDate.getTime() < Date.now() - 15 * 60 * 1000) {
      throw new Error("Der gewählte Zeitraum liegt in der Vergangenheit");
    }
    const { data: locationRow } = await supabaseAdmin
      .from("locations")
      .select("is_24_7, opening_hours_json")
      .eq("id", location_id)
      .maybeSingle();
    if (locationRow && !locationRow.is_24_7 && locationRow.opening_hours_json) {
      const berlin = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Berlin",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = berlin.formatToParts(startDate);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const dayName = get("weekday").toLowerCase();
      const startMin = (parseInt(get("hour"), 10) % 24) * 60 + parseInt(get("minute"), 10);
      const endMin = startMin + durationMinutes;
      const hours = (locationRow.opening_hours_json as Record<string, { open?: string; close?: string }>)[dayName];
      if (!hours?.open || !hours?.close) {
        throw new Error("Der Standort ist an diesem Tag geschlossen");
      }
      const [oh, om] = hours.open.split(":").map(Number);
      const [ch, cm] = hours.close.split(":").map(Number);
      if (startMin < oh * 60 + om || endMin > ch * 60 + cm) {
        throw new Error(`Der gewählte Zeitraum liegt außerhalb der Öffnungszeiten (${hours.open}–${hours.close} Uhr)`);
      }
    }

    // ── Preis via resolve_booking_rate: Standort-Ausnahme bzw. Zeitfenster vor Standardpreis ──
    const { data: rateData, error: rateError } = await supabaseAdmin.rpc("resolve_booking_rate", {
      p_court_id: court_id,
      p_start: start_time,
      p_duration_minutes: durationMinutes,
    });

    if (rateError) {
      log("Error resolving booking rate", { error: rateError.message });
    }

    const rate = (Array.isArray(rateData) ? rateData[0] : rateData) as {
      price_cents: number | null;
      price_band_name: string | null;
    } | null;
    const priceCents: number | null = rate?.price_cents ?? null;

    if (!priceCents) {
      throw new Error(`No price configured for ${durationMinutes}-minute slot`);
    }

    log("Rate resolved", { priceCents, priceBand: rate?.price_band_name ?? null });

    // ── Check for overlapping bookings ────────────────────────────────────────
    // We rely on the DB exclusion constraint (no_overlapping_bookings) to be the
    // final guard; do a quick pre-check here for a better error message.
    const { data: overlapping, error: overlapError } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("court_id", court_id)
      .in("status", ["pending_payment", "confirmed"])
      .lt("start_time", end_time)
      .gt("end_time", start_time)
      .limit(1);

    if (overlapError) {
      log("Overlap check error (non-fatal)", { error: overlapError.message });
    } else if (overlapping && overlapping.length > 0) {
      throw new Error("Dieser Zeitslot ist nicht mehr verfügbar");
    }

    // ── Insert guest booking ──────────────────────────────────────────────────
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: newBooking, error: insertError } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: null,
        location_id,
        court_id,
        start_time,
        end_time,
        status: "pending_payment",
        price_cents: priceCents,
        currency: "EUR",
        hold_expires_at: holdExpiresAt,
        payment_mode: "full",
        guest_name: guest_name.trim(),
        guest_email: guest_email.trim().toLowerCase(),
        guest_phone: guest_phone?.trim() || null,
      })
      .select("id, price_cents")
      .single();

    if (insertError) {
      log("Insert failed", { error: insertError.message, code: insertError.code });
      // Exclusion constraint = slot taken between our check and insert
      if (
        insertError.code === "23P01" ||
        insertError.message.includes("no_overlapping_bookings")
      ) {
        throw new Error("Dieser Zeitslot ist nicht mehr verfügbar");
      }
      throw new Error("Buchung konnte nicht angelegt werden");
    }

    log("Guest booking created", { bookingId: newBooking.id, priceCents });

    // Rate-Limit-Zähler protokollieren (Fund 11) — best effort, blockiert die Buchung nicht.
    await supabaseAdmin
      .from("rate_limit_log")
      .insert({ ip_address: clientIP, action: "guest_booking" })
      .then(({ error }) => error && log("rate_limit_log insert failed", { error: error.message }));

    return new Response(
      JSON.stringify({ booking_id: newBooking.id, price_cents: newBooking.price_cents }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: {
        ...getCorsHeaders(req.headers.get("origin")),
        "Content-Type": "application/json",
      },
      status: 500,
    });
  }
});
