/**
 * Stornoregel fuer Court-Buchungen: kostenlos und mit voller Erstattung bis
 * 24 Stunden vor Spielbeginn, danach gar nicht mehr (durch den Kunden).
 *
 * Dieselbe Zahl steht in cancel_confirmed_booking() (Datenbank) und in
 * supabase/functions/_shared/bookingPolicy.ts (Edge Functions). Wer sie
 * aendert, aendert alle drei — sonst zeigt die Oberflaeche etwas anderes,
 * als der Server durchsetzt.
 */
export const CANCEL_CUTOFF_HOURS = 24;

export function cancelDeadline(startTime: string | Date): Date {
  return new Date(new Date(startTime).getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000);
}

export function canCancelFree(startTime: string | Date, now: Date = new Date()): boolean {
  return now.getTime() < cancelDeadline(startTime).getTime();
}
