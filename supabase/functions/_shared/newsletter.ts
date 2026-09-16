// Renders a block-based newsletter into the shared PADEL2GO email shell.
import { BRAND, FONT_BODY, FONT_DISPLAY, emailShell, escapeHtml as esc } from "./email.ts";

export type Block =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "button"; label: string; url: string };

const renderBlock = (b: Block): string => {
  switch (b?.type) {
    case "heading":
      return `<h2 style="margin:26px 0 10px;font-family:${FONT_DISPLAY};font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;color:${BRAND.lime};">${esc(b.text)}</h2>`;
    case "text":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.text};">${esc(b.text).replace(/\n/g, "<br>")}</p>`;
    case "image":
      return `<img src="${esc(b.url)}" alt="${esc(b.alt ?? "")}" width="480" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;margin:0 0 20px;border:0;" />`;
    case "button":
      return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px;">
                <tr>
                  <td align="center" bgcolor="${BRAND.lime}" style="background-color:${BRAND.lime};border-radius:999px;">
                    <a href="${esc(b.url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${BRAND.black};text-decoration:none;border-radius:999px;">${esc(b.label)}</a>
                  </td>
                </tr>
              </table>`;
    default:
      return "";
  }
};

export function renderNewsletterHtml(
  campaign: { subject: string; preheader?: string; blocks: Block[] },
  opts: { unsubscribeUrl: string },
): string {
  // First heading block sits flush at the top of the card.
  const body = (campaign.blocks ?? []).map(renderBlock).join("").replace(/^(\s*<h2 style="margin:)26px/, "$10");
  return emailShell({
    title: campaign.subject,
    preheader: campaign.preheader,
    bodyHtml: body,
    unsubscribeUrl: opts.unsubscribeUrl,
  });
}
