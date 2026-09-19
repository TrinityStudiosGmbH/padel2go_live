import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/**
 * Die Rechnung als PDF.
 *
 * Erzeugt wird sie bei jedem Abruf neu aus dem Beleg, nicht gespeichert. Der
 * Beleg ist unveraenderlich, also faellt jedes Mal dasselbe Dokument heraus —
 * das ist die Eigenschaft, auf die es ankommt, und sie kommt ohne Dateiablage
 * aus. Die Firmenangaben liegen in billing_profile und sind die einzige
 * Ausnahme: aendert sich die Anschrift, tragen alte Rechnungen die neue. Fuer
 * eine UG mit einem Sitz ist das vertretbar; waere es das nicht, muesste der
 * Absender mit auf den Beleg eingefroren werden.
 *
 * Zwei Wege hinein:
 *   - Angemeldet: Authorization-Header, der Beleg muss dem Nutzer gehoeren.
 *   - Gast: access_token aus dem Link in der Bestaetigungsmail.
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
});

interface Receipt {
  id: string;
  receipt_number: string;
  receipt_type: string;
  source_id: string;
  user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_address_line1: string | null;
  recipient_postal_code: string | null;
  recipient_city: string | null;
  recipient_country: string | null;
  description: string | null;
  gross_cents: number;
  discount_cents: number;
  paid_cents: number;
  net_cents: number;
  tax_rate: number;
  tax_cents: number;
  currency: string;
  issued_at: string;
  service_date: string | null;
}

interface Biller {
  company_name: string; address_line1: string; postal_code: string; city: string;
  country: string; vat_id: string; tax_number: string; register_court: string;
  register_number: string; managing_directors: string; email: string; phone: string;
  website: string; bank_name: string; iban: string; bic: string;
}

const money = (cents: number): string =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format((cents || 0) / 100) + " EUR";

const dateDE = (iso: string | null): string =>
  iso ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(iso)) : "-";

const isRefund = (t: string) => t.endsWith("_refund");

function buildPdf(r: Receipt, b: Biller): Promise<Uint8Array> {
  return (async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const INK = rgb(0.09, 0.09, 0.11);
    const MUTED = rgb(0.42, 0.42, 0.46);
    const LINE = rgb(0.83, 0.83, 0.86);
    const L = 56;          // linker Rand
    const R = 595.28 - 56; // rechter Rand
    let y = 790;

    const put = (
      text: string,
      x: number,
      yy: number,
      opts: { size?: number; font?: typeof reg; color?: typeof INK; align?: "left" | "right" } = {},
    ) => {
      const size = opts.size ?? 9.5;
      const font = opts.font ?? reg;
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: opts.align === "right" ? x - w : x,
        y: yy,
        size,
        font,
        color: opts.color ?? INK,
      });
    };

    const rule = (yy: number) =>
      page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.7, color: LINE });

    // ── Kopf: Absender ────────────────────────────────────────────────────────
    put(b.company_name, L, y, { size: 15, font: bold });
    y -= 15;
    for (const line of [b.address_line1, `${b.postal_code} ${b.city}`.trim(), b.country]) {
      if (line) { put(line, L, y, { size: 9, color: MUTED }); y -= 11.5; }
    }

    // ── Titel ────────────────────────────────────────────────────────────────
    const title = isRefund(r.receipt_type) ? "Korrekturrechnung" : "Rechnung";
    put(title, R, 790, { size: 20, font: bold, align: "right" });
    put(r.receipt_number, R, 770, { size: 10.5, font: bold, align: "right" });

    // ── Empfaenger ───────────────────────────────────────────────────────────
    y = 690;
    put("RECHNUNG AN", L, y, { size: 7.5, font: bold, color: MUTED });
    y -= 15;
    const to = [
      r.recipient_name,
      r.recipient_address_line1,
      [r.recipient_postal_code, r.recipient_city].filter(Boolean).join(" ") || null,
      r.recipient_address_line1 ? r.recipient_country : null,
      r.recipient_email,
    ].filter((v): v is string => !!v && v.trim().length > 0);
    if (to.length === 0) to.push("-");
    for (const line of to) { put(line, L, y, { size: 10 }); y -= 13; }

    // ── Eckdaten rechts ──────────────────────────────────────────────────────
    let my = 690;
    const meta: [string, string][] = [
      ["Rechnungsdatum", dateDE(r.issued_at)],
      ["Leistungsdatum", r.service_date ? dateDE(r.service_date) : dateDE(r.issued_at)],
      ["Rechnungsnummer", r.receipt_number],
    ];
    if (b.vat_id) meta.push(["USt-IdNr.", b.vat_id]);
    else if (b.tax_number) meta.push(["Steuernummer", b.tax_number]);
    for (const [k, v] of meta) {
      put(k, R - 215, my, { size: 8, color: MUTED });
      put(v, R, my, { size: 9.5, align: "right" });
      my -= 15;
    }

    // ── Positionen ───────────────────────────────────────────────────────────
    y = Math.min(y, my) - 28;
    rule(y); y -= 15;
    put("BESCHREIBUNG", L, y, { size: 7.5, font: bold, color: MUTED });
    put("BETRAG", R, y, { size: 7.5, font: bold, color: MUTED, align: "right" });
    y -= 10;
    rule(y); y -= 18;

    // Beschreibung umbrechen, damit ein langer Produktname nicht ins Nichts laeuft.
    const desc = r.description || "Leistung";
    const maxW = R - L - 110;
    const words = desc.split(" ");
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (reg.widthOfTextAtSize(probe, 10) > maxW && line) {
        put(line, L, y, { size: 10 }); y -= 13; line = w;
      } else line = probe;
    }
    put(line, L, y, { size: 10 });
    put(money(r.gross_cents), R, y, { size: 10, align: "right" });
    y -= 22;

    rule(y); y -= 17;

    const rows: [string, string, boolean][] = [];
    if (r.discount_cents > 0) {
      rows.push(["Zwischensumme (brutto)", money(r.gross_cents), false]);
      rows.push(["Rabatt (P2G Points)", "-" + money(r.discount_cents), false]);
    }
    const rateLabel = `zzgl. ${Number(r.tax_rate).toLocaleString("de-DE")} % USt`;
    rows.push(["Nettobetrag", money(r.net_cents), false]);
    rows.push([rateLabel, money(r.tax_cents), false]);
    rows.push([isRefund(r.receipt_type) ? "Erstattungsbetrag" : "Rechnungsbetrag", money(r.paid_cents), true]);

    for (const [label, value, strong] of rows) {
      if (strong) { y -= 4; rule(y + 12); }
      put(label, R - 260, y, { size: strong ? 11 : 9.5, font: strong ? bold : reg, color: strong ? INK : MUTED });
      put(value, R, y, { size: strong ? 11 : 9.5, font: strong ? bold : reg, align: "right" });
      y -= strong ? 18 : 14;
    }

    // ── Hinweise ─────────────────────────────────────────────────────────────
    y -= 14;
    if (r.discount_cents > 0) {
      put("Der Rabatt wurde mit P2G Points beglichen und mindert das Entgelt (§ 17 UStG).", L, y, { size: 8.5, color: MUTED });
      y -= 12;
    }
    if (isRefund(r.receipt_type)) {
      put("Korrektur zur ursprünglichen Rechnung. Der Betrag wurde erstattet.", L, y, { size: 8.5, color: MUTED });
      y -= 12;
    } else {
      put("Betrag bezahlt. Diese Rechnung dient als Zahlungsbeleg, bitte nicht überweisen.", L, y, { size: 8.5, color: MUTED });
      y -= 12;
    }
    if (Math.abs(r.paid_cents) <= 25000 && !r.recipient_address_line1) {
      put("Kleinbetragsrechnung gemäß § 33 UStDV.", L, y, { size: 8.5, color: MUTED });
      y -= 12;
    }

    // ── Fuss ─────────────────────────────────────────────────────────────────
    const foot: string[] = [];
    const ident = [
      b.vat_id ? `USt-IdNr. ${b.vat_id}` : "",
      b.tax_number ? `Steuernummer ${b.tax_number}` : "",
      b.register_court && b.register_number ? `${b.register_court} ${b.register_number}` : "",
    ].filter(Boolean).join(" · ");
    if (b.managing_directors) foot.push(`Geschäftsführung: ${b.managing_directors}`);
    if (ident) foot.push(ident);
    const contact = [b.email, b.phone, b.website].filter(Boolean).join(" · ");
    if (contact) foot.push(contact);
    const bank = [b.bank_name, b.iban ? `IBAN ${b.iban}` : "", b.bic ? `BIC ${b.bic}` : ""].filter(Boolean).join(" · ");
    if (bank) foot.push(bank);

    let fy = 66 + (foot.length - 1) * 11;
    rule(fy + 16);
    for (const line of foot) { put(line, L, fy, { size: 7.5, color: MUTED }); fy -= 11; }

    return await doc.save();
  })();
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

  const jsonHeaders = { ...cors(origin), "Content-Type": "application/json" };

  try {
    const url = new URL(req.url);
    let receiptId = url.searchParams.get("receipt_id");
    let token = url.searchParams.get("token");
    // Bequemer fuer die Oberflaeche: sie kennt die Bestellung, nicht den Beleg.
    let sourceId = url.searchParams.get("source_id");
    let receiptType = url.searchParams.get("receipt_type");
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as {
        receipt_id?: string; token?: string; source_id?: string; receipt_type?: string;
      };
      receiptId = body.receipt_id ?? receiptId;
      token = body.token ?? token;
      sourceId = body.source_id ?? sourceId;
      receiptType = body.receipt_type ?? receiptType;
    }

    const KNOWN_TYPES = ["marketplace_order", "marketplace_refund", "booking", "booking_refund"];
    if (receiptType && !KNOWN_TYPES.includes(receiptType)) {
      return new Response(JSON.stringify({ error: "Unbekannte Belegart" }), { status: 400, headers: jsonHeaders });
    }

    if (!receiptId && !token && !sourceId) {
      return new Response(JSON.stringify({ error: "receipt_id, source_id oder token fehlt" }), { status: 400, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Token gewinnt: der Link aus der Mail soll ohne Anmeldung funktionieren.
    let receipt: Receipt | null = null;
    if (token) {
      const { data } = await supabaseAdmin.from("receipts").select("*").eq("access_token", token).maybeSingle();
      receipt = (data as Receipt) ?? null;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Nicht angemeldet" }), { status: 401, headers: jsonHeaders });
      }
      const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
      const user = userData?.user;
      if (!user) {
        return new Response(JSON.stringify({ error: "Nicht angemeldet" }), { status: 401, headers: jsonHeaders });
      }
      let q = supabaseAdmin.from("receipts").select("*");
      if (receiptId) q = q.eq("id", receiptId);
      else {
        q = q.eq("source_id", sourceId!);
        // Ohne Angabe die Rechnung, nicht die Korrektur: der Knopf an der
        // Bestellung meint immer das Hauptdokument.
        q = q.eq("receipt_type", receiptType ?? (sourceId ? "marketplace_order" : "booking"));
      }
      const { data } = await q.maybeSingle();
      const candidate = (data as Receipt) ?? null;
      // Fremde Belege sehen aus wie nicht vorhandene: kein Rueckschluss darauf,
      // welche Belegnummern es gibt.
      receipt = candidate && candidate.user_id === user.id ? candidate : null;
    }

    if (!receipt) {
      return new Response(JSON.stringify({ error: "Rechnung nicht gefunden" }), { status: 404, headers: jsonHeaders });
    }

    const { data: billerRow } = await supabaseAdmin
      .from("billing_profile").select("*").eq("id", "global").maybeSingle();

    const biller = (billerRow ?? {}) as Biller;
    if (!biller.company_name) {
      return new Response(
        JSON.stringify({ error: "Rechnungsangaben fehlen (Admin → Einstellungen → Rechnungsangaben)" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const bytes = await buildPdf(receipt, biller);
    const filename = `${receipt.receipt_number}.pdf`;

    // pdf-lib liefert Uint8Array<ArrayBufferLike>; die Deno-Typen erwarten einen
    // konkreten ArrayBuffer. Einmal umkopieren statt casten.
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);

    return new Response(buf, {
      headers: {
        ...cors(origin),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[receipt-pdf]", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
