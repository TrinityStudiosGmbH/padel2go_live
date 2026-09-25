import { useMemo, useState } from "react";
import { addMonths, startOfMonth, isSameMonth } from "date-fns";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Gauge,
  Clock,
  Euro,
  Trophy,
  TrendingDown,
} from "lucide-react";
import {
  SportScopeTabs,
  sportOf,
  type SportScope,
} from "@/components/admin/SportScopeTabs";
import {
  useCourtUtilization,
  useNetworkUtilizationTrend,
} from "@/hooks/useCourtUtilization";
import { useDataMode } from "@/hooks/useDataMode";
import {
  monthStartISO,
  formatMonthLabel,
  formatHours,
} from "@/lib/utilization";

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** Design palette for capacity coloring (same thresholds as lib/utilization). */
function capacityColor(pct: number): { hex: string; dim: string } {
  if (pct < 40) return { hex: "#FF6B6B", dim: "hsl(0 100% 71% / 0.3)" };
  if (pct <= 75) return { hex: "#FFC44D", dim: "hsl(41 100% 65% / 0.3)" };
  return { hex: "#C7F011", dim: "hsl(71 91% 51% / 0.3)" };
}

function formatPct(pct: number): string {
  return `${Math.min(pct, 100).toLocaleString("de-DE")} %`;
}

const LEGEND = [
  { label: "< 40 %", hex: "#FF6B6B" },
  { label: "40–75 %", hex: "#FFC44D" },
  { label: "> 75 %", hex: "#C7F011" },
];

type SortKey = "capacity" | "booked" | "revenue" | "name";

const SPORT_LABEL: Record<string, string> = { padel: "Padel", tennis: "Tennis" };

