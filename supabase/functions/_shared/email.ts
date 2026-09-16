// Shared PADEL2GO-branded transactional email helper (Resend).
// Single source of truth for header (logo), fonts, colours and footer of EVERY
// outgoing mail — customer confirmations, reminders, newsletter, internal alerts.
import { Resend } from "npm:resend@4.0.0";

// Single source of truth for the sender identity. padel2go-official.de is the
// domain verified in Resend. We send FROM info@ (a real, forwarded mailbox) so
// customers can simply reply — no unreachable noreply@ address.
export const DEFAULT_FROM = "PADEL2GO <info@padel2go-official.de>";
// Reply-to for customer-facing mail + inbox for internal notifications (same mailbox).
export const REPLY_TO_EMAIL = "info@padel2go-official.de";
export const INTERNAL_INBOX = "info@padel2go-official.de";

export const APP_URL = "https://www.padel2go-official.de";
// Served from the Vite `public/` folder of the web app (public/email/logo-written.png).
export const EMAIL_LOGO_URL = `${APP_URL}/email/logo-written.png`;

// Brand palette — black + lime, identical to the web app.
export const BRAND = {
  lime: "#C7F011",
  black: "#000000",
  bg: "#0A0A0A",
  card: "#111111",
  cardAlt: "#181818",
  border: "#262626",
  text: "#F5F5F5",
  muted: "#9A9A9A",
  faint: "#5E5E5E",
  danger: "#FF6B6B",
} as const;

export const FONT_BODY = "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
export const FONT_DISPLAY = "'Bricolage Grotesque','DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

/** Resolve the Resend API key: env var first, site_integration_configs (service='resend') fallback. */
export async function resolveResendKey(supabaseAdmin: any): Promise<string | null> {
  let key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    const { data } = await supabaseAdmin
      .from("site_integration_configs")
      .select("config, service")
      .eq("service", "resend")
      .maybeSingle();
    key = (data?.config as Record<string, string> | undefined)?.api_key;
  }
  return key ?? null;
}

export const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const esc = escapeHtml;

// ─────────────────────────────────────────────────────────────────────────────
// Shell: <html> + header (logo) + card + footer. Everything else is body HTML.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailShellOpts {
  title: string;
  /** Hidden preview text shown next to the subject in most inboxes. */
  preheader?: string;
  /** Pre-escaped HTML placed inside the card. */
  bodyHtml: string;
  /** Internal alert (admin inbox): adds an "Interne Benachrichtigung" tag under the logo. */
  internal?: boolean;
  /** Newsletter: adds the mandatory unsubscribe line to the footer. */
  unsubscribeUrl?: string;
}

