import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarCheck, Clock, Activity, Euro, Gauge, XCircle } from "lucide-react";
import { format, subDays, differenceInHours, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { Location, courtSport } from "./types";
import { SportScopeTabs, type SportScope } from "@/components/admin/SportScopeTabs";
import { cn } from "@/lib/utils";
import { useDataMode } from "@/hooks/useDataMode";

interface LocationAnalyticsTabProps {
  locations: Location[];
}

type TimeRange = "7" | "30" | "90" | "all";

interface Booking {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  price_cents: number | null;
  court_id: string;
  location_id: string;
  created_at: string;
  courts: { name: string } | null;
}

const TABLE_HEAD_CLASSES =
  "h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground";

export function LocationAnalyticsTab({ locations }: LocationAnalyticsTabProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("7");
  const [sportScope, setSportScope] = useState<SportScope>("all");

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  /**
   * Court-IDs der gewählten Sportart. `bookings` trägt keine Sportart, deshalb
   * wird über die Court-IDs gefiltert. `null` = nicht einschränken; ein LEERES
   * Array heißt „diese Sportart hat keine Courts" und muss 0 Treffer liefern.
   */
  const scopedCourtIds = useMemo(() => {
    if (sportScope === "all") return null;
    return locations.flatMap((l) =>
      (l.courts || []).filter((c) => courtSport(c) === sportScope).map((c) => c.id)
    );
  }, [locations, sportScope]);

  // Testbuchungen im Testbetrieb, echte im Echtbetrieb — nie gemischt.
  const { isTest } = useDataMode();

  // Fetch bookings for analytics
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["admin-location-analytics", selectedLocationId, timeRange, sportScope, isTest],
    enabled: isTest !== undefined,
    queryFn: async () => {
      let query = (supabase as any)
        .from("bookings")
        .select(`
          id,
          start_time,
          end_time,
          status,
          price_cents,
          court_id,
          location_id,
          created_at,
          courts(name)
        `)
        .eq("is_test", isTest)
        .order("start_time", { ascending: false });

      if (selectedLocationId !== "all") {
        query = query.eq("location_id", selectedLocationId);
      }

      if (scopedCourtIds) {
        query = query.in("court_id", scopedCourtIds);
      }

      if (timeRange !== "all") {
        const daysAgo = parseInt(timeRange);
        query = query.gte("start_time", subDays(new Date(), daysAgo).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Booking[];
    },
  });

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!bookings) return null;

    const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    const last7Days = confirmed.filter((b) => new Date(b.start_time) >= subDays(new Date(), 7));
    const last3Days = confirmed.filter((b) => new Date(b.start_time) >= subDays(new Date(), 3));

    const totalRevenue = confirmed.reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100;
    const revenue7Days = last7Days.reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100;

    const cancellationRate = bookings.length > 0
      ? (cancelled.length / bookings.length) * 100
      : 0;

    // Calculate total booked hours
    const totalBookedHours = confirmed.reduce((sum, b) => {
      return sum + differenceInHours(new Date(b.end_time), new Date(b.start_time));
    }, 0);

    // Calculate utilization (simplified: based on 12 hours/day per court)
    // Nur Courts der gewählten Sportart zählen — sonst würden z. B. Tennis-Courts
    // die Padel-Auslastung künstlich verwässern.
    const relevantLocations = selectedLocationId === "all" ? locations : [selectedLocation].filter(Boolean);
    const totalCourts = relevantLocations.reduce(
      (sum, l) =>
        sum +
        (l?.courts || []).filter(
          (c) => sportScope === "all" || courtSport(c) === sportScope
        ).length,
      0
    );
    const daysInRange = timeRange === "all" ? 90 : parseInt(timeRange);
    const availableHours = totalCourts * 12 * daysInRange; // 12 hours per day per court
    const utilization = availableHours > 0 ? (totalBookedHours / availableHours) * 100 : 0;

    return {
      totalBookings: confirmed.length,
      bookings7Days: last7Days.length,
      bookings3Days: last3Days.length,
      totalRevenue,
      revenue7Days,
      cancellationRate,
      utilization: Math.min(utilization, 100),
      totalBookedHours,
    };
  }, [bookings, locations, selectedLocationId, selectedLocation, timeRange, sportScope]);

  // Chart data: Bookings per day
  const bookingsPerDay = useMemo(() => {
    if (!bookings) return [];

    const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const daysToShow = Math.min(parseInt(timeRange === "all" ? "30" : timeRange), 30);
    const days: { date: string; count: number; revenue: number }[] = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = startOfDay(subDays(new Date(), i));
      const dateStr = format(date, "yyyy-MM-dd");
      const dayBookings = confirmed.filter(
        (b) => format(new Date(b.start_time), "yyyy-MM-dd") === dateStr
      );
      days.push({
        date: format(date, "dd.MM", { locale: de }),
        count: dayBookings.length,
        revenue: dayBookings.reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100,
      });
    }

    return days;
  }, [bookings, timeRange]);

  // Chart data: Bookings per court
  const bookingsPerCourt = useMemo(() => {
    if (!bookings) return [];

    const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const courtMap = new Map<string, { name: string; count: number }>();

    confirmed.forEach((b) => {
      const courtName = b.courts?.name || "Unbekannt";
      const existing = courtMap.get(b.court_id);
      if (existing) {
        existing.count++;
      } else {
        courtMap.set(b.court_id, { name: courtName, count: 1 });
      }
    });

    return Array.from(courtMap.values()).sort((a, b) => b.count - a.count);
  }, [bookings]);

  // Chart data: Status distribution
  const statusDistribution = useMemo(() => {
    if (!bookings) return [];

    const statusMap = new Map<string, number>();
    bookings.forEach((b) => {
      statusMap.set(b.status, (statusMap.get(b.status) || 0) + 1);
    });

    const colors: Record<string, string> = {
      confirmed: "hsl(var(--primary))",
      completed: "hsl(142, 76%, 36%)",
      cancelled: "hsl(var(--destructive))",
      pending: "hsl(var(--muted-foreground))",
      pending_payment: "hsl(45, 93%, 47%)",
    };

    const labels: Record<string, string> = {
      confirmed: "Bestätigt",
      completed: "Abgeschlossen",
      cancelled: "Storniert",
      pending: "Ausstehend",
      pending_payment: "Zahlung ausstehend",
    };

    return Array.from(statusMap.entries()).map(([status, count]) => ({
      name: labels[status] || status,
      value: count,
      color: colors[status] || "hsl(var(--muted))",
    }));
  }, [bookings]);

  // Recent bookings
  const recentBookings = useMemo(() => {
    if (!bookings) return [];
    return bookings.slice(0, 10);
  }, [bookings]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      confirmed: { className: "border-primary/[0.28] bg-primary/[0.09] text-primary", label: "Bestätigt" },
      completed: { className: "border-[hsl(142_76%_36%/0.4)] bg-[hsl(142_76%_36%/0.12)] text-[hsl(142_70%_52%)]", label: "Abgeschlossen" },
      cancelled: { className: "border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]", label: "Storniert" },
      pending: { className: "border-[hsl(0_0%_16%)] bg-white/5 text-muted-foreground", label: "Ausstehend" },
      pending_payment: { className: "border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]", label: "Zahlung" },
    };
    const v = variants[status] || { className: "border-[hsl(0_0%_16%)] bg-white/5 text-muted-foreground", label: status };
    return (
      <Badge
        variant="outline"
        className={cn(
          "whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold",
          v.className
        )}
      >
        {v.label}
      </Badge>
    );
  };

  // Präsentation: Balken-Skalierung + Label-Dichte
  const maxDayCount = Math.max(...bookingsPerDay.map((d) => d.count), 1);
  const maxDayRevenue = Math.max(...bookingsPerDay.map((d) => d.revenue), 1);
  const dense = bookingsPerDay.length > 10;
  const labelEvery = Math.max(1, Math.ceil(bookingsPerDay.length / 8));

  // Präsentation: conic-gradient Segmente für die Status-Verteilung
  const statusTotal = statusDistribution.reduce((sum, e) => sum + e.value, 0);
  let statusAcc = 0;
  const statusStops = statusDistribution
    .map((e) => {
      const from = (statusAcc / Math.max(statusTotal, 1)) * 360;
      statusAcc += e.value;
      const to = (statusAcc / Math.max(statusTotal, 1)) * 360;
      return `${e.color} ${from}deg ${to}deg`;
    })
    .join(", ");

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Filter */}
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex w-full min-w-0 flex-col gap-[7px] sm:w-auto sm:min-w-[230px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Standort
            </span>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger className="h-[38px] w-full rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold text-foreground">
                <SelectValue placeholder="Standort wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Standorte</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Sportart
            </span>
            <SportScopeTabs value={sportScope} onChange={setSportScope} />
          </div>
          <div className="flex flex-col gap-[7px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Zeitraum
            </span>
            <div className="flex gap-[3px] rounded-[11px] border border-[hsl(0_0%_14%)] bg-white/[0.04] p-[3px]">
              {(["7", "30", "90", "all"] as TimeRange[]).map((range) => (
                <Button
                  key={range}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "h-[30px] rounded-lg px-3 text-[12.5px] font-bold sm:px-[15px]",
                    timeRange === range
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      : "text-[hsl(0_0%_62%)] hover:bg-transparent hover:text-foreground"
                  )}
                >
                  {range === "all" ? "Alle" : `${range}T`}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI-Kacheln */}
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-2xl" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
          <KpiCard
            icon={CalendarCheck}
            label="Buchungen gesamt"
            value={kpis.totalBookings.toLocaleString("de-DE")}
            valueClass="text-foreground"
          />
          <KpiCard
            icon={Clock}
            label="Letzte 7 Tage"
            value={kpis.bookings7Days.toLocaleString("de-DE")}
            valueClass="text-foreground"
          />
          <KpiCard
            icon={Activity}
            label="Letzte 3 Tage"
            value={kpis.bookings3Days.toLocaleString("de-DE")}
            valueClass="text-foreground"
          />
          <KpiCard
            icon={Euro}
            label="Umsatz gesamt"
            value={formatCurrency(kpis.totalRevenue)}
            valueClass="text-primary"
          />
          <KpiCard
            icon={Gauge}
            label="Auslastung (Basis 12 h/Tag)"
            value={`${kpis.utilization.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
            valueClass="text-primary"
          />
          <KpiCard
            icon={XCircle}
            label="Storno-Rate"
            value={`${kpis.cancellationRate.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
            valueClass="text-[#FFC44D]"
          />
        </div>
      ) : null}

      {/* Charts Reihe 1 */}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-2">
        {/* Buchungen pro Tag */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Buchungen pro Tag
            </h2>
            {isLoading ? (
              <Skeleton className="h-[212px] rounded-xl" />
            ) : (
              <div className="flex h-[212px] items-end gap-[clamp(2px,1vw,14px)] px-0.5 pt-[22px]">
                {bookingsPerDay.map((d, i) => (
                  <div
                    key={`${d.date}-${i}`}
                    title={`${d.date} · ${d.count} Buchungen`}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[7px]"
                  >
                    {!dense && (
                      <span
                        className={cn(
                          "font-mono text-[11.5px] font-bold",
                          d.count > 0 ? "text-primary" : "text-[hsl(0_0%_45%)]"
                        )}
                      >
                        {d.count}
                      </span>
                    )}
                    <div
                      className="w-full max-w-[52px] rounded-t-lg"
                      style={{
                        height: `${d.count > 0 ? Math.max(8, Math.round((d.count / maxDayCount) * 150)) : 3}px`,
                        background:
                          d.count > 0
                            ? "linear-gradient(180deg, #C7F011, hsl(71 91% 51% / 0.25))"
                            : "hsl(0 0% 20%)",
                      }}
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap font-mono text-[10px] text-muted-foreground",
                        i % labelEvery !== 0 && "invisible"
                      )}
                    >
                      {d.date}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Umsatz-Trend */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Umsatz-Trend
            </h2>
            {isLoading ? (
              <Skeleton className="h-[212px] rounded-xl" />
            ) : (
              <div className="flex h-[212px] items-end gap-[clamp(2px,1vw,14px)] px-0.5 pt-[22px]">
                {bookingsPerDay.map((d, i) => (
                  <div
                    key={`${d.date}-${i}`}
                    title={`${d.date} · ${formatCurrency(d.revenue)}`}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[7px]"
                  >
                    {!dense && (
                      <span
                        className={cn(
                          "font-mono text-[11px] font-bold",
                          d.revenue > 0 ? "text-primary" : "text-[hsl(0_0%_45%)]"
                        )}
                      >
                        {d.revenue.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                      </span>
                    )}
                    <div
                      className="w-full max-w-[52px] rounded-t-lg"
                      style={{
                        height: `${d.revenue > 0 ? Math.max(8, Math.round((d.revenue / maxDayRevenue) * 150)) : 3}px`,
                        background:
                          d.revenue > 0
                            ? "linear-gradient(180deg, #C7F011, hsl(71 91% 51% / 0.25))"
                            : "hsl(0 0% 20%)",
                      }}
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap font-mono text-[10px] text-muted-foreground",
                        i % labelEvery !== 0 && "invisible"
                      )}
                    >
                      {d.date}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Charts Reihe 2 */}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-2">
        {/* Buchungen pro Court */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Buchungen pro Court
            </h2>
            {isLoading ? (
              <Skeleton className="h-[200px] rounded-xl" />
            ) : bookingsPerCourt.length > 0 ? (
              <div className="flex flex-col gap-3.5">
                {bookingsPerCourt.slice(0, 6).map((court, index) => {
                  const maxCount = bookingsPerCourt[0]?.count || 1;
                  const percentage = (court.count / maxCount) * 100;
                  return (
                    <div key={index} className="flex flex-col gap-[7px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                          {court.name}
                        </span>
                        <span className="flex-none font-mono text-[13px] font-bold text-primary">
                          {court.count.toLocaleString("de-DE")}
                        </span>
                      </div>
                      <div className="h-[9px] overflow-hidden rounded-full bg-[hsl(0_0%_12%)]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            background:
                              "linear-gradient(90deg, hsl(71 91% 51% / 0.3), #C7F011)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-[13px] text-muted-foreground">
                Keine Daten vorhanden
              </div>
            )}
          </div>
        </Card>

        {/* Status-Verteilung */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Status-Verteilung
            </h2>
            {isLoading ? (
              <Skeleton className="h-[200px] rounded-xl" />
            ) : statusDistribution.length > 0 ? (
              <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                <div
                  className="relative h-[150px] w-[150px] flex-none rounded-full"
                  style={{ background: `conic-gradient(${statusStops})` }}
                >
                  <div className="absolute inset-[30px] flex items-center justify-center rounded-full bg-[hsl(0_0%_5%)]">
                    <span className="font-mono text-lg font-bold text-foreground">
                      {statusTotal.toLocaleString("de-DE")}
                    </span>
                  </div>
                </div>
                <div className="min-w-[180px] flex-1 space-y-2.5">
                  {statusDistribution.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-none rounded-[3px]"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="truncate text-[13px] font-semibold text-foreground">
                          {entry.name}
                        </span>
                      </div>
                      <span className="flex-none font-mono text-[12.5px] font-bold text-muted-foreground">
                        {entry.value.toLocaleString("de-DE")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-[13px] text-muted-foreground">
                Keine Daten vorhanden
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Letzte Buchungen */}
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            Letzte Buchungen
          </h2>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : recentBookings.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                    <TableHead className={TABLE_HEAD_CLASSES}>Court</TableHead>
                    <TableHead className={TABLE_HEAD_CLASSES}>Datum</TableHead>
                    <TableHead className={TABLE_HEAD_CLASSES}>Uhrzeit</TableHead>
                    <TableHead className={TABLE_HEAD_CLASSES}>Status</TableHead>
                    <TableHead className={cn(TABLE_HEAD_CLASSES, "pr-0 text-right")}>
                      Preis
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBookings.map((booking) => (
                    <TableRow
                      key={booking.id}
                      className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]"
                    >
                      <TableCell className="whitespace-nowrap px-0 py-3 pr-3.5 text-[13px] font-semibold text-foreground">
                        {booking.courts?.name || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-0 py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                        {format(new Date(booking.start_time), "dd.MM.yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-0 py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                        {format(new Date(booking.start_time), "HH:mm")} -{" "}
                        {format(new Date(booking.end_time), "HH:mm")}
                      </TableCell>
                      <TableCell className="px-0 py-3 pr-3.5">
                        {getStatusBadge(booking.status)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-0 py-3 pr-0 text-right font-mono text-[12.5px] text-foreground">
                        {booking.price_cents
                          ? formatCurrency(booking.price_cents / 100)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-[13.5px] text-muted-foreground">
              Keine Buchungen vorhanden
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Simple KPI Card component
function KpiCard({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  valueClass: string;
}) {
  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5">
      <div className="flex flex-col gap-[9px]">
        <Icon className="h-4 w-4 text-[hsl(0_0%_58%)]" />
        <span
          className={cn(
            "truncate font-mono text-2xl font-bold leading-none",
            valueClass
          )}
        >
          {value}
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">{label}</span>
      </div>
    </Card>
  );
}
