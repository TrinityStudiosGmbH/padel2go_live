import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { BarChart3, PieChart, MapPin, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { useState } from "react";
import {
  SportScopeTabs,
  sportOf,
  type SportScope,
} from "@/components/admin/SportScopeTabs";
import { SPORT_LABEL } from "@/components/admin/courts/types";
import { useSportCourtIds } from "@/hooks/useSportCourtIds";
import { useStripeIsTest } from "@/hooks/useStripeIsTest";

const COLORS = ["hsl(71, 91%, 51%)", "hsl(0, 0%, 40%)", "hsl(0, 84%, 60%)"];

export default function AdminAnalytics() {
  const [sportScope, setSportScope] = useState<SportScope>("all");

  const sport = sportOf(sportScope);
  const sportLabel = sport ? SPORT_LABEL[sport] : null;

  /**
   * Court-IDs der gewählten Sportart. `bookings` trägt keine Sportart, deshalb
   * läuft der Filter über die Courts. `null` = nicht einschränken; ein LEERES
   * Array heißt „diese Sportart hat keine Courts" und muss 0 Treffer liefern —
   * dafür bleiben die Zähler unten ohne DB-Aufruf bei 0.
   */
  const { data: sportCourtIds } = useSportCourtIds(sportScope);
  const courtIds = sportCourtIds ?? null;
  const noCourtsForSport = courtIds !== null && courtIds.length === 0;
  // Erst zählen, wenn die Court-IDs da sind — sonst flackerte kurz die andere
  // Sportart durch.
  // Und erst, wenn feststeht, welcher Betrieb gerade laeuft.
  const { data: isTest } = useStripeIsTest();
  const scopeReady = (sportScope === "all" || Array.isArray(sportCourtIds)) && isTest !== undefined;

  // Bookings per day for last 7 days
  const { data: bookingsPerDay } = useQuery({
    queryKey: ["admin-analytics-bookings-per-day", sportScope, isTest],
    enabled: scopeReady,
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        let bookings = 0;
        if (!noCourtsForSport) {
          let query = (supabase as any)
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .in("status", ["confirmed", "completed"])
            .eq("is_test", isTest)
            .gte("start_time", startOfDay(date).toISOString())
            .lte("start_time", endOfDay(date).toISOString());
          if (courtIds) query = query.in("court_id", courtIds);
          const { count } = await query;
          bookings = count || 0;
        }
        days.push({
          date: format(date, "EEE", { locale: de }),
          fullDate: format(date, "dd.MM"),
          bookings,
        });
      }
      return days;
    },
  });

  // Bookings by status
  const { data: bookingsByStatus } = useQuery({
    queryKey: ["admin-analytics-bookings-by-status", sportScope, isTest],
    enabled: scopeReady,
    queryFn: async () => {
      const statuses = ["confirmed", "pending_payment", "cancelled"] as const;
      const result = [];
      for (const status of statuses) {
        let value = 0;
        if (!noCourtsForSport) {
          let query = (supabase as any)
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("status", status)
            .eq("is_test", isTest);
          if (courtIds) query = query.in("court_id", courtIds);
          const { count } = await query;
          value = count || 0;
        }
        result.push({
          name: status === "confirmed" ? "Bestätigt" : status === "pending_payment" ? "Zahlung offen" : "Storniert",
          value,
        });
      }
      return result;
    },
  });

  // Bookings by location
  const { data: bookingsByLocation } = useQuery({
    queryKey: ["admin-analytics-bookings-by-location", sportScope, isTest],
    enabled: scopeReady,
    queryFn: async () => {
      const { data: locations } = await supabase.from("locations").select("id, name");
      const result = [];
      for (const location of locations || []) {
        let bookings = 0;
        if (!noCourtsForSport) {
          let query = (supabase as any)
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("location_id", location.id)
            .eq("status", "confirmed")
            .eq("is_test", isTest);
          if (courtIds) query = query.in("court_id", courtIds);
          const { count } = await query;
          bookings = count || 0;
        }
        result.push({
          name: location.name.replace("PADEL2GO ", ""),
          bookings,
        });
      }
      return result;
    },
  });

  // User registrations per week — bewusst ohne Sport-Filter, siehe UI-Hinweis
  const { data: userGrowth } = useQuery({
    queryKey: ["admin-analytics-user-growth"],
    queryFn: async () => {
      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        const startDate = subDays(new Date(), i * 7 + 7);
        const endDate = subDays(new Date(), i * 7);
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startDate.toISOString())
          .lt("created_at", endDate.toISOString());
        weeks.push({
          week: `KW ${format(endDate, "w")}`,
          users: count || 0,
        });
      }
      return weeks;
    },
  });

  // Abgeleitete Präsentationswerte (reine Darstellung, keine neuen Daten)
  const week = bookingsPerDay || [];
  const maxDayBookings = Math.max(1, ...week.map((d) => d.bookings));

  const statuses = bookingsByStatus || [];
  const statusTotal = statuses.reduce((sum, s) => sum + s.value, 0);
  let accDeg = 0;
  const donutSegments = statuses.map((s, i) => {
    const start = statusTotal > 0 ? (accDeg / statusTotal) * 360 : 0;
    accDeg += s.value;
    const end = statusTotal > 0 ? (accDeg / statusTotal) * 360 : 0;
    return `${COLORS[i % COLORS.length]} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  const donutBackground =
    statusTotal > 0 ? `conic-gradient(${donutSegments.join(", ")})` : "hsl(0 0% 14%)";
  const formatPct = (value: number) =>
    statusTotal > 0
      ? `${((value / statusTotal) * 100).toLocaleString("de-DE", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })} %`
      : "0,0 %";

  const locations = bookingsByLocation || [];
  const maxLocationBookings = Math.max(1, ...locations.map((l) => l.bookings));

  const growth = userGrowth || [];
  const maxWeekUsers = Math.max(1, ...growth.map((w) => w.users));
  const linePointPairs = growth.map((w, i) => {
    const x = growth.length > 1 ? (i / (growth.length - 1)) * 380 + 10 : 200;
    const y = 200 - (w.users / maxWeekUsers) * 165;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePoints = linePointPairs.join(" ");
  const areaPoints = `10,200 ${linePoints} 390,200`;

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Vier feste Auswertungen zu Buchungen und Nutzerwachstum — reine Lese-Ansicht.
          </p>
          <SportScopeTabs value={sportScope} onChange={setSportScope} />
        </div>

        <div className="grid grid-cols-1 items-start gap-[18px] min-[1080px]:grid-cols-2">
          {/* Buchungen (letzte 7 Tage) */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/30 bg-primary/10 text-primary">
                  <BarChart3 className="h-[15px] w-[15px]" />
                </span>
                <div className="flex flex-col gap-px">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Buchungen (letzte 7 Tage)
                  </h2>
                  {sportLabel && (
                    <span className="text-[11.5px] text-muted-foreground">
                      nur {sportLabel}-Courts
                    </span>
                  )}
                </div>
              </div>
              <div className="flex h-[200px] items-end gap-2 px-0.5 pt-5 sm:gap-[22px]">
                {week.map((d, i) => {
                  const isToday = i === week.length - 1;
                  return (
                    <div
                      key={`${d.date}-${d.fullDate}`}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[9px]"
                    >
                      <span
                        className={`font-mono text-xs font-bold ${
                          isToday ? "text-primary" : "text-[hsl(0_0%_82%)]"
                        }`}
                      >
                        {d.bookings}
                      </span>
                      <div
                        className="w-full max-w-[44px] rounded-t-lg"
                        style={{
                          height: `${Math.round((d.bookings / maxDayBookings) * 155)}px`,
                          background: isToday
                            ? "linear-gradient(180deg, hsl(71 91% 51%), hsl(71 91% 51% / 0.35))"
                            : "linear-gradient(180deg, hsl(71 91% 51% / 0.75), hsl(71 91% 51% / 0.2))",
                        }}
                      />
                      <span
                        className={`whitespace-nowrap font-mono text-[10.5px] ${
                          isToday ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {d.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Buchungen nach Status */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/30 bg-primary/10 text-primary">
                  <PieChart className="h-[15px] w-[15px]" />
                </span>
                <div className="flex flex-col gap-px">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Buchungen nach Status
                  </h2>
                  {sportLabel && (
                    <span className="text-[11.5px] text-muted-foreground">
                      nur {sportLabel}-Courts
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-[26px]">
                <div
                  className="relative h-[170px] w-[170px] flex-none rounded-full"
                  style={{ background: donutBackground }}
                >
                  <div className="absolute inset-[30px] flex flex-col items-center justify-center gap-0.5 rounded-full bg-[hsl(0_0%_5%)]">
                    <span className="font-mono text-2xl font-bold leading-none text-foreground">
                      {statusTotal.toLocaleString("de-DE")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">gesamt</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {statuses.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2.5">
                      <span
                        className="h-[11px] w-[11px] flex-none rounded-[4px]"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="whitespace-nowrap text-[13px] text-[hsl(0_0%_78%)]">
                        {s.name}:
                      </span>
                      <span className="whitespace-nowrap font-mono text-[13px] font-bold text-foreground">
                        {s.value.toLocaleString("de-DE")}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_58%)]">
                        {formatPct(s.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Buchungen pro Standort */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/30 bg-primary/10 text-primary">
                  <MapPin className="h-[15px] w-[15px]" />
                </span>
                <div className="flex flex-col gap-px">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Buchungen pro Standort
                  </h2>
                  <span className="text-[11.5px] text-muted-foreground">
                    nur bestätigte Buchungen{sportLabel ? ` · nur ${sportLabel}-Courts` : ""}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                {locations.map((l) => (
                  <div
                    key={l.name}
                    className="grid grid-cols-[86px_minmax(0,1fr)_44px] items-center gap-[11px] sm:grid-cols-[106px_minmax(0,1fr)_46px]"
                  >
                    <span className="truncate text-[12.5px] font-semibold text-[hsl(0_0%_82%)]">
                      {l.name}
                    </span>
                    <div className="h-5 overflow-hidden rounded-md bg-[hsl(0_0%_10%)]">
                      <div
                        className="h-full rounded-md"
                        style={{
                          width: `${Math.max(
                            1,
                            Math.round((l.bookings / maxLocationBookings) * 100),
                          )}%`,
                          background:
                            "linear-gradient(90deg, hsl(71 91% 51% / 0.4), hsl(71 91% 51%))",
                        }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-right font-mono text-[12.5px] font-bold text-primary">
                      {l.bookings}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Neue Benutzer pro Woche */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/30 bg-primary/10 text-primary">
                  <TrendingUp className="h-[15px] w-[15px]" />
                </span>
                <div className="flex flex-col gap-px">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Neue Benutzer pro Woche
                  </h2>
                  <span className="text-[11.5px] text-muted-foreground">
                    immer sportartübergreifend — Nutzer hängen an keinem Court
                  </span>
                </div>
              </div>
              <div className="relative h-[224px]">
                <svg
                  viewBox="0 0 400 200"
                  preserveAspectRatio="none"
                  className="absolute left-0 right-0 top-0 h-[200px] w-full overflow-visible"
                >
                  <line x1="0" y1="55" x2="400" y2="55" stroke="hsl(0 0% 14%)" strokeWidth="1" />
                  <line x1="0" y1="103" x2="400" y2="103" stroke="hsl(0 0% 14%)" strokeWidth="1" />
                  <line x1="0" y1="151" x2="400" y2="151" stroke="hsl(0 0% 14%)" strokeWidth="1" />
                  <line x1="0" y1="200" x2="400" y2="200" stroke="hsl(0 0% 18%)" strokeWidth="1" />
                  {growth.length > 1 && (
                    <>
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="hsl(71 91% 51%)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polygon points={areaPoints} fill="hsl(71 91% 51% / 0.12)" />
                    </>
                  )}
                </svg>
                <div className="pointer-events-none absolute left-0 right-0 top-0 flex h-[200px] items-end justify-between">
                  {growth.map((w) => (
                    <div
                      key={w.week}
                      className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <span
                        className="absolute whitespace-nowrap font-mono text-[11.5px] font-bold text-primary"
                        style={{ bottom: `${Math.round((w.users / maxWeekUsers) * 165) + 14}px` }}
                      >
                        +{w.users}
                      </span>
                      <span className="translate-y-5 whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                        {w.week}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
