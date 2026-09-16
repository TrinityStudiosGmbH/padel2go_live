// Admin-Werkzeug: jede ausgehende Mail mit Beispieldaten an eine frei gewählte
// Adresse schicken (oder als HTML-Vorschau liefern). Nutzt exakt dieselbe Shell
// und dieselben Bausteine wie die produktiven Funktionen.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { hasAdminAccess } from "../_shared/adminAccess.ts";
import {
  APP_URL,
  INTERNAL_INBOX,
  blockMessage,
  brandedEmailHtml,
  resolveResendKey,
  sendBrandedEmail,
} from "../_shared/email.ts";
import { renderNewsletterHtml } from "../_shared/newsletter.ts";
import { AGB_ATTACHMENT } from "../_shared/agb-text.ts";
import { WIDERRUFSBELEHRUNG_HTML } from "../_shared/legal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface MailSample {
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  /** Interne Mails gehen ohne Reply-To an info@ raus. */
  internal?: boolean;
}

interface CatalogEntry {
  id: string;
  group: "Buchung" | "Shop" | "Events" | "Newsletter" | "Intern";
  label: string;
  description: string;
  source: string;
  build: () => MailSample;
}

// ── Beispieldaten ────────────────────────────────────────────────────────────
const NAME = "Florian";
const LOCATION = { name: "SkyPadel München", address: "Am Neudeck 10", city: "München" };
const COURT = "Court 2 · Outdoor";
const start = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); // nächster Samstag
  d.setHours(18, 0, 0, 0);
  return d;
})();
const end = new Date(start.getTime() + 90 * 60000);
const fmtDate = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

