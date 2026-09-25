import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/**
 * Der Beleg als PDF — eine Stelle fuer Einzelabruf (receipt-pdf) und
 * Sammelexport (receipts-export), damit beide dasselbe Dokument liefern.
 */

export interface Receipt {
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
  is_test: boolean;
}

export interface Biller {
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

// Die Lieferadresse speichert das Land als ISO-Kuerzel. Auf einer Rechnung
// sieht "DE" nach Formularrest aus; alles Unbekannte bleibt unveraendert.
const COUNTRY_NAMES: Record<string, string> = {
  DE: "Deutschland", AT: "Österreich", CH: "Schweiz", NL: "Niederlande",
  BE: "Belgien", FR: "Frankreich", IT: "Italien", ES: "Spanien",
  LU: "Luxemburg", PL: "Polen", CZ: "Tschechien", DK: "Dänemark",
};

const countryName = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  if (!t) return null;
  return COUNTRY_NAMES[t.toUpperCase()] ?? t;
};

export function buildPdf(r: Receipt, b: Biller): Promise<Uint8Array> {
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
    if (r.is_test) {
      // Damit ein Testbeleg nie fuer ein steuerliches Dokument gehalten wird.
      put("TESTBELEG · kein steuerliches Dokument · es ist kein Geld geflossen", R, 756,
        { size: 8, font: bold, color: rgb(0.8, 0.15, 0.15), align: "right" });
    }

    // ── Empfaenger ───────────────────────────────────────────────────────────
    y = 690;
    put("RECHNUNG AN", L, y, { size: 7.5, font: bold, color: MUTED });
    y -= 15;
    const to = [
      r.recipient_name,
      r.recipient_address_line1,
      [r.recipient_postal_code, r.recipient_city].filter(Boolean).join(" ") || null,
      r.recipient_address_line1 ? countryName(r.recipient_country) : null,
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

