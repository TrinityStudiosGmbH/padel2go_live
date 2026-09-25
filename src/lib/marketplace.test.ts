import { describe, expect, it } from "vitest";
import { productPointsCap, maxRedeemablePoints, discountPct, eur } from "./marketplace";

/**
 * Die Punkte-Obergrenze ist die Stelle, an der sich ein Rechenfehler direkt in
 * Geld uebersetzt: zu hoch, und der Kunde zahlt weniger als erlaubt; zu
 * niedrig, und er kann Punkte nicht einsetzen, die ihm zustehen. Sie wird
 * nirgends gepflegt, sondern aus Warenwert, Kurs und Prozentsatz gerechnet —
 * hier festgehalten, damit eine spaetere Aenderung auffaellt.
 */

// Der Deckel, den die marketplace-checkout Edge Function serverseitig zieht.
// Das Frontend darf nie mehr anbieten, als der Server annimmt.
const serverCapCents = (subtotalCents: number, maxPercent: number) =>
  Math.floor((subtotalCents * maxPercent) / 100);

describe("productPointsCap", () => {
  it("rechnet das dokumentierte Beispiel: 170 € bei 50 % und 100 Punkten je Euro", () => {
    expect(productPointsCap(17000, 1, 50)).toBe(8500);
  });

  it("haelt den Prozentsatz ein", () => {
    // 100 € bei 20 % = 20 € = 2.000 Punkte bei 100 Punkten je Euro.
    expect(productPointsCap(10000, 1, 20)).toBe(2000);
  });

  it("rundet auf Zehner ab, weil der Regler in Zehnerschritten laeuft", () => {
    // 10,07 € bei 50 % = 503 Cent = 503 Punkte -> 500.
    expect(productPointsCap(1007, 1, 50)).toBe(500);
    expect(productPointsCap(1007, 1, 50) % 10).toBe(0);
  });

  it("gibt ohne gueltigen Kurs nichts frei", () => {
    expect(productPointsCap(17000, 0, 50)).toBe(0);
    expect(productPointsCap(17000, -1, 50)).toBe(0);
  });

  it("begrenzt den Prozentsatz auf 0 bis 100", () => {
    expect(productPointsCap(10000, 1, 250)).toBe(productPointsCap(10000, 1, 100));
    expect(productPointsCap(10000, 1, -5)).toBe(0);
  });

  it("bleibt bei einem anderen Kurs stimmig", () => {
    // 50 Punkte je Euro = 2 Cent je Punkt. 170 € bei 50 % = 85 € = 4.250 Punkte.
    expect(productPointsCap(17000, 2, 50)).toBe(4250);
  });

  it("uebersteigt nie den serverseitigen Deckel", () => {
    for (let subtotal = 50; subtotal <= 100000; subtotal += 137) {
      for (const centsPerPoint of [0.5, 1, 2, 5]) {
        for (const pct of [0, 10, 33, 50, 80, 100]) {
          const discountCents = productPointsCap(subtotal, centsPerPoint, pct) * centsPerPoint;
          expect(discountCents).toBeLessThanOrEqual(serverCapCents(subtotal, pct));
        }
      }
    }
  });
});

describe("maxRedeemablePoints", () => {
  it("begrenzt durch das Guthaben, wenn es unter dem Produktdeckel liegt", () => {
    expect(maxRedeemablePoints(17000, 1200, 1, 50)).toBe(1200);
  });

  it("begrenzt durch den Produktdeckel, wenn das Guthaben darueber liegt", () => {
    expect(maxRedeemablePoints(17000, 99999, 1, 50)).toBe(8500);
  });

  it("rundet auch das Guthaben auf Zehner ab", () => {
    expect(maxRedeemablePoints(17000, 1207, 1, 50)).toBe(1200);
  });

  it("gibt ohne Guthaben nichts frei", () => {
    expect(maxRedeemablePoints(17000, 0, 1, 50)).toBe(0);
    expect(maxRedeemablePoints(17000, -50, 1, 50)).toBe(0);
  });

  it("gibt bei einem Guthaben unter zehn Punkten nichts frei", () => {
    expect(maxRedeemablePoints(17000, 9, 1, 50)).toBe(0);
  });

  it("verlangt nie mehr Punkte, als der Kunde hat", () => {
    for (const balance of [0, 5, 10, 99, 1234, 100000]) {
      for (const subtotal of [500, 4999, 17000, 250000]) {
        expect(maxRedeemablePoints(subtotal, balance, 1, 50)).toBeLessThanOrEqual(balance);
      }
    }
  });
});

describe("Anzeige", () => {
  it("formatiert Betraege mit Komma", () => {
    expect(eur(17000)).toBe("€170,00");
    expect(eur(5)).toBe("€0,05");
    expect(eur(0)).toBe("€0,00");
  });

  it("rechnet den Nachlass gegenueber der UVP", () => {
    expect(discountPct(8000, 10000)).toBe(20);
    expect(discountPct(10000, 10000)).toBe(0);
    expect(discountPct(10000, null)).toBe(0);
  });
});
