// Liefert die .ics-Datei einer Buchung aus — Ziel des "Apple Kalender"-Buttons in
// der Buchungsbestaetigung. Oeffentlich erreichbar, aber nur mit signiertem Token
// (siehe _shared/bookingIcs.ts). `?sample=1` liefert eine Demo-Datei fuer Testmails.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildBookingIcs, verifyBookingIcsToken } from "../_shared/bookingIcs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const icsResponse = (ics: string) =>
  new Response(ics, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="padel2go-booking.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });

const textResponse = (msg: string, status: number) =>
  new Response(msg, { status, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return textResponse("Method not allowed", 405);

  const url = new URL(req.url);

  if (url.searchParams.get("sample") === "1") {
    const start = new Date();
    start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
    start.setHours(18, 0, 0, 0);
    return icsResponse(buildBookingIcs({
      id: "sample-booking", start, end: new Date(start.getTime() + 90 * 60000),
      courtName: "Court 2 · Outdoor", locationName: "SkyPadel München", address: "Am Neudeck 10", city: "München",
    }));
  }

  const bookingId = url.searchParams.get("b") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!bookingId || !token || !(await verifyBookingIcsToken(bookingId, token))) {
    return textResponse("Ungültiger Link", 403);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, start_time, end_time, courts!inner(name), locations!inner(name, address, city)")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) return textResponse("Buchung nicht gefunden", 404);

  const court = (Array.isArray(booking.courts) ? booking.courts[0] : booking.courts) as { name: string };
  const location = (Array.isArray(booking.locations) ? booking.locations[0] : booking.locations) as
    { name: string; address?: string | null; city?: string | null };

  return icsResponse(buildBookingIcs({
    id: booking.id,
    start: new Date(booking.start_time),
    end: new Date(booking.end_time),
    courtName: court.name,
    locationName: location.name,
    address: location.address,
    city: location.city,
  }));
});
