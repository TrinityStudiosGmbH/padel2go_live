import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import type { CourtSport } from "@/components/booking/types";

/** Eine Zeile der globalen Standardpreise. */
export interface CourtPrice {
  id: string;
  duration_minutes: number;
  price_cents: number;
  sport: CourtSport;
}

/** Ausnahme eines Standorts — leeres Feld bedeutet "globaler Wert gilt". */
export interface LocationPriceException {
  id: string;
  location_id: string;
  sport: CourtSport;
  price_60_cents: number | null;
  price_90_cents: number | null;
  price_120_cents: number | null;
  payback_points_60: number | null;
  note: string | null;
}

const BOOKING_RATES_QUERY_KEY = "booking-rates";
const COURT_MIN_PRICE_QUERY_KEY = "court-min-price";
const PRICE_EXCEPTIONS_QUERY_KEY = "location-price-exceptions";
const COURT_BASE_PRICES_QUERY_KEY = "court-base-prices";

/** Alle Preisabfragen auf einmal auffrischen — Preise hängen jetzt global zusammen. */
function invalidatePricing(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    [QUERY_KEYS.globalPrices],
    [PRICE_EXCEPTIONS_QUERY_KEY],
    [COURT_BASE_PRICES_QUERY_KEY],
    [BOOKING_RATES_QUERY_KEY],
    [COURT_MIN_PRICE_QUERY_KEY],
    [QUERY_KEYS.locationMinPrice],
  ]) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Die globalen Standardpreise. Sie gelten für alle Standorte; Abweichungen
 * stehen in `location_price_exceptions`.
 */
export function useGlobalPrices() {
  return useQuery({
    queryKey: [QUERY_KEYS.globalPrices],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("court_prices")
        .select("id, duration_minutes, price_cents, sport")
        .order("sport")
        .order("duration_minutes");

      if (error) throw error;
      return (data ?? []) as CourtPrice[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertGlobalPrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Array<{ sport: CourtSport; duration_minutes: number; price_cents: number }>) => {
      const { error } = await (supabase as any)
        .from("court_prices")
        .upsert(rows, { onConflict: "sport,duration_minutes" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePricing(queryClient);
      toast.success("Standardpreise gespeichert");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Speichern", { description: error.message });
    },
  });
}

export function useLocationPriceExceptions() {
  return useQuery({
    queryKey: [PRICE_EXCEPTIONS_QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("location_price_exceptions")
        .select("id, location_id, sport, price_60_cents, price_90_cents, price_120_cents, payback_points_60, note")
        .order("created_at");

      if (error) throw error;
      return (data ?? []) as LocationPriceException[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertLocationPriceException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...row }: Omit<LocationPriceException, "id"> & { id?: string }) => {
      // Bewusst kein upsert: beim Bearbeiten darf die Sportart wechseln, dann
      // trifft der Konflikt-Schluessel (location_id, sport) keine Zeile mehr und
      // Postgres wuerde stattdessen einfuegen und am Primaerschluessel scheitern.
      const query = id
        ? (supabase as any).from("location_price_exceptions").update(row).eq("id", id)
        : (supabase as any).from("location_price_exceptions").insert(row);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePricing(queryClient);
      toast.success("Ausnahme gespeichert");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Speichern", { description: error.message });
    },
  });
}

export function useDeleteLocationPriceException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("location_price_exceptions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePricing(queryClient);
      toast.success("Ausnahme gelöscht — es gilt wieder der Standardpreis");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Löschen", { description: error.message });
    },
  });
}

/**
 * Preise eines Courts ohne Zeitfenster: Standort-Ausnahme, sonst globaler
 * Standardpreis. Genau die Kette, die auch `resolve_booking_rate` unterhalb der
 * Bänder geht — vorher fiel die Buchungsseite auf globale Werte zurück, die die
 * Kasse nicht kannte, und die Buchung scheiterte erst beim Bezahlen.
 */
