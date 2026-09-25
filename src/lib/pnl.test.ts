import { describe, expect, it } from "vitest";
import { buildPnl, pnlToCsv, type PnlRow } from "./pnl";

const row = (line: string, gross: number, tax: number, net: number, bucket = "2026-09-01"): PnlRow => ({
  bucket_start: bucket, line, gross_cents: gross, tax_cents: tax, net_cents: net, item_count: 1,
});

const find = (lines: ReturnType<typeof buildPnl>, key: string) => lines.find((l) => l.key === key)!;

describe("Ergebnisrechnung", () => {
  const rows: PnlRow[] = [
    row("income_booking_padel", 11900, 1900, 10000),
    row("income_marketplace", 5950, 950, 5000),
    row("refund_booking_padel", -2380, -380, -2000),
    row("cogs", 0, 0, -3000),
    row("stripe_fee", -200, 0, -200),
    row("manual_expense:Miete", -11900, -1900, -10000),
    row("manual_income:Sponsoring", 1190, 190, 1000),
  ];
  const lines = buildPnl(rows, ["2026-09-01"], { showLobby: false });

  it("summiert die Einnahmen inklusive manueller Einnahmen", () => {
    expect(find(lines, "sum_income").total.net).toBe(16000);
    expect(find(lines, "sum_income").total.gross).toBe(19040);
  });

  it("zieht Erstattungen zum Nettoumsatz ab", () => {
    expect(find(lines, "net_revenue").total.net).toBe(14000);
  });

  it("rechnet Rohertrag nach Wareneinsatz und Gebuehren", () => {
    expect(find(lines, "gross_profit").total.net).toBe(14000 - 3000 - 200);
  });

  it("kommt beim Ergebnis nach Fixkosten an", () => {
    expect(find(lines, "result").total.net).toBe(10800 - 10000);
  });

  it("weist die USt-Zahllast als vereinnahmte USt minus Vorsteuer aus", () => {
    // 1900 + 950 - 380 + 190 - 1900 = 760
    expect(find(lines, "vat_due").total.net).toBe(760);
  });

  it("laesst die Lobby-Zeile weg, wenn sie versteckt und leer ist — sonst nicht", () => {
    expect(lines.some((l) => l.key === "income_lobby")).toBe(false);
    const withLobby = buildPnl([...rows, row("income_lobby", 1190, 190, 1000)], ["2026-09-01"], { showLobby: false });
    expect(withLobby.some((l) => l.key === "income_lobby")).toBe(true);
    const shown = buildPnl(rows, ["2026-09-01"], { showLobby: true });
    expect(shown.some((l) => l.key === "income_lobby")).toBe(true);
  });

  it("haelt die Event-Zeile immer, auch bei null", () => {
    expect(find(lines, "income_event").total.net).toBe(0);
  });

  it("verteilt auf Zeitscheiben und bildet die Summe", () => {
    const two = buildPnl(
      [row("income_booking_padel", 1190, 190, 1000, "2026-09-01"), row("income_booking_padel", 2380, 380, 2000, "2026-10-01")],
      ["2026-09-01", "2026-10-01"], { showLobby: false },
    );
    const l = find(two, "income_booking_padel");
    expect(l.values["2026-09-01"].net).toBe(1000);
    expect(l.values["2026-10-01"].net).toBe(2000);
    expect(l.total.net).toBe(3000);
  });

  it("schreibt CSV mit Dezimalkomma", () => {
    const csv = pnlToCsv(lines, ["2026-09-01"], ["Sep 2026"], "net");
    expect(csv).toContain("Position;Sep 2026");
    expect(csv).toContain("Buchungen Padel;100,00");
    expect(csv).toContain("Ergebnis;8,00");
  });
});