export default function AdminUtilization() {
  const today = startOfMonth(new Date());
  const [month, setMonth] = useState<Date>(today);
  const [sportScope, setSportScope] = useState<SportScope>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("capacity");

  const monthISO = monthStartISO(month);
  const sport = sportOf(sportScope);
  // Der Sport wird serverseitig gefiltert: die Kennzahlen unten summieren über
  // die Zeilen, ein Frontend-Filter würde sie an der Tabelle vorbei verfälschen.
  const { isTest } = useDataMode();
  const { data: rows = [], isLoading, isError } = useCourtUtilization(monthISO, sport, isTest ?? null);
  const { data: networkTrend = [] } = useNetworkUtilizationTrend(6, sport, isTest ?? null);

  const isCurrentMonth = isSameMonth(month, today);

  const locations = useMemo(
    () => Array.from(new Set(rows.map((r) => r.location_name))).sort(),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const filtered =
      locationFilter === "all" ? rows : rows.filter((r) => r.location_name === locationFilter);
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "booked":
          return b.booked_minutes - a.booked_minutes;
        case "revenue":
          return (b.revenue_cents ?? 0) - (a.revenue_cents ?? 0);
        case "name":
          return (
            a.location_name.localeCompare(b.location_name) ||
            a.court_name.localeCompare(b.court_name)
          );
        default:
          return b.capacity_pct - a.capacity_pct;
      }
    });
    return sorted;
  }, [rows, locationFilter, sortKey]);

  const totals = useMemo(() => {
    const booked = rows.reduce((s, r) => s + r.booked_minutes, 0);
    const possible = rows.reduce((s, r) => s + r.possible_minutes, 0);
    const revenue = rows.reduce((s, r) => s + (r.revenue_cents ?? 0), 0);
    const capacity = possible > 0 ? Math.round((1000 * booked) / possible) / 10 : 0;
    const ranked = rows.filter((r) => r.possible_minutes > 0);
    const best = ranked.reduce<typeof rows[number] | null>(
      (m, r) => (!m || r.capacity_pct > m.capacity_pct ? r : m),
      null,
    );
    const worst = ranked.reduce<typeof rows[number] | null>(
      (m, r) => (!m || r.capacity_pct < m.capacity_pct ? r : m),
      null,
    );
    return { booked, possible, revenue, capacity, best, worst };
  }, [rows]);

  const byLocation = useMemo(() => {
    const map = new Map<string, { booked: number; possible: number }>();
    for (const r of rows) {
      const e = map.get(r.location_name) ?? { booked: 0, possible: 0 };
      e.booked += r.booked_minutes;
      e.possible += r.possible_minutes;
      map.set(r.location_name, e);
    }
    return Array.from(map.entries())
      .map(([name, e]) => ({
        name,
        capacity: e.possible > 0 ? Math.round((1000 * e.booked) / e.possible) / 10 : 0,
      }))
      .sort((a, b) => b.capacity - a.capacity);
  }, [rows]);

  const trendData = networkTrend.map((p) => ({
    label: formatMonthLabel(p.month_start, true),
    capacity: p.capacity_pct,
  }));

  const kpis = [
    { title: "Courts online", value: String(rows.length), icon: LayoutGrid,
      color: "#FAFAFA",
      desc: `${locations.length} Standort${locations.length === 1 ? "" : "e"}` },
    { title: "Netzwerk-Auslastung", value: formatPct(totals.capacity), icon: Gauge,
      color: capacityColor(totals.capacity).hex,
      desc: formatMonthLabel(month) },
    { title: "Gebuchte Stunden", value: formatHours(totals.booked), icon: Clock,
      color: "#FAFAFA",
      desc: `von ${formatHours(totals.possible)} möglich` },
    { title: "Umsatz", value: formatEuros(totals.revenue), icon: Euro,
      color: "#C7F011",
      desc: "Bestätigte Buchungen" },
    { title: "Top Court", value: totals.best ? formatPct(totals.best.capacity_pct) : "–", icon: Trophy,
      color: totals.best ? capacityColor(totals.best.capacity_pct).hex : "#FAFAFA",
      desc: totals.best ? `${totals.best.court_name} · ${totals.best.location_name}` : "—" },
    { title: "Schwächster Court", value: totals.worst ? formatPct(totals.worst.capacity_pct) : "–", icon: TrendingDown,
      color: totals.worst ? capacityColor(totals.worst.capacity_pct).hex : "#FAFAFA",
      desc: totals.worst ? `${totals.worst.court_name} · ${totals.worst.location_name}` : "—" },
  ];

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Beschreibung + Monats-Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Kapazität aller Online-Courts im PADEL2GO-Netzwerk
          </p>
          <div className="flex flex-none items-center gap-2.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="h-[34px] w-[34px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[hsl(0_0%_75%)] hover:border-primary/40 hover:bg-white/[0.04] hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[126px] whitespace-nowrap text-center font-mono text-[13.5px] font-bold capitalize text-foreground">
              {formatMonthLabel(month)}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={isCurrentMonth}
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="h-[34px] w-[34px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[hsl(0_0%_75%)] hover:border-primary/40 hover:bg-white/[0.04] hover:text-primary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPI-Karten */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
          {kpis.map((card) => (
            <Card key={card.title} className="rounded-2xl border-border bg-gradient-card p-5">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="text-[12.5px] font-semibold text-[hsl(0_0%_72%)]">
                    {card.title}
                  </span>
                  <card.icon className="h-[15px] w-[15px] flex-none text-[hsl(0_0%_58%)]" />
                </div>
                <span
                  className="font-mono text-[26px] font-bold leading-none"
                  style={{ color: card.color }}
                >
                  {card.value}
                </span>
                <span className="truncate text-[11.5px] text-muted-foreground">{card.desc}</span>
              </div>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-2">
          {/* Auslastung pro Standort */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Auslastung pro Standort
                </h2>
                <div className="flex flex-wrap gap-[13px]">
                  {LEGEND.map((lg) => (
                    <span
                      key={lg.label}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted-foreground"
                    >
                      <span
                        className="h-2 w-2 rounded-[3px]"
                        style={{ backgroundColor: lg.hex }}
                      />
                      {lg.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                {byLocation.map((d) => {
                  const c = capacityColor(d.capacity);
                  return (
                    <div key={d.name} className="flex flex-col gap-[7px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                          {d.name}
                        </span>
                        <span
                          className="flex-none font-mono text-[13px] font-bold"
                          style={{ color: c.hex }}
                        >
                          {formatPct(d.capacity)}
                        </span>
                      </div>
                      <div className="h-[9px] overflow-hidden rounded-full bg-[hsl(0_0%_12%)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(d.capacity, 100)}%`,
                            background: `linear-gradient(90deg, ${c.dim}, ${c.hex})`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {byLocation.length === 0 && (
                  <span className="py-2 text-[13px] text-muted-foreground">
                    Keine Daten für diesen Monat.
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Netzwerk-Verlauf */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-[3px]">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Netzwerk-Verlauf
                </h2>
                <span className="text-xs text-muted-foreground">Letzte 6 Monate bis heute</span>
              </div>
              {trendData.length === 0 ? (
                <span className="py-2 text-[13px] text-muted-foreground">
                  Keine Daten für diesen Zeitraum.
                </span>
              ) : (
                <div className="flex h-[212px] items-end gap-[clamp(8px,2.4vw,26px)] px-0.5 pt-[22px]">
                  {trendData.map((t) => {
                    const c = capacityColor(t.capacity);
                    return (
                      <div
                        key={t.label}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[9px]"
                      >
                        <span
                          className="font-mono text-[11.5px] font-bold"
                          style={{ color: c.hex }}
                        >
                          {formatPct(t.capacity)}
                        </span>
                        <div
                          className="w-full max-w-[52px] rounded-t-lg"
                          style={{
                            height: `${Math.round((Math.min(t.capacity, 100) / 100) * 150)}px`,
                            background: `linear-gradient(180deg, ${c.hex}, ${c.dim})`,
                          }}
                        />
                        <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                          {t.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Alle Courts */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3.5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                Alle Courts
              </h2>
              <div className="flex w-full flex-col gap-[11px] sm:w-auto sm:flex-row">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Sportart
                  </span>
                  <SportScopeTabs
                    value={sportScope}
                    onChange={(scope) => {
                      setSportScope(scope);
                      // Ein Standort ohne Courts der neuen Sportart verschwindet
                      // aus der Liste — der Filter bliebe sonst unsichtbar aktiv.
                      setLocationFilter("all");
                    }}
                    className="self-start"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Standort
                  </span>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger className="h-9 w-full rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold text-foreground sm:w-[180px]">
                      <SelectValue placeholder="Standort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Standorte</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Sortierung
                  </span>
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-9 w-full rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold text-foreground sm:w-[190px]">
                      <SelectValue placeholder="Sortieren" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capacity">Auslastung ↓</SelectItem>
                      <SelectItem value="booked">Gebuchte Stunden ↓</SelectItem>
                      <SelectItem value="revenue">Umsatz ↓</SelectItem>
                      <SelectItem value="name">Standort / Court</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {isLoading ? (
              <p className="py-2 text-sm text-muted-foreground">Lädt…</p>
            ) : isError ? (
              <p className="py-2 text-sm text-destructive">
                Auslastungsdaten konnten nicht geladen werden. Bitte lade die Seite neu.
              </p>
            ) : visibleRows.length === 0 ? (
              <p className="py-4 text-center text-[13.5px] text-muted-foreground">
                Keine Online-Courts gefunden.
              </p>
            ) : (
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Standort
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Court
                    </TableHead>
                    <TableHead className="h-auto min-w-[180px] whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Auslastung
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-[18px] text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Gebucht
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-[18px] text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Möglich
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-[18px] text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Buchungen
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-[18px] text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Umsatz
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-0 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => {
                    const c = capacityColor(r.capacity_pct);
                    return (
                      <TableRow key={r.court_id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]">
                        <TableCell className="px-0 py-3 pr-3.5">
                          <div className="flex flex-col gap-px">
                            <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
                              {r.location_name}
                            </span>
                            {r.location_city ? (
                              <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                                {r.location_city}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">
                          <div className="flex flex-col gap-px">
                            <span className="whitespace-nowrap text-[13.5px] text-[hsl(0_0%_78%)]">
                              {r.court_name}
                            </span>
                            <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                              {SPORT_LABEL[r.sport] ?? r.sport}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 min-w-[74px] flex-1 overflow-hidden rounded-full bg-[hsl(0_0%_12%)]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(r.capacity_pct, 100)}%`,
                                  backgroundColor: c.hex,
                                }}
                              />
                            </div>
                            <span
                              className="min-w-[38px] flex-none text-right font-mono text-[12.5px] font-bold"
                              style={{ color: c.hex }}
                            >
                              {formatPct(r.capacity_pct)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-0 py-3 pr-[18px] text-right font-mono text-[12.5px] text-foreground">
                          {formatHours(r.booked_minutes)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-0 py-3 pr-[18px] text-right font-mono text-[12.5px] text-muted-foreground">
                          {formatHours(r.possible_minutes)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-0 py-3 pr-[18px] text-right font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                          {r.bookings_count}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-0 py-3 pr-[18px] text-right font-mono text-[12.5px] text-foreground">
                          {formatEuros(r.revenue_cents ?? 0)}
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-0">
                          <Badge
                            variant="outline"
                            className={
                              r.is_active
                                ? "gap-1.5 whitespace-nowrap rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary"
                                : "gap-1.5 whitespace-nowrap rounded-full border-[hsl(0_0%_18%)] bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[hsl(0_0%_60%)]"
                            }
                          >
                            <span className="h-[5px] w-[5px] rounded-full bg-current" />
                            {r.is_active ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
