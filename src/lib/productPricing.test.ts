import { describe, expect, it } from "vitest";
import { grossFromNet, marginPercent, netFromGross, taxFromGross, unitMarginCents } from "./productPricing";

describe("Preisrechnung", () => {
  it("rechnet Netto und Brutto bei 19 % in beide Richtungen", () => {
    expect(grossFromNet(10000, 19)).toBe(11900);
    expect(netFromGross(11900, 19)).toBe(10000);
    expect(taxFromGross(11900, 19)).toBe(1900);
  });

  it("rundet auf ganze Cent", () => {
    expect(netFromGross(9999, 19)).toBe(8403);
    expect(taxFromGross(9999, 19)).toBe(1596);
  });

  it("kommt mit 7 % und 0 % zurecht", () => {
    expect(netFromGross(10700, 7)).toBe(10000);
    expect(netFromGross(5000, 0)).toBe(5000);
    expect(taxFromGross(5000, 0)).toBe(0);
  });

  it("rechnet Rohertrag und Marge vom Netto", () => {
    expect(unitMarginCents(11900, 19, 6000)).toBe(4000);
    expect(marginPercent(11900, 19, 6000)).toBe(40);
  });

  it("zeigt eine negative Marge, statt sie zu verstecken", () => {
    expect(unitMarginCents(11900, 19, 12000)).toBe(-2000);
    expect(marginPercent(11900, 19, 12000)).toBe(-20);
  });
});
