import { useDataMode } from "@/hooks/useDataMode";

/**
 * Test- oder Live-Daten in der Verwaltung. Folgt Stripe, solange niemand
 * eingreift; danach bleibt die Wahl, bis sie zurueckgesetzt wird.
 */
export function DataModeSwitch() {
  const { isTest, override, stripeIsTest, setOverride } = useDataMode();
  if (isTest === undefined) return null;

  const btn = (active: boolean, tone: "test" | "live") =>
    `rounded-lg px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em] transition-colors ${
      active
        ? tone === "test"
          ? "bg-[hsl(41_100%_65%)] text-[#0A0A0A]"
          : "bg-primary text-[#0A0A0A]"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div
      className="flex items-center gap-1.5"
      title={
        override
          ? `Feste Ansicht: ${override === "test" ? "Testdaten" : "Live-Daten"}. Stripe läuft im ${stripeIsTest ? "Test" : "Echt"}betrieb.`
          : `Folgt Stripe: ${stripeIsTest ? "Testbetrieb, Testdaten" : "Echtbetrieb, Live-Daten"}.`
      }
    >
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_50%)] sm:inline">Daten</span>
      <div className="flex gap-[2px] rounded-[10px] border border-[hsl(0_0%_14%)] bg-white/[0.04] p-[2px]">
        <button type="button" onClick={() => setOverride("test")} className={btn(isTest, "test")}>Test</button>
        <button type="button" onClick={() => setOverride("live")} className={btn(!isTest, "live")}>Live</button>
      </div>
      {override && (
        <button
          type="button"
          onClick={() => setOverride(null)}
          className="text-[10.5px] text-muted-foreground underline-offset-2 hover:underline"
        >
          wie Stripe
        </button>
      )}
    </div>
  );
}