/** Full branded HTML document. Table-based, explicit bgcolor for Outlook, web fonts where supported. */
export function emailShell(o: EmailShellOpts): string {
  const year = new Date().getFullYear();
  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(o.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${esc(o.title)}</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body { margin:0; padding:0; background-color:${BRAND.bg}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:${BRAND.lime}; }
    @media only screen and (max-width:600px) {
      .p2g-container { width:100% !important; }
      .p2g-px { padding-left:20px !important; padding-right:20px !important; }
      .p2g-logo { width:200px !important; height:auto !important; }
    }
  </style>
  <!--[if mso]><style>* { font-family: Arial, Helvetica, sans-serif !important; }</style><![endif]-->
</head>
<body bgcolor="${BRAND.bg}" style="margin:0;padding:0;background-color:${BRAND.bg};font-family:${FONT_BODY};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}" style="width:100%;background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="p2g-container" style="width:560px;max-width:100%;">

          <!-- Header: logo on black, lime bar -->
          <tr>
            <td align="center" bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:30px 32px 26px;border-radius:16px 16px 0 0;">
              <a href="${APP_URL}" style="display:inline-block;text-decoration:none;">
                <img src="${EMAIL_LOGO_URL}" width="232" height="40" alt="PADEL2GO" class="p2g-logo" style="display:block;width:232px;height:40px;border:0;">
              </a>
              ${o.internal
                ? `<div style="margin-top:14px;font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.lime};">Interne Benachrichtigung</div>`
                : ""}
            </td>
          </tr>
          <tr>
            <td bgcolor="${BRAND.lime}" height="4" style="background-color:${BRAND.lime};height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="${BRAND.card}" class="p2g-px" style="background-color:${BRAND.card};padding:36px 40px 32px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};font-family:${FONT_BODY};color:${BRAND.text};">
              ${o.bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="${BRAND.black}" class="p2g-px" style="background-color:${BRAND.black};padding:26px 40px 30px;border-radius:0 0 16px 16px;border-top:1px solid ${BRAND.border};font-family:${FONT_BODY};">
              <p style="margin:0 0 12px;font-size:12px;line-height:1.7;color:${BRAND.faint};">
                PADEL2GO UG (haftungsbeschränkt) · Am Neudeck 10 · 81541 München<br>
                Geschäftsführer: Florian Steinfelder, David Klemm · Amtsgericht München, HRB 306377
              </p>
              <p style="margin:0 0 12px;font-size:12px;line-height:1.7;">
                <a href="${APP_URL}/impressum" style="color:${BRAND.muted};text-decoration:none;">Impressum</a>
                <span style="color:${BRAND.faint};">&nbsp;·&nbsp;</span>
                <a href="${APP_URL}/agb" style="color:${BRAND.muted};text-decoration:none;">AGB</a>
                <span style="color:${BRAND.faint};">&nbsp;·&nbsp;</span>
                <a href="${APP_URL}/widerruf" style="color:${BRAND.muted};text-decoration:none;">Widerrufsbelehrung</a>
                <span style="color:${BRAND.faint};">&nbsp;·&nbsp;</span>
                <a href="${APP_URL}/datenschutz" style="color:${BRAND.muted};text-decoration:none;">Datenschutz</a>
              </p>
              ${o.unsubscribeUrl
                ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.7;color:${BRAND.faint};">Du erhältst diese E-Mail als Newsletter-Abonnent. <a href="${esc(o.unsubscribeUrl)}" style="color:${BRAND.lime};">Abmelden</a></p>`
                : ""}
              <p style="margin:0;font-size:12px;color:${BRAND.faint};">© ${year} PADEL2GO. Alle Rechte vorbehalten.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks (all return pre-escaped HTML for use inside the shell)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailRow { label: string; value: string }

/** Lime display heading + muted intro line, optional emoji tile above. */
export function blockHeading(heading: string, intro?: string, emoji?: string): string {
  return `
              <div style="text-align:center;margin:0 0 26px;">
                ${emoji ? `<div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:32px;background-color:#1C2205;font-size:30px;text-align:center;margin-bottom:16px;">${emoji}</div>` : ""}
                <h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:${BRAND.lime};">${esc(heading)}</h1>
                ${intro ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${BRAND.muted};">${esc(intro)}</p>` : ""}
              </div>`;
}

export function blockGreeting(name: string): string {
  return `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${BRAND.text};">Hallo ${esc(name)},</p>`;
}

export function blockParagraph(text: string, opts?: { muted?: boolean; center?: boolean }): string {
  return `<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${opts?.muted ? BRAND.muted : BRAND.text};${opts?.center ? "text-align:center;" : ""}">${esc(text).replace(/\n/g, "<br>")}</p>`;
}

/** Label / value detail card. */
export function blockRows(rows: EmailRow[], title?: string): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r, i) => `
                  <tr>
                    <td style="padding:${i === 0 ? "0" : "10px"} 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};vertical-align:top;width:38%;">${esc(r.label)}</td>
                    <td align="right" style="padding:${i === 0 ? "0" : "10px"} 0 0;font-size:14px;line-height:1.5;font-weight:600;color:${BRAND.text};vertical-align:top;text-align:right;">${esc(r.value)}</td>
                  </tr>`,
    )
    .join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cardAlt}" style="width:100%;background-color:${BRAND.cardAlt};border:1px solid ${BRAND.border};border-radius:12px;margin:0 0 22px;">
                <tr>
                  <td style="padding:20px 22px;">
                    ${title ? `<div style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">${esc(title)}</div>` : ""}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${body}
                    </table>
                  </td>
                </tr>
              </table>`;
}

/** Boxed lime value (amount, ticket code, reference) with optional small sub lines. */
export function blockHighlight(label: string, value: string, sub?: string[]): string {
  const subs = (sub ?? []).filter(Boolean)
    .map((s) => `<div style="margin-top:6px;font-size:12px;line-height:1.5;color:${BRAND.muted};">${esc(s)}</div>`)
    .join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#161B05" style="width:100%;background-color:#161B05;border:1px solid #3E4810;border-radius:12px;margin:0 0 22px;">
                <tr>
                  <td align="center" style="padding:18px 22px;text-align:center;">
                    <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:6px;">${esc(label)}</div>
                    <div style="font-family:${FONT_DISPLAY};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:0.02em;color:${BRAND.lime};">${esc(value)}</div>
                    ${subs}
                  </td>
                </tr>
              </table>`;
}

