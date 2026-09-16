import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";

/**
 * Sichtbarkeit von Funktionen — EIN Modell für alles.
 *
 * Jede Funktion hat genau einen Zustand in site_settings.feature_<name>_state:
 *   visible → für alle
 *   demo    → nur Admins (mit Vorschau-Hinweis), alle anderen sehen „Bald verfügbar"
 *   hidden  → niemand, auch Admins nicht
 *
 * Ein Zustand steuert immer Nav-Link, Route und In-Page-Einstiege zusammen
 * (RequireFeature + canSee). Inhalte (Standort online, Event veröffentlicht …)
 * sind davon unabhängig und werden dort gepflegt, wo sie entstehen.
 */
export type FeatureName =
  | "booking"
  | "marketplace"
  | "events"
  | "lobbies"
  | "league"
  | "p2g"
  | "friends";

export type FeatureState = "visible" | "demo" | "hidden";

export const FEATURE_NAMES: FeatureName[] = [
  "booking",
  "marketplace",
  "events",
  "lobbies",
  "league",
  "p2g",
  "friends",
];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  booking: "Court-Buchung",
  marketplace: "Shop",
  events: "Events",
  lobbies: "Lobbies",
  league: "Liga",
  p2g: "P2G-Punkte",
  friends: "Freunde & Chat",
};

export const FEATURE_TOGGLES_QUERY_KEY = ["feature-toggles"];

export const useFeatureToggles = () => {
  const { isAdmin, loading: adminLoading } = useAdminAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: FEATURE_TOGGLES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const row = (data ?? {}) as Record<string, unknown>;

  const states = FEATURE_NAMES.reduce((acc, name) => {
    const value = row[`feature_${name}_state`];
    acc[name] = value === "visible" || value === "demo" ? value : "hidden";
    return acc;
  }, {} as Record<FeatureName, FeatureState>);

  const stateOf = (feature: FeatureName): FeatureState => states[feature];
  const canSee = (feature: FeatureName): boolean => {
    const state = states[feature];
    return state === "visible" || (state === "demo" && isAdmin);
  };
  /** Admin sieht eine Funktion, die für alle anderen noch verborgen ist. */
  const isPreview = (feature: FeatureName): boolean => states[feature] === "demo" && isAdmin;

  return {
    states,
    stateOf,
    canSee,
    isPreview,
    isAdmin,
    isLoading: isLoading || adminLoading,
    refetch,
  };
};
