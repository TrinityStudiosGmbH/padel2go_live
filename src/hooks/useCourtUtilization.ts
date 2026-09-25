import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// RPC return shapes. These functions are added by the
// 20260620120000_court_utilization_rpcs.sql migration and are not yet in the
// generated Supabase types, so the rpc calls are cast.

/** Sportart-Filter der RPCs. `null` = alle Sportarten (konsolidiert). */
export type UtilizationSport = "padel" | "tennis" | null;

export interface CourtUtilizationRow {
  court_id: string;
  court_name: string;
  sport: "padel" | "tennis";
  location_id: string;
  location_name: string;
  location_city: string | null;
  is_active: boolean;
  is_online: boolean;
  possible_minutes: number;
  booked_minutes: number;
  bookings_count: number;
  capacity_pct: number;
  // null for club managers — revenue is admin-only (enforced server-side)
  revenue_cents: number | null;
}

export interface UtilizationTrendPoint {
  month_start: string;
  possible_minutes: number;
  booked_minutes: number;
  capacity_pct: number;
}

/**
 * Per-court utilization for one month. Returns only the courts the caller may see.
 * `sport` filtert serverseitig — die Seite summiert über die Zeilen, ein
 * Frontend-Filter würde die Kennzahlen verfälschen.
 */
export function useCourtUtilization(
  monthStartISO: string | null,
  sport: UtilizationSport = null,
  /** Test- oder Live-Daten; null = wie der Stripe-Betrieb. */
  isTest: boolean | null = null,
) {
  return useQuery({
    queryKey: ["utilization-courts", monthStartISO, sport, isTest],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_court_utilization", {
        p_month_start: monthStartISO,
        p_sport: sport,
        p_is_test: isTest,
      });
      if (error) throw error;
      return (data ?? []) as CourtUtilizationRow[];
    },
    enabled: !!monthStartISO,
  });
}

/** Monthly trend (last N months) for a single court. */
export function useCourtUtilizationTrend(
  courtId: string | null,
  months = 6,
  sport: UtilizationSport = null,
  isTest: boolean | null = null,
) {
  return useQuery({
    queryKey: ["utilization-court-trend", courtId, months, sport, isTest],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_court_utilization_trend", {
        p_court_id: courtId,
        p_months: months,
        p_sport: sport,
        p_is_test: isTest,
      });
      if (error) throw error;
      return (data ?? []) as UtilizationTrendPoint[];
    },
    enabled: !!courtId,
  });
}

/** Network-wide monthly trend (admin only). */
export function useNetworkUtilizationTrend(months = 6, sport: UtilizationSport = null, isTest: boolean | null = null) {
  return useQuery({
    queryKey: ["utilization-network-trend", months, sport, isTest],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_network_utilization_trend", {
        p_months: months,
        p_sport: sport,
        p_is_test: isTest,
      });
      if (error) throw error;
      return (data ?? []) as UtilizationTrendPoint[];
    },
  });
}
