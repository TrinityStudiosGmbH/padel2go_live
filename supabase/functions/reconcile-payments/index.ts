import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveStripe, stripeFeeCents } from "../_shared/stripe.ts";
import {
  resolveResendKey, brandedEmailHtml, sendBrandedEmail, INTERNAL_INBOX,
} from "../_shared/email.ts";

/**
 * Abgleich mit Stripe: findet bezahlte Vorgaenge, die nie verbucht wurden.
 *
 * Der Webhook ist der einzige Weg, auf dem eine Zahlung zur Buchung oder
 * Bestellung wird. Stripe stellt drei Tage lang erneut zu, das faengt jede
 * voruebergehende Stoerung ab. Was es NICHT abfaengt: ein dauerhaft falsch
 * eingetragener Endpunkt, ein fehlendes Ereignis in der Stripe-Konfiguration,
 * ein Fehler, der jede Zustellung gleichermassen scheitern laesst. Dann liegt
 * das Geld bei Stripe, der Kunde hat nichts, und es faellt niemandem auf.
 *
 * Diese Funktion meldet solche Faelle — sie verbucht und erstattet BEWUSST
 * nichts. Verbuchen ist im Webhook mit Sperren, Einzelgewinner-Logik und
 * automatischer Rueckerstattung sorgfaeltig geloest; ein zweiter Weg dorthin
 * waere genau die Art von Dopplung, die frueher oder spaeter auseinanderlaeuft.
 * Aus einem stillen Verlust wird so ein sichtbarer Hinweis, auf den jemand
 * innerhalb von Minuten reagieren kann.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const log = (step: string, d?: Record<string, unknown>) =>
  console.log(`[reconcile-payments] ${step}`, d ? JSON.stringify(d) : "");

interface Finding {
  art: "Buchung" | "Bestellung";
  id: string;
  referenz: string;
  betragCent: number;
  bezahltAm: string;
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Nur der Zeitplan darf das ausloesen — dasselbe Geheimnis wie bei den
  // Match-Erinnerungen, ersatzweise der Service-Schluessel.
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const ok = (cronSecret && auth === `Bearer ${cronSecret}`) || (serviceKey && auth === `Bearer ${serviceKey}`);
  if (!ok) return json({ error: "Unauthorized" }, 401);

  try {
    const { secretKey, mode } = await resolveStripe(supabaseAdmin);
    const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });

    // Fenster: 6 Stunden zurueck, aber fruehestens 30 Minuten alt. Alles
    // Juengere kann noch voellig regulaer unterwegs sein — Stripe stellt nicht
    // in derselben Sekunde zu, und der Webhook braucht seine Zeit.
    const now = Date.now();
    const von = new Date(now - 6 * 60 * 60 * 1000).toISOString();
    const bis = new Date(now - 30 * 60 * 1000).toISOString();

    const findings: Finding[] = [];

    // ── Buchungen: bezahlt laut Stripe, aber nicht bestaetigt ────────────────
    // Ueber die payments-Zeile, die create-checkout-session anlegt — sie
    // verknuepft Buchung und Stripe-Sitzung direkt. Die Sitzungsliste von
    // Stripe durchzugehen waere unzuverlaessig und teuer.
    const { data: offeneZahlungen } = await supabaseAdmin
      .from("payments")
      .select("booking_id, stripe_checkout_session_id, amount_total_cents, created_at, status")
      .eq("status", "pending")
      .not("stripe_checkout_session_id", "is", null)
      .not("booking_id", "is", null)
      .gte("created_at", von)
      .lte("created_at", bis)
      .limit(200);

    for (const z of (offeneZahlungen ?? []) as {
      booking_id: string; stripe_checkout_session_id: string; amount_total_cents: number | null;
    }[]) {
      // Ist die Buchung inzwischen doch bestaetigt, ist alles in Ordnung.
      const { data: bk } = await supabaseAdmin
        .from("bookings")
        .select("status")
        .eq("id", z.booking_id)
        .maybeSingle();
      if ((bk as { status?: string } | null)?.status === "confirmed") continue;

      try {
        const s = await stripe.checkout.sessions.retrieve(z.stripe_checkout_session_id);
        if (s.payment_status === "paid") {
          findings.push({
            art: "Buchung", id: z.booking_id, referenz: z.stripe_checkout_session_id,
            betragCent: s.amount_total ?? z.amount_total_cents ?? 0,
            bezahltAm: new Date((s.created ?? 0) * 1000).toISOString(),
            status: `bezahlt, Buchung steht auf ${(bk as { status?: string } | null)?.status ?? "unbekannt"}`,
          });
        }
      } catch (e) {
        log("Sitzung nicht lesbar", { bookingId: z.booking_id, error: (e as Error).message });
      }
    }

    // ── Bestellungen: bezahlt laut Stripe, aber nicht verbucht ───────────────
    const { data: offeneOrders } = await supabaseAdmin
      .from("marketplace_redemptions")
      .select("id, reference_code, status, amount_cents, stripe_session_id, created_at")
      .eq("status", "pending")
      .not("stripe_session_id", "is", null)
      .gte("created_at", von)
      .lte("created_at", bis)
      .limit(200);

    for (const o of (offeneOrders ?? []) as {
      id: string; reference_code: string | null; amount_cents: number | null; stripe_session_id: string;
    }[]) {
      try {
        const s = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
        if (s.payment_status === "paid") {
          findings.push({
            art: "Bestellung", id: o.id, referenz: o.reference_code ?? o.stripe_session_id,
            betragCent: s.amount_total ?? o.amount_cents ?? 0,
            bezahltAm: new Date((s.created ?? 0) * 1000).toISOString(),
            status: "bezahlt, aber nicht verbucht",
          });
        }
      } catch (e) {
        log("Sitzung nicht lesbar", { orderId: o.id, error: (e as Error).message });
      }
    }

    // ── Stripe-Gebuehren nachtragen ──────────────────────────────────────────
    // Belege, die vor der Erfassung entstanden sind oder bei denen der Abruf im
    // Webhook leer blieb. Hoechstens 40 je Lauf, das reicht bei 48 Laeufen am Tag.
    let nachgetragen = 0;
    const { data: ohneGebuehr } = await supabaseAdmin
      .from("receipts")
      .select("id, receipt_type, source_id")
      .eq("stripe_fee_cents", 0)
      .gt("paid_cents", 0)
      .in("receipt_type", ["booking", "marketplace_order", "lobby_share"])
      .order("issued_at", { ascending: false })
      .limit(40);
    for (const r of (ohneGebuehr ?? []) as { id: string; receipt_type: string; source_id: string }[]) {
      let intentId: string | null = null;
      try {
        if (r.receipt_type === "booking") {
          const { data: pay } = await supabaseAdmin.from("payments").select("stripe_payment_intent_id").eq("booking_id", r.source_id).maybeSingle();
          intentId = (pay as { stripe_payment_intent_id?: string } | null)?.stripe_payment_intent_id ?? null;
        } else if (r.receipt_type === "marketplace_order") {
          const { data: ord } = await supabaseAdmin.from("marketplace_redemptions").select("stripe_session_id").eq("id", r.source_id).maybeSingle();
          const sid = (ord as { stripe_session_id?: string } | null)?.stripe_session_id;
          if (sid) {
            const s = await stripe.checkout.sessions.retrieve(sid);
            intentId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
          }
        } else if (r.receipt_type === "lobby_share") {
          const { data: lm } = await supabaseAdmin.from("lobby_members").select("payment_intent_id").eq("id", r.source_id).maybeSingle();
          intentId = (lm as { payment_intent_id?: string } | null)?.payment_intent_id ?? null;
        }
        const fee = await stripeFeeCents(stripe, intentId);
        if (fee > 0) {
          await supabaseAdmin.from("receipts").update({ stripe_fee_cents: fee }).eq("id", r.id);
          nachgetragen++;
        }
      } catch (e) {
        log("Gebuehr nicht ermittelbar", { receiptId: r.id, error: (e as Error).message });
      }
    }

    log("Abgleich fertig", { mode, gefunden: findings.length, gebuehrenNachgetragen: nachgetragen });

    if (findings.length === 0) {
      return json({ ok: true, mode, findings: 0 });
    }

    // Gefunden heisst: jemand muss hinschauen. Eine Mail an den internen
    // Posteingang, mehr macht diese Funktion bewusst nicht.
    const resendKey = await resolveResendKey(supabaseAdmin);
    if (resendKey) {
      const rows = findings.map((f) => ({
        label: `${f.art} ${f.referenz}`,
        value: `${(f.betragCent / 100).toFixed(2).replace(".", ",")} € · ${f.status}`,
      }));
      const html = brandedEmailHtml({
        title: "Zahlungsabgleich",
        emoji: "⚠️",
        heading: `${findings.length} bezahlte Vorgänge ohne Verbuchung`,
        intro:
          "Der Abgleich mit Stripe hat Zahlungen gefunden, zu denen keine bestätigte Buchung " +
          "oder verbuchte Bestellung existiert. Das deutet auf einen Webhook hin, der nicht ankommt.",
        rows,
        note:
          `Betriebsart: ${mode}. Bitte in Stripe prüfen, ob der Endpunkt eingetragen ist und die ` +
          "Ereignisse checkout.session.completed, checkout.session.expired, payment_intent.succeeded " +
          "und charge.refunded abonniert sind.",
        internal: true,
      });
      await sendBrandedEmail(resendKey, INTERNAL_INBOX, `Zahlungsabgleich: ${findings.length} offene Fälle`, html);
      log("Hinweis verschickt", { an: INTERNAL_INBOX });
    }

    return json({ ok: true, mode, findings: findings.length, details: findings });
  } catch (err) {
    log("Fehler", { message: (err as Error).message });
    return json({ error: (err as Error).message }, 500);
  }
});
