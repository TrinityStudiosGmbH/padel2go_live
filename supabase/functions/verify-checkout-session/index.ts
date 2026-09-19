import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Wahrheit fuer die Erfolgsseite.
 *
 * Bisher zeigten /booking/success und /marketplace/success "Vielen Dank", weil
 * Stripe dorthin weitergeleitet hat — ungeprueft. Haengt der Webhook, sieht der
 * Kunde Erfolg, waehrend die Bestellung offen bleibt und niemand sie bearbeitet.
 *
 * Diese Funktion fragt Stripe direkt und liest den Datenbankstand dazu. Sie
 * verbucht NICHTS: das bleibt allein beim Webhook, der die heiklen Sonderfaelle
 * kennt (bezahlt, aber Bestellung schon freigegeben -> Geld zurueck) und den
 * Stripe bis zu drei Tage lang erneut zustellt. Zwei Verbuchungswege waeren
 * genau die Art von Dopplung, die frueher oder spaeter auseinanderlaeuft.
 *
 * Zustaende:
 *   confirmed  Bezahlt und verbucht. Alles gut.
 *   processing Bezahlt, aber noch nicht verbucht. Kunde bekommt einen ehrlichen
 *              Hinweis statt eines falschen Haekchens; Geld ist sicher.
 *   open       Nicht bezahlt, Sitzung laeuft noch -> Link zum Weiterzahlen.
 *   expired    Nicht bezahlt, Sitzung abgelaufen.
 *   unknown    Sitzung unbekannt (falsche oder alte Adresse).
 */

const allowedOrigins = [
  "https://www.padel2go-official.com", "https://padel2go-official.com",
  "https://www.padel2go-official.de", "https://padel2go-official.de",
  "https://padel2go.lovable.app", "https://padel2go.de",
  "http://localhost:5173", "http://localhost:8080",
];

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin":
    origin && (allowedOrigins.includes(origin) || origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com") || origin.endsWith(".vercel.app"))
      ? origin
      : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const log = (step: string, details?: Record<string, unknown>) =>
  console.log(`[verify-checkout-session] ${step}`, details ? JSON.stringify(details) : "");

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req.headers.get("origin")) });

  try {
    const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string };
    if (!session_id || typeof session_id !== "string") {
      return new Response(JSON.stringify({ error: "session_id fehlt" }), { status: 400, headers });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      const { data: ic } = await supabaseAdmin
        .from("site_integration_configs").select("config").eq("service", "stripe").maybeSingle();
      stripeKey = (ic?.config as Record<string, string> | undefined)?.secret_key;
    }
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Zahlungsanbieter ist nicht konfiguriert" }), { status: 500, headers });
    }

    // Testmodus-Sitzungen (freigeschaltete Tester) kennt der Live-Key nicht.
    let session: Stripe.Checkout.Session | null = null;
    try {
      session = await new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" })
        .checkout.sessions.retrieve(session_id);
    } catch {
      const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
      if (testKey) {
        try {
          session = await new Stripe(testKey, { apiVersion: "2025-08-27.basil" })
            .checkout.sessions.retrieve(session_id);
        } catch { /* bleibt null */ }
      }
    }

    if (!session) {
      log("Sitzung unbekannt", { session_id });
      return new Response(JSON.stringify({ state: "unknown" }), { headers });
    }

    const paid = session.payment_status === "paid";
    const bookingId = session.metadata?.booking_id ?? null;
    const redemptionId = session.metadata?.redemption_id ?? null;

    // Nicht bezahlt: dem Kunden den Weg zurueck geben statt ihn im Dunkeln zu lassen.
    if (!paid) {
      const open = session.status === "open" && !!session.url;
      log("Nicht bezahlt", { session_id, status: session.status });
      return new Response(JSON.stringify({
        state: open ? "open" : "expired",
        resume_url: open ? session.url : null,
      }), { headers });
    }

    // Bezahlt — steht die Verbuchung schon in der Datenbank?
    if (redemptionId) {
      const { data: order } = await supabaseAdmin
        .from("marketplace_redemptions")
        .select("status, reference_code")
        .eq("id", redemptionId)
        .maybeSingle();

      const settled = order?.status === "success";
      log(settled ? "Marketplace verbucht" : "Marketplace bezahlt, noch offen", { redemptionId });
      return new Response(JSON.stringify({
        state: settled ? "confirmed" : "processing",
        kind: "marketplace",
        reference: order?.reference_code ?? null,
      }), { headers });
    }

    if (bookingId) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .maybeSingle();

      const settled = booking?.status === "confirmed";
      log(settled ? "Buchung verbucht" : "Buchung bezahlt, noch offen", { bookingId });
      return new Response(JSON.stringify({
        state: settled ? "confirmed" : "processing",
        kind: "booking",
        reference: bookingId,
      }), { headers });
    }

    // Bezahlt, aber ohne Zuordnung — sollte nie vorkommen.
    log("Bezahlt, aber keine Zuordnung in den Metadaten", { session_id });
    return new Response(JSON.stringify({ state: "processing", kind: null, reference: null }), { headers });
  } catch (err) {
    log("Fehler", { message: (err as Error).message });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers });
  }
});
