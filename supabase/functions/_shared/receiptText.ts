/**
 * Leistungsbeschreibung fuer den Beleg.
 *
 * Sie landet woertlich auf der Rechnung, und § 14 UStG verlangt Art und Umfang
 * der Leistung. Bisher stand dort die rohe UUID der Buchung — auf einem
 * Dokument, das der Kunde bekommt und sein Steuerberater liest.
 */

/** Kurzform der Buchungsnummer, wie sie auch in der Bestaetigungsmail steht. */
export const shortRef = (id: string): string => id.substring(0, 8).toUpperCase();

/**
 * "Platzmiete Padel — Court 1, SkyPadel München, 19.09.2026 18:00–19:00 Uhr
 *  (Buchung 723F7CE9)". Faellt auf die Kurzform zurueck, wenn die Buchung
 * nicht mehr gelesen werden kann: eine magere Beschreibung ist besser als ein
 * fehlender Beleg.
 */
export async function bookingDescription(
  supabaseAdmin: any,
  bookingId: string,
  opts: { refund?: boolean } = {},
): Promise<string> {
  const prefix = opts.refund ? "Erstattung: " : "";
  try {
    const { data } = await supabaseAdmin
      .from("bookings")
      .select("start_time, end_time, courts(name, sport), locations(name, city)")
      .eq("id", bookingId)
      .maybeSingle();

    if (!data) return `${prefix}Platzmiete (Buchung ${shortRef(bookingId)})`;

    const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, string> | null;
    const court = one(data.courts);
    const loc = one(data.locations);

    const tz = "Europe/Berlin";
    const day = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz,
    }).format(new Date(data.start_time));
    const hm = (iso: string) =>
      new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz })
        .format(new Date(iso));

    const sport = court?.sport === "tennis" ? "Tennis" : "Padel";
    const where = [court?.name, loc?.name].filter(Boolean).join(", ");

    return `${prefix}Platzmiete ${sport} — ${where}, ${day} ${hm(data.start_time)}–${hm(data.end_time)} Uhr `
      + `(Buchung ${shortRef(bookingId)})`;
  } catch {
    return `${prefix}Platzmiete (Buchung ${shortRef(bookingId)})`;
  }
}