export function useCourtBasePrices(courtId: string | null) {
  return useQuery({
    queryKey: [COURT_BASE_PRICES_QUERY_KEY, courtId],
    queryFn: async (): Promise<CourtPrice[]> => {
      if (!courtId) return [];

      const { data: court, error: courtError } = await (supabase as any)
        .from("courts")
        .select("location_id, sport")
        .eq("id", courtId)
        .maybeSingle();
      if (courtError) throw courtError;
      if (!court) return [];

      const sport = (court.sport ?? "padel") as CourtSport;
      const durations = sport === "tennis" ? [60] : [60, 90, 120];

      const [{ data: globals, error: globalError }, { data: exception }] = await Promise.all([
        (supabase as any)
          .from("court_prices")
          .select("id, duration_minutes, price_cents, sport")
          .eq("sport", sport),
        (supabase as any)
          .from("location_price_exceptions")
          .select("price_60_cents, price_90_cents, price_120_cents")
          .eq("location_id", court.location_id)
          .eq("sport", sport)
          .maybeSingle(),
      ]);
      if (globalError) throw globalError;

      const exceptionFor = (duration: number): number | null => {
        if (!exception) return null;
        if (duration === 60) return exception.price_60_cents ?? null;
        if (duration === 90) return exception.price_90_cents ?? null;
        if (duration === 120) return exception.price_120_cents ?? null;
        return null;
      };

      return durations
        .map((duration) => {
          const global = ((globals ?? []) as CourtPrice[]).find((p) => p.duration_minutes === duration);
          const price = exceptionFor(duration) ?? global?.price_cents ?? null;
          if (price === null) return null;
          return {
            id: `${courtId}-${duration}`,
            duration_minutes: duration,
            price_cents: price,
            sport,
          } satisfies CourtPrice;
        })
        .filter((p): p is CourtPrice => p !== null);
    },
    enabled: !!courtId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Preis einer Dauer aus einer Preisliste. */
export function getPriceFromList(prices: CourtPrice[] | undefined, durationMinutes: number): number | null {
  if (!prices || prices.length === 0) return null;
  return prices.find((p) => p.duration_minutes === durationMinutes)?.price_cents ?? null;
}

/** Preis + Punkte eines Slots, aufgelöst durch die Datenbank. */
export interface ResolvedBookingRate {
  /** Startzeitpunkt wie von der DB zurückgegeben (ISO). */
  startTime: string;
  /** Der zu zahlende Preis — bei Vereinsmitgliedern bereits die Mitglieder-Kondition. */
  priceCents: number | null;
  /** Punkte für diese Buchung: feste Zahl je Dauer, 0 bei Tennis. */
  paybackPoints: number;
  priceBandName: string | null;
  /** Externenpreis vor Mitglieder-Kondition. Gleich priceCents, wenn kein Vorteil greift. */
  basePriceCents: number | null;
  /** 'home' = Court des eigenen Vereins, 'away' = fremder Court, null = kein Mitglied. */
  memberScope: "home" | "away" | null;
  /** Tatsächlich gewährter Abzug in Cent (0 = keiner, z.B. weil das Monatslimit erschöpft ist). */
  memberDiscountCents: number;
  /** Verbleibende vergünstigte Buchungen im Monat; null = unbegrenzt oder kein Mitglied. */
  memberLimitRemaining: number | null;
}

interface RawBookingRateRow {
  start_time: string;
  price_cents: number | null;
  payback_points: number | null;
  price_band_name: string | null;
  base_price_cents: number | null;
  member_scope: string | null;
  member_discount_cents: number | null;
  member_limit_remaining: number | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function localDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Löst Preis + Punkte für ALLE Slots eines Tages in EINEM Request auf
 * (RPC `resolve_booking_rates_batch`). Die Logik bleibt in der Datenbank,
 * damit Anzeige und Checkout nicht auseinanderlaufen.
 */
export function useResolvedBookingRates({
  courtId,
  startTimes,
  durationMinutes,
}: {
  courtId: string | null;
  /** Startzeitpunkte aller Slots des angezeigten Tages. */
  startTimes: Array<string | Date>;
  durationMinutes: number;
}) {
  const { user } = useAuth();
  const startIsos = useMemo(() => startTimes.map(toIso), [startTimes]);
  const dateKey = startIsos.length > 0 ? localDateKey(startIsos[0]) : null;

  const query = useQuery({
    // Der Preis hängt seit den Mitglieder-Konditionen am angemeldeten Nutzer —
    // ohne user.id im Schlüssel würde nach dem Login der Gastpreis weiter angezeigt.
    queryKey: [BOOKING_RATES_QUERY_KEY, courtId, dateKey, durationMinutes, user?.id ?? "anon"],
    queryFn: async (): Promise<ResolvedBookingRate[]> => {
      const { data, error } = await (supabase as any).rpc("resolve_booking_rates_batch", {
        p_court_id: courtId,
        p_starts: startIsos,
        p_duration_minutes: durationMinutes,
      });

      if (error) throw error;

      return ((data ?? []) as RawBookingRateRow[]).map((row) => ({
        startTime: row.start_time,
        priceCents: row.price_cents ?? null,
        paybackPoints: Number(row.payback_points ?? 0) || 0,
        priceBandName: row.price_band_name,
        basePriceCents: row.base_price_cents ?? row.price_cents ?? null,
        memberScope: (row.member_scope as "home" | "away" | null) ?? null,
        memberDiscountCents: Number(row.member_discount_cents ?? 0) || 0,
        memberLimitRemaining:
          row.member_limit_remaining === null || row.member_limit_remaining === undefined
            ? null
            : Number(row.member_limit_remaining),
      }));
    },
    enabled: !!courtId && startIsos.length > 0 && durationMinutes > 0,
    staleTime: 5 * 60 * 1000,
  });

  /** Lookup über den Zeitstempel — String-Vergleich scheitert an DB-Formatierung. */
  const ratesByStart = useMemo(() => {
    const map = new Map<number, ResolvedBookingRate>();
    for (const rate of query.data ?? []) {
      map.set(new Date(rate.startTime).getTime(), rate);
    }
    return map;
  }, [query.data]);

  return {
    rates: query.data,
    ratesByStart,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/**
 * Rate eines einzelnen Slots aus dem Ergebnis von `useResolvedBookingRates`.
 * `undefined` = noch nicht geladen -> Aufrufer bleibt beim bisherigen Preis.
 */
export function getRateForStart(
  ratesByStart: Map<number, ResolvedBookingRate>,
  start: string | Date,
): ResolvedBookingRate | undefined {
  return ratesByStart.get(new Date(start).getTime());
}

/**
 * Günstigster Preis über die Courts EINER Sportart an einem Standort, inkl.
 * Zeitfenster und Standort-Ausnahme. Die Sportart ist entscheidend: ohne Filter
 * würde ein günstiger Tennis-Court als Padel-"ab X €" auf der Karte landen.
 */
export async function fetchLocationMinPriceCents(
  courtIds: string[],
  sport: CourtSport = "padel",
): Promise<number | null> {
  if (courtIds.length === 0) return null;

  const { data: sportCourts, error: sportError } = await (supabase as any)
    .from("courts")
    .select("id")
    .in("id", courtIds)
    .eq("sport", sport);

  const scopedIds = sportError
    ? courtIds
    : ((sportCourts ?? []) as { id: string }[]).map((court) => court.id);

  if (scopedIds.length === 0) return null;

  const results = await Promise.all(
    scopedIds.map(async (courtId) => {
      const { data, error } = await (supabase as any).rpc("court_min_price_cents", {
        p_court_id: courtId,
      });
      if (error) return null;
      return (data as number | null) ?? null;
    }),
  );

  const resolved = results.filter((p): p is number => p !== null);
  if (resolved.length > 0) return Math.min(...resolved);

  const { data: globalPrice } = await (supabase as any)
    .from("court_prices")
    .select("price_cents")
    .eq("sport", sport)
    .eq("duration_minutes", 60)
    .maybeSingle();

  return globalPrice?.price_cents ?? null;
}
