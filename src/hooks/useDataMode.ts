import { useCallback, useSyncExternalStore } from "react";
import { useStripeIsTest } from "@/hooks/useStripeIsTest";

/**
 * Welche Daten die Verwaltung sieht: Test oder Live. Ohne eigene Wahl folgt
 * die Ansicht dem Stripe-Betrieb (Testbetrieb -> Testdaten). Die Wahl gilt fuer
 * alle Admin-Seiten zugleich und ueberlebt das Neuladen; sie aendert nichts
 * daran, wie neue Vorgaenge gestempelt werden — das entscheidet allein Stripe.
 */
export type DataModeOverride = "test" | "live" | null;

const KEY = "p2g-admin-data-mode";
const listeners = new Set<() => void>();

function read(): DataModeOverride {
  try {
    const v = localStorage.getItem(KEY);
    return v === "test" || v === "live" ? v : null;
  } catch {
    return null;
  }
}

let current: DataModeOverride = read();

function write(v: DataModeOverride) {
  current = v;
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // Ohne Speicher gilt die Wahl fuer diese Sitzung.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useDataMode() {
  const override = useSyncExternalStore(subscribe, () => current, () => null);
  const { data: stripeIsTest } = useStripeIsTest();
  const isTest: boolean | undefined = override ? override === "test" : stripeIsTest;
  const setOverride = useCallback((v: DataModeOverride) => write(v), []);
  return { isTest, override, stripeIsTest, setOverride };
}
