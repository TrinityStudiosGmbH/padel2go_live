/**
 * Ergebnisrechnung aus den Zeilen von get_pnl(). Die Datenbank liefert je
 * Zeitscheibe und Zeile Brutto, USt und Netto; hier entsteht daraus die
 * Tabelle mit Zwischensummen. Reine Rechnung, keine Abhaengigkeiten — damit
 * sie testbar ist und Tabelle und CSV dieselben Zahlen zeigen.
 */

export type PnlBasis = "cash" | "service";
export type PnlBucket = "total" | "day" | "week" | "month";
export type PnlView = "gross" | "net";

export interface PnlRow {
  bucket_start: string;
  line: string;
  gross_cents: number;
  tax_cents: number;
  net_cents: number;
  item_count: number;
}

export interface Money {
  gross: number;
  tax: number;
  net: number;
}

export type PnlLineKind =
  | "income"
  | "refund"
  | "cost"
  | "manual_income"
  | "manual_expense"
  | "subtotal"
  | "result"
  | "memo";

export interface PnlLine {
  key: string;
  label: string;
  kind: PnlLineKind;
  /** Werte je Zeitscheibe (Schluessel = bucket_start) */
  values: Record<string, Money>;
  total: Money;
}

export const ZERO: Money = { gross: 0, tax: 0, net: 0 };

const add = (a: Money, b: Money): Money => ({ gross: a.gross + b.gross, tax: a.tax + b.tax, net: a.net + b.net });
const neg = (a: Money): Money => ({ gross: -a.gross, tax: -a.tax, net: -a.net });

/** Die festen Einnahmezeilen, in dieser Reihenfolge. */
export const INCOME_CATEGORIES: { key: string; label: string }[] = [
  { key: "booking_padel", label: "Buchungen Padel" },
  { key: "booking_tennis", label: "Buchungen Tennis" },
  { key: "lobby", label: "Lobby-Anteile" },
  { key: "marketplace", label: "Marketplace" },
  { key: "event", label: "Event-Tickets" },
];

export interface BuildOptions {
  /** Lobby-Zeile nur zeigen, wenn die Funktion sichtbar ist oder Geld darauf liegt. */
  showLobby: boolean;
}

function sumLine(values: Record<string, Money>): Money {
  return Object.values(values).reduce(add, ZERO);
}

function emptyValues(buckets: string[]): Record<string, Money> {
  const v: Record<string, Money> = {};
  for (const b of buckets) v[b] = ZERO;
  return v;
}

function line(key: string, label: string, kind: PnlLineKind, values: Record<string, Money>): PnlLine {
  return { key, label, kind, values, total: sumLine(values) };
}

function combine(keys: PnlLine[], buckets: string[]): Record<string, Money> {
  const out = emptyValues(buckets);
  for (const l of keys) for (const b of buckets) out[b] = add(out[b], l.values[b] ?? ZERO);
  return out;
}

const isZero = (m: Money) => m.gross === 0 && m.tax === 0 && m.net === 0;

/**
 * Baut aus den Rohzeilen die Ergebnisrechnung. `buckets` sind die Spalten in
 * Reihenfolge; Zeilen ohne Betrag werden bei Erstattungen und manuellen
 * Posten weggelassen, die Einnahmezeilen bleiben immer stehen.
 */
