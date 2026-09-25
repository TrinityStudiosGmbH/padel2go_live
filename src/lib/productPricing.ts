/**
 * Brutto, Netto, Steuer und Rohertrag eines Marketplace-Produkts. Gespeichert
 * wird immer der Bruttopreis (was der Kunde zahlt) und der Einkaufspreis netto;
 * alles andere wird gerechnet — an genau dieser Stelle, damit Formular,
 * Bestellliste und PnL dieselben Zahlen zeigen.
 */
export const grossFromNet = (netCents: number, taxRate: number): number =>
  Math.round(netCents * (1 + taxRate / 100));

export const netFromGross = (grossCents: number, taxRate: number): number =>
  Math.round(grossCents / (1 + taxRate / 100));

export const taxFromGross = (grossCents: number, taxRate: number): number =>
  grossCents - netFromGross(grossCents, taxRate);

/** Rohertrag je Stueck: Netto-Verkaufspreis minus Einkaufspreis (netto). */
export const unitMarginCents = (grossCents: number, taxRate: number, costCents: number): number =>
  netFromGross(grossCents, taxRate) - costCents;

/** Marge in Prozent vom Netto-Verkaufspreis, eine Nachkommastelle. */
export const marginPercent = (grossCents: number, taxRate: number, costCents: number): number => {
  const net = netFromGross(grossCents, taxRate);
  if (net <= 0) return 0;
  return Math.round(((net - costCents) / net) * 1000) / 10;
};
