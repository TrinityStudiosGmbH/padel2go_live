/**
 * Empfohlene Bildmaße je Visual-Slot.
 *
 * Hergeleitet aus der TATSAECHLICH gerenderten Box bei der breitesten
 * Darstellung, verdoppelt fuer Retina. Beispiel Courts-Kachel: das Bento-Raster
 * hat 1160 px Inhaltsbreite, 12 Spalten mit 16 px Abstand, die Kachel belegt 7
 * Spalten — das sind 670 px, bei 400 px Hoehe. Verdoppelt: 1340 × 800.
 *
 * Die Angaben standen frueher als Freitext in site_visuals.description und
 * wurden per Regex herausgeschnitten. Das war bruechig (ein Eintrag schrieb
 * "Groesse" ohne Umlaut und fiel deshalb durch) und lief bei Layoutaenderungen
 * auseinander, weil die Zahl in der Datenbank steht und das Layout im Code.
 * Jetzt liegen beide im Repo und lassen sich zusammen aendern.
 *
 * Alle Bilder werden mit object-cover eingepasst: Das Seitenverhaeltnis
 * entscheidet, was abgeschnitten wird. Wer die Zahlen anpasst, sollte das
 * Verhaeltnis der Box treffen, nicht nur die Pixelzahl erhoehen.
 */

export interface VisualSize {
  /** Empfohlene Breite in Pixeln. */
  w: number;
  /** Empfohlene Hoehe in Pixeln. */
  h: number;
  /** Lesbares Seitenverhaeltnis, z. B. "5:3". */
  ratio: string;
  /** Wie die Box zustande kommt, oder worauf beim Motiv zu achten ist. */
  note?: string;
}

/**
 * Lesbares Seitenverhaeltnis. Der gekuerzte Bruch hilft nicht immer weiter:
 * 1340 × 800 kuerzt zu 67:40, was niemand im Kopf hat, obwohl es faktisch 5:3
 * ist. Deshalb erst auf ein gaengiges Verhaeltnis einrasten (bis 1,5 Prozent
 * Abweichung), sonst als Dezimalzahl ausgeben.
 */
const COMMON: [number, number][] = [
  [1, 1], [5, 4], [4, 3], [3, 2], [5, 3], [16, 9], [2, 1], [5, 2], [21, 9],
  [6, 5], [4, 5], [3, 4], [2, 3], [9, 16],
];

const r = (w: number, h: number): string => {
  const target = w / h;
  for (const [a, b] of COMMON) {
    if (Math.abs(a / b - target) / target <= 0.015) return `${a}:${b}`;
  }
  return `${target.toFixed(2).replace(".", ",")} : 1`;
};

const size = (w: number, h: number, note?: string): VisualSize => ({ w, h, ratio: r(w, h), note });

export const VISUAL_SIZES: Record<string, VisualSize> = {
  // ── Website ───────────────────────────────────────────────────────────────
  "fuer-spieler.hero.image": size(1920, 1080, "Bildschirmfüllend hinter dem Hero. Motiv mittig halten, die Ränder werden je nach Fenster beschnitten."),
  "fuer-spieler.hero.video": size(1920, 1080, "Video, 16:9. Als MP4 hochladen oder als Direkt-URL hinterlegen."),

  "home.network.courts": size(1340, 800, "Bento-Kachel über 7 von 12 Spalten (670 × 400 px), verdoppelt für Retina. Unten liegt ein dunkler Verlauf für die Schrift."),
  "home.network.events": size(1340, 720, "Bento-Kachel über 7 von 12 Spalten (670 × 360 px). Unten liegt ein dunkler Verlauf für Text und Button."),
  "home.network.payback": size(960, 800, "Bento-Kachel über 5 von 12 Spalten (474 × 400 px). Ohne Bild bleibt die Kachel wie bisher."),
  "home.network.market": size(960, 720, "Bento-Kachel über 5 von 12 Spalten (474 × 360 px). Ohne Bild bleibt die Kachel wie bisher."),

  "home.verein-steps.step-1": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px). Deutlich flacher, als es wirkt."),
  "home.verein-steps.step-2": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px)."),
  "home.verein-steps.step-3": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px)."),
  "home.verein-steps.step-4": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px)."),
  "home.verein-steps.step-5": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px)."),
  "home.verein-steps.step-6": size(800, 320, "Querformatiger Streifen über der Karte (435 × 176 px)."),

  "booking.tennis.teaser": size(600, 600, "Wird unterschiedlich beschnitten: am Handy ein breiter Streifen, am Desktop eine schmale Spalte links. Motiv mittig halten."),

  // ── iOS-App ───────────────────────────────────────────────────────────────
  // Nicht aus dem Web-Code messbar — die App rendert sie selbst. Werte für
  // ein 3-fach aufgelöstes Telefondisplay.
  "app.auth.backdrop": size(1080, 1920, "App: bildschirmfüllend hochkant hinter dem Login."),
  "app.booking.header": size(1080, 540, "App: Kopfband über der Buchungsansicht."),
  "app.events.header": size(1080, 540, "App: Kopfband über der Event-Ansicht."),
  "app.market.header": size(1080, 540, "App: Kopfband über dem Marketplace."),
  "app.news.header": size(1080, 540, "App: Kopfband über den News."),
  "app.home.booking-cta": size(1080, 720, "App: Karte „Book a court now“ auf der Startseite."),
  "app.home.event-teaser": size(1080, 720, "App: Karte „Discover P2G Events“ auf der Startseite."),
  "app.home.location-teaser-fallback": size(1080, 720, "App: Ersatzbild für Standorte ohne eigenes Foto."),
};

/** Maße zu einem Slot, oder null wenn keiner hinterlegt ist. */
export const visualSize = (key: string): VisualSize | null => VISUAL_SIZES[key] ?? null;

/** "1340 × 800 px" */
export const formatVisualSize = (s: VisualSize): string =>
  `${s.w.toLocaleString("de-DE")} × ${s.h.toLocaleString("de-DE")} px`;
