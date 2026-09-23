// Shared formatting + points math for the marketplace shop.

export const eur = (cents: number): string =>
  "€" + ((cents || 0) / 100).toFixed(2).replace(".", ",");

export const ptsFmt = (n: number): string => (n || 0).toLocaleString("de-DE");

export const discountPct = (priceCents: number, uvpCents?: number | null): number =>
  uvpCents && uvpCents > priceCents ? Math.round((1 - priceCents / uvpCents) * 100) : 0;

/**
 * Punkte-Obergrenze eines Produkts, hergeleitet aus Warenwert, Umrechenkurs und
 * dem globalen Prozentsatz (Preise & Punkte → „Max. Anteil einer Zahlung").
 * Es gibt kein Feld am Produkt mehr: 170 € bei 50 % und 100 Punkten je Euro
 * ergeben 8.500 Punkte. Unabhaengig vom Guthaben des Kaeufers — das ist die
 * Zahl, die auf der Produktseite steht.
 *
 * Abgerundet auf Zehner, weil der Schieberegler im Checkout in Zehnerschritten
 * laeuft: sonst stuende dort eine Zahl, die sich nicht einstellen laesst.
 */
export function productPointsCap(
  subtotalCents: number,
  centsPerPoint: number,
  maxPercent: number,
): number {
  if (centsPerPoint <= 0) return 0;
  const pct = Math.min(100, Math.max(0, maxPercent || 0));
  const capCents = Math.floor((subtotalCents * pct) / 100);
  return Math.max(0, Math.floor(capCents / centsPerPoint / 10) * 10);
}

/**
 * Was dieser Kaeufer tatsaechlich einsetzen kann: die Obergrenze des Produkts,
 * begrenzt durch sein Guthaben. Spiegelt den Server-Deckel in der
 * marketplace-checkout Edge Function.
 */
export function maxRedeemablePoints(
  subtotalCents: number,
  balance: number,
  centsPerPoint: number,
  maxPercent: number,
): number {
  if (!balance || balance <= 0) return 0;
  return Math.min(
    productPointsCap(subtotalCents, centsPerPoint, maxPercent),
    Math.floor(balance / 10) * 10,
  );
}
