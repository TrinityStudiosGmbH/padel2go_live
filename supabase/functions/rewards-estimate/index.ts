import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EstimateRequest {
  booking_id?: string;
  price_cents?: number;
  start_time?: string;
  end_time?: string;
  court_id?: string;
}

interface RewardBreakdown {
  key: string;
  title: string;
  points: number;
  description?: string;
}

interface EstimateResponse {
  total_points: number;
  breakdown: RewardBreakdown[];
  disclaimers: string[];
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[payback-estimate] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData?.user;
    if (!user) throw new Error("User not authenticated");

    const requestData: EstimateRequest = await req.json();
    logStep("Processing estimate", { userId: user.id, booking_id: requestData.booking_id });

    // ── Determine booking duration in hours ──────────────────────────────
    let startTime = requestData.start_time;
    let endTime = requestData.end_time;
    let courtId = requestData.court_id;
    if (requestData.booking_id) {
      const { data: bk } = await supabaseAdmin
        .from("bookings")
        .select("court_id, start_time, end_time")
        .eq("id", requestData.booking_id)
        .maybeSingle();
      if (bk) {
        courtId = courtId ?? (bk as any).court_id;
        if (!startTime || !endTime) { startTime = (bk as any).start_time; endTime = (bk as any).end_time; }
      }
    }
    let durationMin = 60;
    if (startTime && endTime) {
      durationMin = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
    }
    const durationBucket = durationMin >= 120 ? 120 : durationMin >= 90 ? 90 : 60;

    // ── Feste Punktzahl je Dauer, aufgeloest von der Datenbank ────────────
    // Exakt dieselbe Funktion, die der Stripe-Webhook nach der Zahlung aufruft.
    // Damit kann die Vorschau nie etwas anderes versprechen als spaeter ankommt.
    let total_points = 0;
    let courtSport: string | null = null;
    if (courtId) {
      const { data: pointsData, error: pointsError } = await supabaseAdmin.rpc(
        "resolve_booking_points",
        { p_court_id: courtId, p_duration_minutes: durationBucket },
      );
      if (pointsError) {
        logStep("Points lookup failed — showing none", { error: pointsError.message });
      } else {
        total_points = Number(pointsData ?? 0) || 0;
      }

      const { data: courtRow } = await supabaseAdmin
        .from("courts")
        .select("sport")
        .eq("id", courtId)
        .maybeSingle();
      courtSport = ((courtRow as any)?.sport as string | null) ?? null;
    }
    const isTennis = courtSport === "tennis";

    const breakdown: RewardBreakdown[] = [];
    if (isTennis) {
      breakdown.push({
        key: "TENNIS_NO_PAYBACK",
        title: "Kein P2G-Payback",
        points: 0,
        description: "Tennis-Buchungen sammeln keine P2G-Punkte",
      });
    } else {
      breakdown.push({
        key: "BOOKING_PAYBACK",
        title: "Buchungs-Payback",
        points: total_points,
        description: `${durationBucket} Min Buchung`,
      });
    }

    const disclaimers: string[] = [];
    if (isTennis) {
      disclaimers.push("Für Tennis-Buchungen werden keine P2G-Punkte gesammelt.");
    } else if (total_points > 0) {
      disclaimers.push("Punkte werden nach Zahlung automatisch gutgeschrieben.");
    }

    const response: EstimateResponse = {
      total_points,
      breakdown,
      disclaimers,
    };
    logStep("Estimate complete", { total_points, durationBucket, courtSport });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    logStep("Error", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