function sampleIcs(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toICS = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PADEL2GO//Booking//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:test-${Date.now()}@padel2go`, `DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(start)}`, `DTEND:${toICS(end)}`, `SUMMARY:Padel: ${COURT} @ ${LOCATION.name}`,
    `LOCATION:${LOCATION.name}\\, ${LOCATION.address}\\, ${LOCATION.city}`, "DESCRIPTION:Testmail aus dem Admin-Panel",
    "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

const CATALOG: CatalogEntry[] = [
  {
    id: "booking_confirmation", group: "Buchung", label: "Buchungsbestätigung",
    description: "Nach erfolgreicher Zahlung. Mit .ics-Kalenderdatei und AGB im Anhang.",
    source: "send-booking-confirmation",
    build: () => ({
      subject: "✅ Deine Buchung ist bestätigt!",
      attachments: [{ filename: "padel2go-booking.ics", content: encodeBase64(sampleIcs()), contentType: "text/calendar" }, AGB_ATTACHMENT],
      html: brandedEmailHtml({
        title: "✅ Deine Buchung ist bestätigt!",
        preheader: `${fmtDate(start)}, ${fmtTime(start)} Uhr · ${COURT} @ ${LOCATION.name}`,
        emoji: "🎾", heading: "Buchung bestätigt!",
        intro: "Deine Buchung wurde erfolgreich bezahlt und ist damit bestätigt.",
        greetingName: NAME, rowsTitle: "Buchungsdetails",
        rows: [
          { label: "Standort", value: LOCATION.name },
          { label: "Adresse", value: `${LOCATION.address}, ${LOCATION.city}` },
          { label: "Datum", value: fmtDate(start) },
          { label: "Uhrzeit", value: `${fmtTime(start)} – ${fmtTime(end)} Uhr (90 Min)` },
          { label: "Court", value: COURT },
          { label: "Buchungsnr.", value: "#A1B2C3D4" },
        ],
        highlight: { label: "Bezahlt", value: eur(3600), sub: ["enthaltene USt (19 %): 5,75 €", "Belegnr. B-2026-000123"] },
        ctaLabel: "Buchung ansehen", ctaUrl: `${APP_URL}/dashboard/booking`,
        calendar: {
          googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Padel%3A%20Court%202%20%40%20SkyPadel",
          appleUrl: `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/booking-ics?sample=1`,
        },
        note: "Die .ics-Datei im Anhang funktioniert auch mit Outlook. Wir freuen uns auf dein Match! 🏆",
        legalHtml: "Kostenlose Stornierung bis Spielbeginn. Kein gesetzliches Widerrufsrecht bei termingebundenen Freizeitleistungen (§ 312g Abs. 2 Nr. 9 BGB).",
      }),
    }),
  },
  {
    id: "booking_cancelled", group: "Buchung", label: "Buchung storniert",
    description: "Nach Stornierung durch den Spieler, mit Hinweis auf Rückerstattung.",
    source: "cancel-booking",
    build: () => ({
      subject: "Deine Buchung wurde storniert",
      html: brandedEmailHtml({
        title: "Buchung storniert", emoji: "🚫", heading: "Buchung storniert",
        intro: "Deine Court-Buchung wurde storniert.",
        rows: [
          { label: "Standort", value: LOCATION.name }, { label: "Court", value: COURT },
          { label: "Datum", value: fmtDate(start) }, { label: "Uhrzeit", value: `${fmtTime(start)} Uhr` },
        ],
        note: "Der bezahlte Betrag wird auf dein Zahlungsmittel zurückerstattet.",
        ctaLabel: "Neue Buchung", ctaUrl: `${APP_URL}/booking`,
      }),
    }),
  },
  {
    id: "match_reminder", group: "Buchung", label: "Court-Erinnerung",
    description: "Etwa eine Stunde vor Spielbeginn (Cron).",
    source: "send-match-reminders",
    build: () => ({
      subject: "Erinnerung: dein Court startet bald 🎾",
      html: brandedEmailHtml({
        title: "Erinnerung: dein Court startet bald", emoji: "⏰", heading: "Dein Match startet bald!",
        intro: "In etwa einer Stunde geht's los — viel Spaß auf dem Court!",
        rows: [
          { label: "Standort", value: LOCATION.name }, { label: "Court", value: COURT },
          { label: "Wann", value: `${fmtDate(start)}, ${fmtTime(start)} Uhr` },
        ],
        note: "Bis gleich auf dem Court! 🎾",
      }),
    }),
  },
  {
    id: "event_confirmation", group: "Events", label: "Event-Anmeldung bestätigt",
    description: "Mit Ticket-Code für den Einlass.",
    source: "send-event-confirmation",
    build: () => ({
      subject: "Anmeldung bestätigt: Padel Night München",
      html: brandedEmailHtml({
        title: "Anmeldung bestätigt", emoji: "🎫", heading: "Du bist dabei! 🎾",
        intro: "Deine Anmeldung zum Event ist bestätigt.",
        rows: [
          { label: "Event", value: "Padel Night München" },
          { label: "Wann", value: `${fmtDate(start)}, ${fmtTime(start)} Uhr` },
          { label: "Ort", value: LOCATION.name },
        ],
        highlight: { label: "Dein Ticket-Code", value: "P2G-7K3M-9Q" },
        ctaLabel: "Zu meinen Events", ctaUrl: `${APP_URL}/dashboard/events`,
        note: "Zeig deinen Ticket-Code am Einlass. Bis dann!",
      }),
    }),
  },
  {
    id: "event_cancellation", group: "Events", label: "Event-Anmeldung storniert",
    description: "Nach Abmeldung von einem Event.",
    source: "send-event-cancellation",
    build: () => ({
      subject: "Anmeldung storniert: Padel Night München",
      html: brandedEmailHtml({
        title: "Anmeldung storniert", emoji: "🚫", heading: "Anmeldung storniert",
        intro: "Deine Anmeldung zu diesem Event wurde storniert.",
        rows: [
          { label: "Event", value: "Padel Night München" },
          { label: "Wann", value: `${fmtDate(start)}, ${fmtTime(start)} Uhr` },
          { label: "Ort", value: LOCATION.name },
        ],
        note: "Schade, dass es nicht klappt — du kannst dich jederzeit wieder anmelden.",
        ctaLabel: "Weitere Events", ctaUrl: `${APP_URL}/dashboard/events`,
      }),
    }),
  },
  {
    id: "marketplace_confirmation", group: "Shop", label: "Bestellung bestätigt",
    description: "Physische Ware: mit Widerrufsbelehrung und AGB im Anhang.",
    source: "send-marketplace-confirmation",
    build: () => ({
      subject: "Bestellung bestätigt: Padel-Schläger Pro Carbon",
      attachments: [AGB_ATTACHMENT],
      html: brandedEmailHtml({
        title: "Bestellung bestätigt", emoji: "🛍️", heading: "Bestellung bestätigt!",
        intro: "Danke für deinen Einkauf im PADEL2GO Shop.", greetingName: NAME,
        rows: [
          { label: "Produkt", value: "Padel-Schläger Pro Carbon" }, { label: "Menge", value: "1" },
          { label: "Bestellnr.", value: "P2G-2026-0042" }, { label: "Bezahlt", value: eur(14900) },
          { label: "Eingelöste Punkte", value: "500 Punkte" },
          { label: "Lieferadresse", value: `${NAME} Muster, Musterstraße 1, 81541 München, DE` },
        ],
        note: "Wir bereiten deine Bestellung für den Versand vor. Lieferzeit: in der Regel 2–4 Werktage.",
        ctaLabel: "Zum Shop", ctaUrl: `${APP_URL}/marketplace`,
        legalHtml: WIDERRUFSBELEHRUNG_HTML,
      }),
    }),
  },
  {
    id: "marketplace_shipped", group: "Shop", label: "Bestellung versendet",
    description: "Mit Sendungsnummer und Tracking-Link.",
    source: "send-marketplace-shipped",
    build: () => ({
      subject: "Deine Bestellung ist unterwegs: Padel-Schläger Pro Carbon",
      html: brandedEmailHtml({
        title: "Bestellung versendet", emoji: "📦", heading: "Deine Bestellung ist unterwegs!",
        intro: "Wir haben dein Paket dem Versanddienstleister übergeben.", greetingName: NAME,
        rows: [
          { label: "Produkt", value: "Padel-Schläger Pro Carbon" }, { label: "Bestellnr.", value: "P2G-2026-0042" },
          { label: "Versanddienstleister", value: "DHL" }, { label: "Sendungsnummer", value: "00340434161094000000" },
        ],
        ctaLabel: "Sendung verfolgen", ctaUrl: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094000000",
        note: "Die Zustellung dauert je nach Dienstleister in der Regel 1–3 Werktage.",
      }),
    }),
  },
  {
    id: "marketplace_refund", group: "Shop", label: "Rückerstattung bestätigt",
    description: "Nach Storno/Erstattung einer Bestellung durch den Admin.",
    source: "marketplace-refund",
    build: () => ({
      subject: "Rückerstattung bestätigt: Padel-Schläger Pro Carbon",
      html: brandedEmailHtml({
        title: "Rückerstattung bestätigt", emoji: "↩️", heading: "Rückerstattung bestätigt",
        intro: "Deine Bestellung wurde storniert und erstattet.", greetingName: NAME,
        rows: [
          { label: "Produkt", value: "Padel-Schläger Pro Carbon" }, { label: "Bestellnr.", value: "P2G-2026-0042" },
          { label: "Zurückerstattet", value: eur(14900) }, { label: "Punkte gutgeschrieben", value: "500 Punkte" },
        ],
        note: "Der Betrag wird auf dein Zahlungsmittel zurückerstattet — das kann einige Tage dauern.",
        ctaLabel: "Zum Shop", ctaUrl: `${APP_URL}/marketplace`,
      }),
    }),
  },
  {
    id: "newsletter_optin", group: "Newsletter", label: "Newsletter Double-Opt-in",
    description: "Bestätigungslink nach Anmeldung auf der Website.",
    source: "newsletter-subscribe",
    build: () => ({
      subject: "Bitte bestätige deine Newsletter-Anmeldung",
      html: brandedEmailHtml({
        title: "Newsletter bestätigen", emoji: "📩", heading: "Fast geschafft!",
        intro: "Bitte bestätige deine Newsletter-Anmeldung.",
        note: "Wenn du das nicht warst, ignoriere diese E-Mail einfach.",
        ctaLabel: "Anmeldung bestätigen", ctaUrl: `${APP_URL}/newsletter/bestaetigen?token=test`,
      }),
    }),
  },
  {
    id: "newsletter_campaign", group: "Newsletter", label: "Newsletter-Kampagne",
    description: "Beispiel-Kampagne mit Überschrift, Text, Bild und Button. Echte Kampagnen testest du unter Newsletter.",
    source: "newsletter-send",
    build: () => ({
      subject: "Neuer Standort in München",
      html: renderNewsletterHtml(
        {
          subject: "Neuer Standort in München", preheader: "SkyPadel eröffnet — vier neue Courts mit Flutlicht.",
          blocks: [
            { type: "heading", text: "SkyPadel eröffnet im Oktober" },
            { type: "text", text: "Vier neue Courts mit Flutlicht, Umkleiden und Automat vor Ort.\nBuchbar ab sofort über die App und die Website." },
            { type: "image", url: `${APP_URL}/og-image.png`, alt: "PADEL2GO" },
            { type: "button", label: "Jetzt buchen", url: `${APP_URL}/booking` },
          ],
        },
        { unsubscribeUrl: `${APP_URL}/newsletter/abmelden?token=test` },
      ),
    }),
  },
  {
    id: "contact_form", group: "Intern", label: "Kontaktanfrage (intern)",
    description: "Geht an info@ nach Absenden des Kontaktformulars. Reply-To = Absender.",
    source: "send-contact-email",
    build: () => ({
      subject: "Kontaktanfrage: Anfrage als Verein - Max Muster", internal: true,
      html: brandedEmailHtml({
        internal: true, title: "Kontaktanfrage: Anfrage als Verein", preheader: "Max Muster · Anfrage als Verein",
        emoji: "✉️", heading: "Neue Kontaktanfrage",
        intro: "Über das Kontaktformular auf padel2go-official.de eingegangen.",
        rows: [
          { label: "Anfrageart", value: "Anfrage als Verein" }, { label: "Name", value: "Max Muster" },
          { label: "E-Mail", value: "max@example.com" }, { label: "Organisation", value: "TC Musterstadt e.V." },
        ],
        bodyHtml: blockMessage("Hallo,\n\nwir haben drei Tennisplätze und würden gern Padel anbieten. Können wir dazu telefonieren?\n\nViele Grüße\nMax", "Nachricht"),
        ctaLabel: "Antworten", ctaUrl: "mailto:max@example.com?subject=Re%3A%20Anfrage%20als%20Verein",
        note: "Antworten auf diese Mail gehen direkt an die absendende Person (Reply-To).",
      }),
    }),
  },
  {
    id: "marketplace_order_alert", group: "Intern", label: "Neue Shop-Bestellung (intern)",
    description: "Geht an info@ nach jeder Bestellung, zur Bearbeitung/Versand.",
    source: "marketplace-checkout / stripe-webhook",
    build: () => ({
      subject: "Neue Marketplace-Bestellung: Padel-Schläger Pro Carbon - P2G-2026-0042", internal: true,
      html: brandedEmailHtml({
        internal: true, title: "Neue Marketplace-Bestellung: Padel-Schläger Pro Carbon",
        preheader: `P2G-2026-0042 · ${NAME} Muster`, emoji: "🛍️", heading: "Neue Marketplace-Bestellung",
        intro: "Eine bezahlte Bestellung wartet auf Bearbeitung.", rowsTitle: "Bestelldetails",
        rows: [
          { label: "Referenz", value: "P2G-2026-0042" }, { label: "Produkt", value: "Padel-Schläger Pro Carbon" },
          { label: "Kategorie", value: "Schläger" }, { label: "Menge", value: "1" },
          { label: "Bezahlt mit Punkten", value: "500" }, { label: "Bezahlt bar", value: eur(14400) },
          { label: "Kunde", value: `${NAME} Muster` }, { label: "E-Mail", value: "florian@example.com" },
          { label: "Lieferadresse", value: "Musterstraße 1, 81541 München, Deutschland" },
        ],
        ctaLabel: "Bestellung im Admin öffnen", ctaUrl: `${APP_URL}/admin/marketplace`,
      }),
    }),
  },
  {
    id: "critical_marketplace_release", group: "Intern", label: "KRITISCH: bezahlte Bestellung storniert",
    description: "Alarm, wenn eine bezahlte Bestellung vor dem Zahlungs-Webhook storniert wurde.",
    source: "stripe-webhook",
    build: () => ({
      subject: "KRITISCH: Bezahlte Marketplace-Bestellung storniert - P2G-2026-0042", internal: true,
      html: brandedEmailHtml({
        internal: true, title: "KRITISCH: Bezahlte Marketplace-Bestellung storniert", emoji: "🚨",
        heading: "Bezahlte Bestellung wurde storniert",
        intro: "Eine per Karte bezahlte Marketplace-Bestellung wurde storniert, bevor der Zahlungs-Webhook eintraf. Punkte und Bestand wurden bereits zurückgebucht.",
        rows: [
          { label: "Referenz", value: "P2G-2026-0042" }, { label: "Bestell-ID", value: "5f1c9e2a-0000-4000-8000-000000000042" },
          { label: "Status", value: "cancelled" }, { label: "Stripe Session", value: "cs_test_a1B2c3D4" },
          { label: "Bezahlt", value: eur(14400) },
        ],
        highlight: { label: "Automatische Rückerstattung", value: "ausgelöst" },
        note: "Keine weitere Aktion nötig.",
      }),
    }),
  },
  {
    id: "critical_booking_release", group: "Intern", label: "KRITISCH: bezahlte Buchung storniert",
    description: "Alarm, wenn eine bezahlte Buchung vor dem Zahlungs-Webhook storniert wurde.",
    source: "stripe-webhook",
    build: () => ({
      subject: "KRITISCH: Bezahlte Buchung storniert - 7b2d…", internal: true,
      html: brandedEmailHtml({
        internal: true, title: "KRITISCH: Bezahlte Buchung storniert", emoji: "🚨",
        heading: "Bezahlte Buchung wurde storniert",
        intro: "Eine per Karte bezahlte Buchung wurde storniert, bevor der Zahlungs-Webhook eintraf. Die reservierten Credits wurden bereits zurückgebucht.",
        rows: [
          { label: "Buchungs-ID", value: "7b2d4f10-0000-4000-8000-000000000007" }, { label: "Status", value: "cancelled" },
          { label: "Stripe Session", value: "cs_test_x9Y8z7W6" }, { label: "Bezahlt", value: eur(3600) },
        ],
        highlight: { label: "Automatische Rückerstattung", value: "FEHLGESCHLAGEN" },
        note: "Bitte manuell in Stripe prüfen und erstatten.",
      }),
    }),
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!(await hasAdminAccess(supabaseAdmin, user, "settings"))) {
      return json({ error: "Forbidden - Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({})) as { action?: string; type?: string; to?: string };

    if (body.action === "list") {
      return json({
        mails: CATALOG.map(({ id, group, label, description, source }) => ({ id, group, label, description, source })),
      });
    }

    if (body.action === "preview") {
      const entry = CATALOG.find((m) => m.id === body.type);
      if (!entry) return json({ error: "Unbekannter Mail-Typ" }, 400);
      const sample = entry.build();
      return json({ subject: sample.subject, html: sample.html });
    }

    if (body.action === "send" || body.action === "send_all") {
      const to = (body.to ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(to)) return json({ error: "Ungültige E-Mail-Adresse" }, 400);

      const resendKey = await resolveResendKey(supabaseAdmin);
      if (!resendKey) return json({ error: "RESEND_API_KEY ist nicht konfiguriert (Integrationen)" }, 500);

      const entries = body.action === "send_all"
        ? CATALOG
        : CATALOG.filter((m) => m.id === body.type);
      if (entries.length === 0) return json({ error: "Unbekannter Mail-Typ" }, 400);

      const results: { id: string; ok: boolean; error?: string; emailId?: string }[] = [];
      for (const entry of entries) {
        try {
          const sample = entry.build();
          const res = await sendBrandedEmail(resendKey, to, `[TEST] ${sample.subject}`, sample.html, {
            attachments: sample.attachments,
            replyTo: sample.internal ? null : undefined,
          });
          results.push({ id: entry.id, ok: true, emailId: res.data?.id });
        } catch (e) {
          results.push({ id: entry.id, ok: false, error: (e as Error).message });
        }
      }
      console.log(`[admin-mail-test] ${user.email} → ${to}: ${results.filter((r) => r.ok).length}/${results.length} gesendet`);
      return json({ success: true, results, internalInbox: INTERNAL_INBOX });
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    console.error("[admin-mail-test]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
