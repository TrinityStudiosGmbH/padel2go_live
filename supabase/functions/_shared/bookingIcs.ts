// Kalender-Anbindung fuer Buchungen: .ics-Inhalt, signierter Download-Link
// (Apple Kalender) und Google-Kalender-Link. Genutzt von send-booking-confirmation
// (Mail) und booking-ics (Auslieferung der Datei).

export interface BookingIcsInput {
  id: string;
  start: Date;
  end: Date;
  courtName: string;
  locationName: string;
  address?: string | null;
  city?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toICS = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsEscape = (s: string) =>
  (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export const bookingRef = (id: string) => id.substring(0, 8).toUpperCase();

export function bookingCalendarSummary(b: BookingIcsInput): string {
  return `Padel: ${b.courtName} @ ${b.locationName}`;
}

export function bookingCalendarLocation(b: BookingIcsInput): string {
  return [b.locationName, b.address, b.city].filter(Boolean).join(", ");
}

export function buildBookingIcs(b: BookingIcsInput): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PADEL2GO//Booking//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@padel2go`,
    `DTSTAMP:${toICS(new Date())}`,
    `DTSTART:${toICS(b.start)}`,
    `DTEND:${toICS(b.end)}`,
    `SUMMARY:${icsEscape(bookingCalendarSummary(b))}`,
    `LOCATION:${icsEscape(bookingCalendarLocation(b))}`,
    `DESCRIPTION:${icsEscape(`Deine PADEL2GO Buchung – Buchungsnr. #${bookingRef(b.id)}`)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function googleCalendarUrl(b: BookingIcsInput): string {
  return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(bookingCalendarSummary(b))}` +
    `&dates=${toICS(b.start)}/${toICS(b.end)}` +
    `&location=${encodeURIComponent(bookingCalendarLocation(b))}` +
    `&details=${encodeURIComponent(`Deine PADEL2GO Buchung – Buchungsnr. #${bookingRef(b.id)}`)}`;
}

// ── Signierter Link auf die .ics-Datei ──────────────────────────────────────
// Die Buchungs-ID allein soll nicht reichen, um Termindaten abzurufen. Der Token
// ist ein HMAC ueber die ID mit dem Service-Role-Key (in jeder Edge Function vorhanden).

async function hmacHex(message: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`booking-ics:${message}`));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function signBookingIcsToken(bookingId: string): Promise<string> {
  return (await hmacHex(bookingId)).slice(0, 32);
}

export async function verifyBookingIcsToken(bookingId: string, token: string): Promise<boolean> {
  const expected = await signBookingIcsToken(bookingId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function bookingIcsUrl(bookingId: string, token: string): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base}/functions/v1/booking-ics?b=${encodeURIComponent(bookingId)}&t=${token}`;
}
