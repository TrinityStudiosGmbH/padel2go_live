// Stornoregel fuer Court-Buchungen: kostenlos bis 24 Stunden vor Spielbeginn.
// Gespiegelt in cancel_confirmed_booking() (Datenbank) und src/lib/bookingPolicy.ts.
export const CANCEL_CUTOFF_HOURS = 24;

export function cancelDeadline(startTime: string | Date): Date {
  return new Date(new Date(startTime).getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000);
}