export function buildPnl(rows: PnlRow[], buckets: string[], opts: BuildOptions): PnlLine[] {
  const byLine = new Map<string, Record<string, Money>>();
  for (const r of rows) {
    const v = byLine.get(r.line) ?? emptyValues(buckets);
    if (!(r.bucket_start in v)) v[r.bucket_start] = ZERO;
    v[r.bucket_start] = add(v[r.bucket_start], { gross: r.gross_cents, tax: r.tax_cents, net: r.net_cents });
    byLine.set(r.line, v);
  }
  const get = (key: string) => byLine.get(key) ?? emptyValues(buckets);

  const out: PnlLine[] = [];

  // ── Einnahmen ─────────────────────────────────────────────────────────
  const incomeLines: PnlLine[] = [];
  for (const c of INCOME_CATEGORIES) {
    const values = get(`income_${c.key}`);
    if (c.key === "lobby" && !opts.showLobby && isZero(sumLine(values))) continue;
    incomeLines.push(line(`income_${c.key}`, c.label, "income", values));
  }
  for (const key of [...byLine.keys()].filter((k) => k.startsWith("manual_income:")).sort()) {
    incomeLines.push(line(key, key.slice("manual_income:".length), "manual_income", get(key)));
  }
  out.push(...incomeLines);
  const incomeTotal = line("sum_income", "Einnahmen", "subtotal", combine(incomeLines, buckets));
  out.push(incomeTotal);

  // ── Erstattungen ──────────────────────────────────────────────────────
  const refundLines: PnlLine[] = [];
  for (const c of INCOME_CATEGORIES) {
    const values = get(`refund_${c.key}`);
    if (isZero(sumLine(values))) continue;
    refundLines.push(line(`refund_${c.key}`, `Erstattungen ${c.label}`, "refund", values));
  }
  out.push(...refundLines);
  const netRevenue = line("net_revenue", "Nettoumsatz", "subtotal", combine([incomeTotal, ...refundLines], buckets));
  out.push(netRevenue);

  // ── Kosten des Umsatzes ───────────────────────────────────────────────
  const cogs = line("cogs", "Wareneinsatz", "cost", get("cogs"));
  const fees = line("stripe_fee", "Stripe-Gebühren", "cost", get("stripe_fee"));
  out.push(cogs, fees);
  const grossProfit = line("gross_profit", "Rohertrag", "subtotal", combine([netRevenue, cogs, fees], buckets));
  out.push(grossProfit);

  // ── Fixkosten und Ausgaben ────────────────────────────────────────────
  const expenseLines: PnlLine[] = [];
  for (const key of [...byLine.keys()].filter((k) => k.startsWith("manual_expense:")).sort()) {
    expenseLines.push(line(key, key.slice("manual_expense:".length), "manual_expense", get(key)));
  }
  out.push(...expenseLines);
  const expenseTotal = line("sum_expense", "Fixkosten & Ausgaben", "subtotal", combine(expenseLines, buckets));
  out.push(expenseTotal);

  // ── Ergebnis ──────────────────────────────────────────────────────────
  out.push(line("result", "Ergebnis", "result", combine([grossProfit, expenseTotal], buckets)));

  // ── USt-Zahllast, nachrichtlich: vereinnahmte USt minus Vorsteuer ─────
  // Bei Ausgaben ist tax bereits negativ (Vorsteuer), bei Einnahmen positiv.
  const vat = combine([incomeTotal, ...refundLines, ...expenseLines], buckets);
  const vatOnly: Record<string, Money> = {};
  for (const b of buckets) vatOnly[b] = { gross: vat[b].tax, tax: vat[b].tax, net: vat[b].tax };
  out.push(line("vat_due", "USt-Zahllast (nachrichtlich)", "memo", vatOnly));

  return out;
}

export const valueOf = (m: Money, view: PnlView): number => (view === "gross" ? m.gross : m.net);

/** Vorzeichen fuer die Anzeige: Kosten stehen als Abzug, Erstattungen ebenfalls. */
export const signed = (m: Money): Money => m;

export { add as addMoney, neg as negMoney };

/** CSV mit Semikolon und Dezimalkomma, wie deutsches Excel es erwartet. */
export function pnlToCsv(lines: PnlLine[], buckets: string[], bucketLabels: string[], view: PnlView): string {
  const num = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = ["Position", ...bucketLabels, buckets.length > 1 ? "Summe" : ""].filter(Boolean).join(";");
  const body = lines.map((l) =>
    [esc(l.label), ...buckets.map((b) => num(valueOf(l.values[b] ?? ZERO, view))), ...(buckets.length > 1 ? [num(valueOf(l.total, view))] : [])].join(";"),
  );
  return "﻿" + [header, ...body].join("\n");
}
