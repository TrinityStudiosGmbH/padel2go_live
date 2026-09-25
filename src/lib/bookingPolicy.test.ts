import { describe, expect, it } from "vitest";
import { CANCEL_CUTOFF_HOURS, canCancelFree, cancelDeadline } from "./bookingPolicy";

// Die Frist ist der Punkt, an dem sich Geld entscheidet — hier festgehalten,
// damit eine Aenderung an einer der drei Stellen auffaellt.
describe("Stornofrist", () => {
  const start = new Date("2026-10-03T18:00:00+02:00");

  it("liegt 24 Stunden vor Spielbeginn", () => {
    expect(CANCEL_CUTOFF_HOURS).toBe(24);
    expect(cancelDeadline(start).toISOString()).toBe(new Date("2026-10-02T18:00:00+02:00").toISOString());
  });

  it("erlaubt die Stornierung eine Minute vor Ablauf", () => {
    expect(canCancelFree(start, new Date("2026-10-02T17:59:00+02:00"))).toBe(true);
  });

  it("verweigert sie ab dem Ablauf, auch genau zum Zeitpunkt", () => {
    expect(canCancelFree(start, new Date("2026-10-02T18:00:00+02:00"))).toBe(false);
    expect(canCancelFree(start, new Date("2026-10-03T17:00:00+02:00"))).toBe(false);
  });

  it("nimmt auch die Zeichenkette aus der Datenbank", () => {
    expect(canCancelFree(start.toISOString(), new Date("2026-10-01T12:00:00+02:00"))).toBe(true);
  });
});
