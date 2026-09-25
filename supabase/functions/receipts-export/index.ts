import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { buildPdf, type Receipt, type Biller } from "../_shared/receiptPdf.ts";

/**
 * Alle Belege eines Zeitraums als ZIP: ein PDF je Beleg plus belege.csv.
 * Nur fuer Admins. Welche Betriebsart (Test oder Live) exportiert wird, sagt
 * der Aufrufer — die Datei traegt es im Namen, damit ein Testexport nie fuer
 * einen echten gehalten wird. Die PDFs entstehen hier wie beim
 * Einzelabruf frisch aus dem Beleg; ab 500 Stueck bitte den Zeitraum teilen,
 * die Funktion hat dafuer nicht die Laufzeit.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX = 500;

const berlinDate = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

const KIND: Record<string, string> = {
  booking: "Buchung", booking_refund: "Buchung (Korrektur)",
  marketplace_order: "Marketplace", marketplace_refund: "Marketplace (Korrektur)",
  lobby_share: "Lobby-Anteil", lobby_share_refund: "Lobby-Anteil (Korrektur)",
  event_ticket: "Event-Ticket", event_ticket_refund: "Event-Ticket (Korrektur)",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string; is_test?: boolean };
    const from = body.from ?? "", to = body.to ?? "";
    const isTest = body.is_test === true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      return json({ error: "Zeitraum fehlt oder ist ungültig (from/to als YYYY-MM-DD)" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Nicht angemeldet" }, 401);
    const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return json({ error: "Nicht angemeldet" }, 401);
    let isAdmin = user.email === "fsteinfelder@padel2go.eu";
    if (!isAdmin) {
      const { data: role } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      isAdmin = !!role;
    }
    if (!isAdmin) return json({ error: "Kein Zugriff" }, 403);

    const { data: billerRow } = await supabaseAdmin.from("billing_profile").select("*").eq("id", "global").maybeSingle();
    const biller = (billerRow ?? {}) as Biller;
    if (!biller.company_name) return json({ error: "Rechnungsangaben fehlen (Admin → Einstellungen → Rechnungsangaben)" }, 500);

    // Einen Tag Rand in beide Richtungen, danach exakt nach Berliner Datum filtern.
    const lo = new Date(`${from}T00:00:00Z`); lo.setUTCDate(lo.getUTCDate() - 1);
    const hi = new Date(`${to}T00:00:00Z`); hi.setUTCDate(hi.getUTCDate() + 2);
    const { data, error } = await supabaseAdmin
      .from("receipts")
      .select("*")
      .eq("is_test", isTest)
      .gte("issued_at", lo.toISOString())
      .lt("issued_at", hi.toISOString())
      .order("receipt_number", { ascending: true })
      .limit(MAX + 1);
    if (error) throw error;

    const receipts = ((data ?? []) as Receipt[]).filter((r) => {
      const d = berlinDate(r.issued_at);
      return d >= from && d <= to;
    });
    if (receipts.length === 0) return json({ error: "Keine Belege in diesem Zeitraum" }, 404);
    if (receipts.length > MAX) return json({ error: `Mehr als ${MAX} Belege — bitte den Zeitraum teilen` }, 413);

    const files: Record<string, Uint8Array> = {};
    for (const r of receipts) {
      files[`${r.receipt_number}.pdf`] = await buildPdf(r, biller);
    }

    const num = (c: number) => ((c ?? 0) / 100).toFixed(2).replace(".", ",");
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = "Belegnummer;Art;Datum;Leistungsdatum;Empfänger;Beschreibung;Brutto;Rabatt;Zahlbetrag;Netto;USt-Satz;USt-Betrag;Stripe-Gebühr;Währung";
    const lines = receipts.map((r) => [
      esc(r.receipt_number), esc(KIND[r.receipt_type] ?? r.receipt_type),
      berlinDate(r.issued_at).split("-").reverse().join("."),
      r.service_date ? r.service_date.split("-").reverse().join(".") : "",
      esc(r.recipient_name ?? r.recipient_email ?? ""), esc(r.description),
      num(r.gross_cents), num(r.discount_cents), num(r.paid_cents), num(r.net_cents),
      String(r.tax_rate ?? 0).replace(".", ","), num(r.tax_cents),
      num((r as unknown as { stripe_fee_cents?: number }).stripe_fee_cents ?? 0), esc(r.currency ?? "EUR"),
    ].join(";"));
    files["belege.csv"] = strToU8("\uFEFF" + [header, ...lines].join("\n"));

    const zipped = zipSync(files, { level: 6 });
    const buf = new ArrayBuffer(zipped.byteLength);
    new Uint8Array(buf).set(zipped);
    const filename = `p2g-belege${isTest ? "-TEST" : ""}-${from}_${to}.zip`;
    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Receipt-Count": String(receipts.length),
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[receipts-export]", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