/** Primary CTA — black text on lime (bulletproof table button). */
export function blockButton(label: string, url: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;">
                <tr>
                  <td align="center" bgcolor="${BRAND.lime}" style="background-color:${BRAND.lime};border-radius:999px;">
                    <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${BRAND.black};text-decoration:none;border-radius:999px;">${esc(label)}</a>
                  </td>
                </tr>
              </table>`;
}

/** Secondary CTA — outline pill. */
export function blockButtonSecondary(label: string, url: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;">
                <tr>
                  <td align="center" style="border:1px solid ${BRAND.border};border-radius:999px;background-color:${BRAND.cardAlt};">
                    <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${BRAND.text};text-decoration:none;border-radius:999px;">${esc(label)}</a>
                  </td>
                </tr>
              </table>`;
}

/** Small muted note (typically the last line above the footer). */
export function blockNote(text: string): string {
  return `<p style="margin:6px 0 0;font-size:13px;line-height:1.6;text-align:center;color:${BRAND.muted};">${esc(text)}</p>`;
}

/** Free-form pre-escaped legal block (e.g. Widerrufsbelehrung) separated by a rule. */
export function blockLegal(html: string): string {
  return `<div style="margin-top:26px;padding-top:20px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.65;color:${BRAND.muted};">${html}</div>`;
}

/** Quoted message box (contact form). Preserves line breaks. */
export function blockMessage(text: string, title?: string): string {
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cardAlt}" style="width:100%;background-color:${BRAND.cardAlt};border-left:3px solid ${BRAND.lime};border-radius:0 12px 12px 0;margin:0 0 22px;">
                <tr>
                  <td style="padding:18px 22px;">
                    ${title ? `<div style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">${esc(title)}</div>` : ""}
                    <div style="font-size:15px;line-height:1.65;color:${BRAND.text};white-space:pre-wrap;">${esc(text)}</div>
                  </td>
                </tr>
              </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: one call for the standard transactional layout
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandedEmailOpts {
  title: string;                 // <title> / meta
  preheader?: string;            // inbox preview text (defaults to intro)
  emoji?: string;                // emoji tile above the heading
  heading: string;               // main lime heading
  intro: string;                 // sentence under the heading
  greetingName?: string;         // "Hallo {name},"
  rowsTitle?: string;            // small caption above the detail rows
  rows?: EmailRow[];             // detail rows (label / value)
  highlight?: { label: string; value: string; sub?: string[] }; // boxed value (amount / ticket code)
  bodyHtml?: string;             // pre-escaped extra content between highlight and CTA
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  note?: string;                 // muted line above the footer
  legalHtml?: string;            // pre-escaped legal block (e.g. Widerrufsbelehrung) below the note
  internal?: boolean;            // admin-inbox alert
}

/** Full branded HTML document (black + lime, logo header) for the standard layout. */
export function brandedEmailHtml(o: BrandedEmailOpts): string {
  const body = [
    blockHeading(o.heading, o.intro, o.emoji),
    o.greetingName ? blockGreeting(o.greetingName) : "",
    o.rows && o.rows.length ? blockRows(o.rows, o.rowsTitle) : "",
    o.highlight ? blockHighlight(o.highlight.label, o.highlight.value, o.highlight.sub) : "",
    o.bodyHtml ?? "",
    o.ctaLabel && o.ctaUrl ? blockButton(o.ctaLabel, o.ctaUrl) : "",
    o.secondaryCtaLabel && o.secondaryCtaUrl ? blockButtonSecondary(o.secondaryCtaLabel, o.secondaryCtaUrl) : "",
    o.note ? blockNote(o.note) : "",
    o.legalHtml ? blockLegal(o.legalHtml) : "",
  ].join("");

  return emailShell({
    title: o.title,
    preheader: o.preheader ?? o.intro,
    bodyHtml: body,
    internal: o.internal,
  });
}

export interface SendOpts {
  attachments?: { filename: string; content: string; contentType?: string }[];
  from?: string;            // defaults to DEFAULT_FROM
  replyTo?: string | null;  // defaults to REPLY_TO_EMAIL; pass null to omit
}

/** Send a branded email via Resend. Returns the Resend response (throws on hard error). */
export async function sendBrandedEmail(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
  opts?: SendOpts,
) {
  const resend = new Resend(resendKey);
  const replyTo = opts?.replyTo === null ? undefined : (opts?.replyTo ?? REPLY_TO_EMAIL);
  const res = await resend.emails.send({
    from: opts?.from ?? DEFAULT_FROM,
    to: [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(opts?.attachments && opts.attachments.length ? { attachments: opts.attachments } : {}),
  });
  // Resend's SDK does NOT throw on API errors — it returns { data, error }. Throw so callers
  // don't silently report success while no mail was ever delivered.
  if (res.error) throw new Error(`Resend send failed: ${res.error.message ?? JSON.stringify(res.error)}`);
  return res;
}
