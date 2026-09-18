import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Globe,
  MapPin,
  Info,
  CalendarClock,
  Sparkles,
  Coins,
  Wallet,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import {
  courtSport,
  SPORT_CHIP_CLASSES,
  SPORT_LABEL,
  type CourtSport,
} from "@/components/admin/courts/types";
import { SportSelect } from "@/components/admin/courts/SportSelect";
import { StandardPricesCard } from "@/components/admin/pricing/StandardPricesCard";
import { LocationExceptionsCard } from "@/components/admin/pricing/LocationExceptionsCard";
import { PointsSettingsCard } from "@/components/admin/pricing/PointsSettingsCard";
import { P2GWalletsTab } from "@/components/admin/p2g/P2GWalletsTab";
import { P2GDashboardTab } from "@/components/admin/p2g/P2GDashboardTab";

interface PricingBand {
  id: string;
  location_id: string | null;
  sport: string;
  name: string;
  weekdays: number[];
  start_minute: number;
  end_minute: number;
  price_cents_60: number | null;
  price_cents_90: number | null;
  price_cents_120: number | null;
  priority: number;
  is_active: boolean;
}

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
}

const WEEKDAYS = [
  { iso: 1, short: "Mo" },
  { iso: 2, short: "Di" },
  { iso: 3, short: "Mi" },
  { iso: 4, short: "Do" },
  { iso: 5, short: "Fr" },
  { iso: 6, short: "Sa" },
  { iso: 7, short: "So" },
];

const BAND_COLORS = [
  "#C4F53B",
  "#7FD4FF",
  "#FFC44D",
  "#FF8FD1",
  "#8B7CFF",
  "#4DE0B0",
  "#FF9F6B",
  "#5FA8FF",
];

const SLOT_MINUTES = 30;
const DAY_END = 1440;
const DEFAULT_GRID_START = 6 * 60;

const minutesToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "06:30" → 390. Ungültige Eingaben ergeben null. */
const timeToMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

const formatEuro = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const centsToInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Leer → null, sonst Cent-Betrag. "invalid" bei kaputter Eingabe. */
const parseEuroInput = (raw: string): number | null | "invalid" => {
  const value = raw.trim();
  if (!value) return null;
  const numeric = Number(value.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) return "invalid";
  return Math.round(numeric * 100);
};

/**
 * Sportart eines Bandes. Wie bei Courts gilt alles außer Tennis als Padel —
 * genau wie der DB-Default, damit ein noch nicht neu geladener Cache ohne
 * `sport` nicht plötzlich als eigene Gruppe erscheint.
 */
const bandSport = (band: { sport?: string | null }): CourtSport => courtSport(band);

/**
 * Gleiche Stufe = gleiche Sportart + gleicher Geltungsbereich + gleiche Priorität
 * → Reihenfolge ist willkürlich.
 *
 * Die Sportart MUSS Teil der Stufe sein: resolve_booking_rate() filtert mit
 * `b.sport = v_sport`, zwei globale Bänder verschiedener Sportarten begegnen
 * sich also nie. Ohne diese Dimension würden sie als Konflikt gemeldet.
 */
const bandTier = (band: PricingBand) =>
  `${bandSport(band)}:${band.location_id ? "location" : "global"}:${band.priority}`;

/**
 * Identisch zur Sortierung in resolve_booking_rate() — dort läuft die Auflösung
 * immer innerhalb EINER Sportart. Deshalb steht die Sportart hier als äußerstes
 * Kriterium: Bänder verschiedener Sportarten konkurrieren nicht, sie werden nur
 * stabil getrennt sortiert (relevant für die Legende).
 */
const compareBands = (a: PricingBand, b: PricingBand) => {
  const sport = bandSport(a).localeCompare(bandSport(b));
  if (sport !== 0) return sport;
  const scope = Number(!!b.location_id) - Number(!!a.location_id);
  if (scope !== 0) return scope;
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.start_minute !== b.start_minute) return a.start_minute - b.start_minute;
  return a.id.localeCompare(b.id);
};

/** Rohe Postgres-Fehler der Sport-Invarianten in verständliches Deutsch übersetzen. */
const bandErrorToast = (err: unknown) => {
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const raw = [e?.message, e?.details, e?.hint].filter(Boolean).join(" ");

  if (raw.includes("court_pricing_bands_tennis_60_only")) {
    toast.error("Tennis kennt nur 60 Minuten", {
      description:
        "Für Tennis-Bänder dürfen keine Preise für 90 oder 120 Minuten hinterlegt sein.",
    });
    return;
  }
  if (raw.includes("court_pricing_bands_sport_valid")) {
    toast.error("Ungültige Sportart", { description: "Erlaubt sind nur Padel und Tennis." });
    return;
  }
  toast.error("Fehler", { description: e?.message ?? "Unbekannter Fehler" });
};

interface ConflictPair {
  a: PricingBand;
  b: PricingBand;
  weekdays: number[];
  fromMinute: number;
  toMinute: number;
}

function findConflicts(bands: PricingBand[]): ConflictPair[] {
  const active = bands.filter((b) => b.is_active);
  const out: ConflictPair[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (bandTier(a) !== bandTier(b)) continue;
      const weekdays = a.weekdays.filter((d) => b.weekdays.includes(d)).sort((x, y) => x - y);
      if (weekdays.length === 0) continue;
      const fromMinute = Math.max(a.start_minute, b.start_minute);
      const toMinute = Math.min(a.end_minute, b.end_minute);
      if (fromMinute >= toMinute) continue;
      out.push({ a, b, weekdays, fromMinute, toMinute });
    }
  }
  return out;
}

const TABS = [
  { id: "prices", label: "Preise", icon: CalendarClock },
  { id: "points", label: "Punkte", icon: Coins },
  { id: "wallets", label: "Benutzer-Wallets", icon: Wallet },
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_TRIGGER_CLASSES =
  "-mb-px gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-sm font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

export default function AdminPricing() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Unbekannte Werte in der Adresszeile duerfen keine leere Seite ergeben.
  const requestedTab = searchParams.get("tab");
  const activeTab: TabId = TABS.some((tab) => tab.id === requestedTab)
    ? (requestedTab as TabId)
    : "prices";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBand, setEditBand] = useState<PricingBand | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  // "global:padel" | "global:tennis" | "<location-id>:<sport>". Bänder gelten
  // immer nur innerhalb ihrer Sportart — die Vorschau muss das abbilden.
  const [previewScope, setPreviewScope] = useState("global:padel");

  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState("global");
  const [formSport, setFormSport] = useState<CourtSport>("padel");
  const [formWeekdays, setFormWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formStart, setFormStart] = useState("06:00");
  const [formEnd, setFormEnd] = useState("09:00");
  const [formPrice60, setFormPrice60] = useState("");
  const [formPrice90, setFormPrice90] = useState("");
  const [formPrice120, setFormPrice120] = useState("");
  const [formPriority, setFormPriority] = useState("0");
  const [formIsActive, setFormIsActive] = useState(true);

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-pricing-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, city")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LocationRow[];
    },
  });

  const { data: bands = [], isLoading } = useQuery({
    queryKey: ["admin-pricing-bands"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("court_pricing_bands")
        .select(
          "id, location_id, sport, name, weekdays, start_minute, end_minute, price_cents_60, price_cents_90, price_cents_120, priority, is_active"
        )
        .order("priority", { ascending: false })
        .order("start_minute", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PricingBand[]).map((b) => ({
        ...b,
        weekdays: (b.weekdays ?? []).map(Number),
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<PricingBand, "id">) => {
      const { error } = await (supabase as any).from("court_pricing_bands").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-bands"] });
      toast.success("Band erstellt");
      setDialogOpen(false);
    },
    onError: bandErrorToast,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: PricingBand) => {
      const { error } = await (supabase as any)
        .from("court_pricing_bands")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-bands"] });
      toast.success("Band gespeichert");
      setDialogOpen(false);
      setEditBand(null);
    },
    onError: bandErrorToast,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("court_pricing_bands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-bands"] });
      toast.success("Band gelöscht");
    },
    onError: (err: Error) => toast.error("Fehler", { description: err.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("court_pricing_bands")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-pricing-bands"] }),
    onError: (err: Error) => toast.error("Status konnte nicht geändert werden: " + err.message),
  });

  const activeLocationId = selectedLocationId || locations[0]?.id || "";
  const globalBands = useMemo(() => bands.filter((b) => !b.location_id), [bands]);
  const locationBands = useMemo(
    () => bands.filter((b) => b.location_id === activeLocationId),
    [bands, activeLocationId]
  );

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    bands.forEach((b, i) => map.set(b.id, BAND_COLORS[i % BAND_COLORS.length]));
    return (id: string) => map.get(id) ?? BAND_COLORS[0];
  }, [bands]);

  /** "<scope>:<sport>" — Standort und Sportart sind unabhängig wählbar. */
  const previewSelection = useMemo<{ locationId: string | null; sport: CourtSport }>(() => {
    const [scope, sport] = previewScope.split(":");
    return {
      locationId: scope === "global" ? null : scope,
      sport: sport === "tennis" ? "tennis" : "padel",
    };
  }, [previewScope]);

  const previewBands = useMemo(() => {
    const { locationId, sport } = previewSelection;
    return bands.filter(
      (b) =>
        bandSport(b) === sport &&
        (locationId ? !b.location_id || b.location_id === locationId : !b.location_id)
    );
  }, [bands, previewSelection]);

  const activePreviewBands = useMemo(() => previewBands.filter((b) => b.is_active), [previewBands]);
  const conflicts = useMemo(() => findConflicts(previewBands), [previewBands]);

  const gridStart = useMemo(() => {
    const earliest = activePreviewBands.reduce(
      (min, b) => Math.min(min, Math.floor(b.start_minute / 60) * 60),
      DEFAULT_GRID_START
    );
    return Math.max(0, earliest);
  }, [activePreviewBands]);

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = gridStart; m < DAY_END; m += SLOT_MINUTES) out.push(m);
    return out;
  }, [gridStart]);

  const conflictCells = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      for (const day of c.weekdays) {
        for (const slot of slots) {
          if (slot < c.toMinute && slot + SLOT_MINUTES > c.fromMinute) set.add(`${day}:${slot}`);
        }
      }
    }
    return set;
  }, [conflicts, slots]);

  const topBandAt = useMemo(() => {
    const map = new Map<string, PricingBand>();
    for (const day of WEEKDAYS) {
      for (const slot of slots) {
        const hits = activePreviewBands
          .filter((b) => b.weekdays.includes(day.iso) && slot >= b.start_minute && slot < b.end_minute)
          .sort(compareBands);
        if (hits[0]) map.set(`${day.iso}:${slot}`, hits[0]);
      }
    }
    return map;
  }, [activePreviewBands, slots]);

  const legendBands = useMemo(() => {
    const visible = new Set<string>();
    topBandAt.forEach((b) => visible.add(b.id));
    return [...activePreviewBands]
      .sort(compareBands)
      .map((band) => ({ band, shadowed: !visible.has(band.id) }));
  }, [topBandAt, activePreviewBands]);

  const resetForm = (scope: string, sport: CourtSport) => {
    setFormName("");
    setFormScope(scope);
    setFormSport(sport);
    setFormWeekdays([1, 2, 3, 4, 5]);
    setFormStart("06:00");
    setFormEnd("09:00");
    setFormPrice60("");
    setFormPrice90("");
    setFormPrice120("");
    setFormPriority("0");
    setFormIsActive(true);
  };

  const openCreate = (scope: string, sport: CourtSport = "padel") => {
    setEditBand(null);
    resetForm(scope, sport);
    setDialogOpen(true);
  };

  const openEdit = (band: PricingBand) => {
    setEditBand(band);
    setFormName(band.name);
    setFormScope(band.location_id ?? "global");
    setFormSport(bandSport(band));
    setFormWeekdays([...band.weekdays].sort((a, b) => a - b));
    setFormStart(minutesToTime(band.start_minute));
    setFormEnd(band.end_minute >= DAY_END ? "00:00" : minutesToTime(band.end_minute));
    setFormPrice60(centsToInput(band.price_cents_60));
    setFormPrice90(centsToInput(band.price_cents_90));
    setFormPrice120(centsToInput(band.price_cents_120));
    setFormPriority(String(band.priority));
    setFormIsActive(band.is_active);
    setDialogOpen(true);
  };

  const toggleWeekday = (iso: number) =>
    setFormWeekdays((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort((a, b) => a - b)
    );

  // Ein Standort hat Padel- UND Tennis-Courts, die Sportart wird deshalb immer
  // eigenständig gewählt — anders als früher beim court-gebundenen Band.
  const formEffectiveSport: CourtSport = formSport;

  const handleScopeChange = (value: string) => setFormScope(value);

  const buildPayload = (): Omit<PricingBand, "id"> | null => {
    const name = formName.trim();
    if (!name) {
      toast.error("Name ist erforderlich");
      return null;
    }
    if (formWeekdays.length === 0) {
      toast.error("Mindestens ein Wochentag muss gewählt sein");
      return null;
    }
    const start = timeToMinutes(formStart);
    const rawEnd = timeToMinutes(formEnd);
    if (start === null || rawEnd === null) {
      toast.error("Zeit im Format HH:MM angeben");
      return null;
    }
    const end = rawEnd === 0 ? DAY_END : rawEnd;
    if (end <= start) {
      toast.error("Ende muss nach dem Start liegen", {
        description: "Bänder über Mitternacht bitte als zwei Bänder anlegen.",
      });
      return null;
    }

    // Tennis ist nur 60 Minuten buchbar — 90/120 werden nicht erfasst und
    // dürfen laut CHECK court_pricing_bands_tennis_60_only auch nicht gesetzt sein.
    const isTennis = formEffectiveSport === "tennis";
    const priceInputs: [string, string][] = isTennis
      ? [["60 Min", formPrice60]]
      : [
          ["60 Min", formPrice60],
          ["90 Min", formPrice90],
          ["120 Min", formPrice120],
        ];

    const prices: (number | null)[] = [];
    for (const [label, raw] of priceInputs) {
      const parsed = parseEuroInput(raw);
      if (parsed === "invalid") {
        toast.error(`Preis ${label} ist ungültig`, { description: "Nur Beträge ab 0,00 €." });
        return null;
      }
      prices.push(parsed);
    }

    const priority = Number.parseInt(formPriority || "0", 10);
    if (!Number.isFinite(priority) || priority < -999 || priority > 999) {
      toast.error("Priorität muss eine ganze Zahl zwischen -999 und 999 sein");
      return null;
    }

    return {
      location_id: formScope === "global" ? null : formScope,
      sport: formEffectiveSport,
      name,
      weekdays: [...formWeekdays].sort((a, b) => a - b),
      start_minute: start,
      end_minute: end,
      price_cents_60: prices[0],
      price_cents_90: isTennis ? null : prices[1],
      price_cents_120: isTennis ? null : prices[2],
      priority,
      is_active: formIsActive,
    };
  };

  const handleSave = () => {
    const payload = buildPayload();
    if (!payload) return;
    if (editBand) updateMutation.mutate({ id: editBand.id, ...payload });
    else createMutation.mutate(payload);
  };

  const locationLabel = (locationId: string | null) => {
    if (!locationId) return "Alle Standorte";
    const location = locations.find((l) => l.id === locationId);
    if (!location) return "Unbekannter Standort";
    return location.city ? `${location.name} · ${location.city}` : location.name;
  };

  const sportChip = (sport: CourtSport) => (
    <span
      className={`flex-none whitespace-nowrap rounded-full border px-[7px] py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SPORT_CHIP_CLASSES[sport]}`}
    >
      {SPORT_LABEL[sport]}
    </span>
  );

  const locationOption = (location: LocationRow, value?: string, withIcon = false) => (
    <SelectItem key={value ?? location.id} value={value ?? location.id}>
      <span className="flex items-center gap-2">
        {withIcon && <MapPin className="h-4 w-4 text-primary" />}
        {locationLabel(location.id)}
      </span>
    </SelectItem>
  );

  const bandSummary = (band: PricingBand) => {
    const parts: string[] = [];
    if (band.price_cents_60 !== null) parts.push(`60 Min ${formatEuro(band.price_cents_60)} €`);
    if (band.price_cents_90 !== null) parts.push(`90 Min ${formatEuro(band.price_cents_90)} €`);
    if (band.price_cents_120 !== null) parts.push(`120 Min ${formatEuro(band.price_cents_120)} €`);
    return parts.length ? parts.join(" · ") : "Nur Standardpreis";
  };

  const weekdayChips = (active: number[]) => (
    <div className="flex flex-wrap gap-[3px]">
      {WEEKDAYS.map((d) => (
        <span
          key={d.iso}
          className={`flex h-[19px] w-[23px] items-center justify-center rounded-[6px] font-mono text-[9.5px] font-bold uppercase ${
            active.includes(d.iso)
              ? "border border-primary/40 bg-primary/[0.14] text-primary"
              : "border border-[hsl(0_0%_14%)] bg-white/[0.02] text-[hsl(0_0%_38%)]"
          }`}
        >
          {d.short}
        </span>
      ))}
    </div>
  );

  const priceCell = (cents: number | null) =>
    cents === null ? (
      <span className="whitespace-nowrap text-[12px] text-[hsl(0_0%_45%)]">Standard</span>
    ) : (
      <span className="whitespace-nowrap font-mono text-[12.5px] font-bold text-foreground">
        {formatEuro(cents)} €
      </span>
    );

  const bandTable = (rows: PricingBand[], emptyText: string, showSport = false) => (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
          {["Name", "Wochentage", "Zeitfenster", "60 Min", "90 Min", "120 Min", "Prio"].map(
            (h) => (
              <TableHead
                key={h}
                className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]"
              >
                {h}
              </TableHead>
            )
          )}
          <TableHead className="h-auto whitespace-nowrap px-0 pb-3 text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
            Aktionen
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
            <TableCell colSpan={8} className="px-0 py-8 text-center text-[13.5px] text-muted-foreground">
              Laden...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
            <TableCell colSpan={8} className="px-0 py-8 text-center text-[13.5px] text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((band) => (
            <TableRow key={band.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]">
              <TableCell className="px-0 py-3 pr-3.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-[26px] w-[3px] flex-none rounded-full"
                    style={{ backgroundColor: colorOf(band.id), opacity: band.is_active ? 1 : 0.3 }}
                  />
                  <span className="block max-w-[190px] truncate text-[13.5px] font-bold text-foreground">
                    {band.name}
                  </span>
                  {showSport && sportChip(bandSport(band))}
                </div>
              </TableCell>
              <TableCell className="px-0 py-3 pr-3.5">{weekdayChips(band.weekdays)}</TableCell>
              <TableCell className="px-0 py-3 pr-3.5">
                <span className="whitespace-nowrap font-mono text-[12.5px] text-[hsl(0_0%_82%)]">
                  {minutesToTime(band.start_minute)}–
                  {band.end_minute >= DAY_END ? "24:00" : minutesToTime(band.end_minute)}
                </span>
              </TableCell>
              <TableCell className="px-0 py-3 pr-3.5">{priceCell(band.price_cents_60)}</TableCell>
              <TableCell className="px-0 py-3 pr-3.5">{priceCell(band.price_cents_90)}</TableCell>
              <TableCell className="px-0 py-3 pr-3.5">{priceCell(band.price_cents_120)}</TableCell>
              <TableCell className="px-0 py-3 pr-3.5">
                <span className="font-mono text-[12.5px] text-[hsl(0_0%_82%)]">{band.priority}</span>
              </TableCell>
              <TableCell className="px-0 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Switch
                    checked={band.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: band.id, is_active: checked })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                    onClick={() => openEdit(band)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
                      <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
                        <AlertTriangle className="h-5 w-5" />
                      </span>
                      <AlertDialogHeader className="space-y-[7px] text-left">
                        <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
                          Band löschen?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
                          Das Band <strong className="text-foreground">{band.name}</strong> wird
                          unwiderruflich gelöscht. Für dieses Zeitfenster gilt danach wieder der
                          Standardpreis.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="gap-2.5">
                        <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                          Abbrechen
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(band.id)}
                          className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const inputClass =
    "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13.5px] font-bold";
  const labelClass = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="text-sm text-muted-foreground">
          Preise und Punkte für alle Standorte an einer Stelle
        </p>

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("tab", value);
                return next;
              },
              { replace: true },
            )
          }
          className="flex flex-col gap-5"
        >
          <TabsList className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-[hsl(0_0%_12%)] bg-transparent p-0 sm:gap-[22px]">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className={TAB_TRIGGER_CLASSES}>
                <tab.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="points" className="mt-0">
            <PointsSettingsCard />
          </TabsContent>

          <TabsContent value="wallets" className="mt-0">
            <P2GWalletsTab />
          </TabsContent>

          <TabsContent value="overview" className="mt-0">
            <P2GDashboardTab />
          </TabsContent>

          <TabsContent value="prices" className="mt-0 flex flex-col gap-[18px]">
        <StandardPricesCard />

        <LocationExceptionsCard />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Zeitfenster für abweichende Preise — global oder nur für einen Standort
          </p>
          <Button
            onClick={() => openCreate("global")}
            className="h-9 gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Neues Band
          </Button>
        </div>

        {/* Regelwerk */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                <Info className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-base font-bold tracking-tight text-foreground">
                  So greifen Bänder
                </span>
                <span className="text-xs leading-snug text-muted-foreground">
                  Standort-Band schlägt globales Band, danach entscheidet die höhere Priorität.
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2.5 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-[13px]">
                <MapPin className="mt-0.5 h-[15px] w-[15px] flex-none text-[hsl(0_0%_58%)]" />
                <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                  Ohne passendes Band gilt die Standort-Ausnahme, sonst der globale Standardpreis.
                </span>
              </div>
              <div className="flex items-start gap-2.5 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-[13px]">
                <Globe className="mt-0.5 h-[15px] w-[15px] flex-none text-[hsl(0_0%_58%)]" />
                <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                  Jedes Band gehört genau einer Sportart. „Alle Standorte" heißt: überall innerhalb
                  dieser Sportart — ein Padel-Band greift nie auf einem Tennis-Court.
                </span>
              </div>
              <div className="flex items-start gap-2.5 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-[13px]">
                <Sparkles className="mt-0.5 h-[15px] w-[15px] flex-none text-primary" />
                <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                  Bänder ändern nur den Preis. Die Punkte hängen allein an der Dauer und am Standort.
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Globale Bänder */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                  <Globe className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Globale Bänder{" "}
                    <span className="font-mono text-sm font-normal text-muted-foreground">
                      ({globalBands.length})
                    </span>
                  </h2>
                  <span className="text-xs leading-snug text-muted-foreground">
                    Gelten an allen Standorten — innerhalb ihrer Sportart.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => openCreate("global")}
                className="h-9 gap-[7px] rounded-[10px] border-primary/30 bg-primary/[0.09] px-[15px] text-[13px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
              >
                <Plus className="h-4 w-4" />
                Globales Band
              </Button>
            </div>
            {bandTable(globalBands, "Noch keine globalen Bänder angelegt", true)}
          </div>
        </Card>

        {/* Standort-Bänder */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Standort-Bänder{" "}
                    <span className="font-mono text-sm font-normal text-muted-foreground">
                      ({locationBands.length})
                    </span>
                  </h2>
                  <span className="text-xs leading-snug text-muted-foreground">
                    Gelten nur am gewählten Standort und schlagen globale Bänder.
                  </span>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <Select value={activeLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger className="h-9 w-[min(240px,100%)] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                    <SelectValue placeholder="Standort wählen" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                    {locations.map((location) => locationOption(location))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={!activeLocationId}
                  onClick={() => openCreate(activeLocationId)}
                  className="h-9 gap-[7px] rounded-[10px] border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.09)] px-[15px] text-[13px] font-bold text-[#7FD4FF] hover:bg-[hsl(200_100%_75%/0.18)] hover:text-[#7FD4FF]"
                >
                  <Plus className="h-4 w-4" />
                  Standort-Band
                </Button>
              </div>
            </div>
            {locations.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-muted-foreground">
                Noch keine Standorte angelegt
              </p>
            ) : (
              bandTable(locationBands, "Für diesen Standort sind keine eigenen Bänder angelegt")
            )}
          </div>
        </Card>

        {/* Wochen-Vorschau */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                    Wochen-Vorschau
                  </h2>
                  <span className="text-xs leading-snug text-muted-foreground">
                    Raster in 30-Minuten-Schritten, bewertet wird die Startzeit der Buchung.
                  </span>
                </div>
              </div>
              <Select value={previewScope} onValueChange={setPreviewScope}>
                <SelectTrigger className="h-9 w-[min(240px,100%)] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                  <SelectItem value="global:padel">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" /> Nur globale Bänder
                      {sportChip("padel")}
                    </span>
                  </SelectItem>
                  <SelectItem value="global:tennis">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-[#7FD4FF]" /> Nur globale Bänder
                      {sportChip("tennis")}
                    </span>
                  </SelectItem>
                  {locations.flatMap((location) => [
                    locationOption(location, `${location.id}:padel`),
                    locationOption(location, `${location.id}:tennis`),
                  ])}
                </SelectContent>
              </Select>
            </div>

            {conflicts.length > 0 && (
              <div className="flex flex-col gap-2 rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.07)] px-[15px] py-[13px]">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-[15px] w-[15px] flex-none text-[#FF6B6B]" />
                  <span className="text-[12.5px] font-bold leading-relaxed text-[#FF6B6B]">
                    {conflicts.length}{" "}
                    {conflicts.length === 1 ? "Überschneidung" : "Überschneidungen"} bei gleicher
                    Priorität — welches Band gewinnt, ist nicht steuerbar.
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 pl-[25px]">
                  {conflicts.map((c) => (
                    <div key={`${c.a.id}-${c.b.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[12.5px] font-semibold text-foreground">
                        {c.a.name} ↔ {c.b.name}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[11.5px] text-[hsl(0_0%_72%)]">
                        {c.weekdays.map((d) => WEEKDAYS[d - 1].short).join(", ")}{" "}
                        {minutesToTime(c.fromMinute)}–
                        {c.toMinute >= DAY_END ? "24:00" : minutesToTime(c.toMinute)}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_52%)]">
                        Prio {c.a.priority} · {c.a.location_id ? "Standort" : "Global"} ·{" "}
                        {SPORT_LABEL[bandSport(c.a)]}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="pl-[25px] text-[11.5px] leading-relaxed text-[hsl(0_0%_68%)]">
                  Priorität eines Bandes erhöhen oder Zeitfenster trennen.
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="grid min-w-[264px] grid-cols-[38px_repeat(7,minmax(0,1fr))] gap-x-[2px] sm:grid-cols-[54px_repeat(7,minmax(0,1fr))]">
                <span />
                {WEEKDAYS.map((d) => (
                  <span
                    key={d.iso}
                    className="pb-1.5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(0_0%_65%)]"
                  >
                    {d.short}
                  </span>
                ))}

                {slots.map((slot) => {
                  const isHour = slot % 60 === 0;
                  return (
                    <div key={slot} className="contents">
                      <span
                        className={`pr-1.5 text-right font-mono text-[9.5px] leading-[14px] ${
                          isHour ? "text-[hsl(0_0%_58%)]" : "text-transparent"
                        }`}
                      >
                        {isHour ? minutesToTime(slot) : "·"}
                      </span>
                      {WEEKDAYS.map((d) => {
                        const key = `${d.iso}:${slot}`;
                        const band = topBandAt.get(key);
                        const conflict = conflictCells.has(key);
                        const color = band ? colorOf(band.id) : null;
                        const title = band
                          ? `${d.short} ${minutesToTime(slot)} · ${band.name} · ${bandSummary(band)}${
                              conflict ? " · ÜBERSCHNEIDUNG bei gleicher Priorität" : ""
                            }`
                          : `${d.short} ${minutesToTime(slot)} · Standardpreis`;
                        return (
                          <div
                            key={key}
                            title={title}
                            className={`h-[14px] ${isHour ? "border-t border-[hsl(0_0%_11%)]" : ""} ${
                              band ? "" : "bg-white/[0.02]"
                            }`}
                            style={
                              conflict
                                ? {
                                    backgroundImage:
                                      "repeating-linear-gradient(45deg,#FF6B6B 0 3px,rgba(255,107,107,0.18) 3px 7px)",
                                    boxShadow: "inset 0 0 0 1px #FF6B6B",
                                  }
                                : color
                                  ? { backgroundColor: `${color}4D` }
                                  : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legende */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[hsl(0_0%_12%)] pt-3.5">
              {legendBands.length === 0 ? (
                <span className="text-[12.5px] text-muted-foreground">
                  Kein aktives Band in diesem Geltungsbereich — überall gilt der Standardpreis.
                </span>
              ) : (
                legendBands.map(({ band, shadowed }) => (
                  <span key={band.id} className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-[11px] w-[11px] flex-none rounded-[3px]"
                      style={{ backgroundColor: `${colorOf(band.id)}${shadowed ? "33" : "CC"}` }}
                    />
                    <span
                      className={`truncate text-[12.5px] font-semibold ${
                        shadowed ? "text-[hsl(0_0%_55%)] line-through" : "text-foreground"
                      }`}
                    >
                      {band.name}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_60%)]">
                      {band.location_id ? "Standort" : "Global"} · Prio {band.priority} · {bandSummary(band)}
                    </span>
                    {shadowed && (
                      <span className="whitespace-nowrap rounded-full border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#FFC44D]">
                        verdeckt
                      </span>
                    )}
                  </span>
                ))
              )}
              <span className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] flex-none rounded-[3px] bg-white/[0.08]" />
                <span className="text-[12.5px] text-muted-foreground">Standardpreis</span>
              </span>
              {conflicts.length > 0 && (
                <span className="flex items-center gap-2">
                  <span
                    className="h-[11px] w-[11px] flex-none rounded-[3px]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg,#FF6B6B 0 3px,rgba(255,107,107,0.18) 3px 7px)",
                    }}
                  />
                  <span className="text-[12.5px] font-semibold text-[#FF6B6B]">Überschneidung</span>
                </span>
              )}
            </div>
          </div>
        </Card>

          </TabsContent>
        </Tabs>

        {/* Anlegen / Bearbeiten */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditBand(null);
          }}
        >
          <DialogContent className="max-h-[88vh] gap-[17px] overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[560px] sm:rounded-[20px]">
            <DialogHeader className="space-y-0 text-left">
              <span className="mb-[5px] block font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                Zeitfenster-Band
              </span>
              <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                {editBand ? "Band bearbeiten" : "Neues Band anlegen"}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-[17px]">
              <div className="flex flex-col gap-[7px]">
                <Label className={labelClass}>
                  Name<span className="text-primary"> *</span>
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="z. B. Frühtarif"
                  className="h-[42px] rounded-[11px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[15px] font-bold"
                />
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className={labelClass}>
                  Geltungsbereich<span className="text-primary"> *</span>
                </Label>
                <Select value={formScope} onValueChange={handleScopeChange}>
                  <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                    <SelectItem value="global">
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" /> Alle Standorte
                      </span>
                    </SelectItem>
                    {locations.map((location) => locationOption(location, undefined, true))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className={labelClass}>
                  Sportart<span className="text-primary"> *</span>
                </Label>
                <SportSelect value={formSport} onChange={setFormSport} className="self-start" />
                <span className="text-[11.5px] leading-relaxed text-[hsl(0_0%_58%)]">
                  Das Band gilt nur für Courts dieser Sportart.
                </span>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className={labelClass}>
                  Wochentage<span className="text-primary"> *</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = formWeekdays.includes(d.iso);
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => toggleWeekday(d.iso)}
                        className={`h-9 min-w-[42px] rounded-[10px] border px-2 font-mono text-[12px] font-bold uppercase transition-colors ${
                          active
                            ? "border-primary/45 bg-primary/[0.16] text-primary"
                            : "border-[hsl(0_0%_16%)] bg-white/[0.03] text-[hsl(0_0%_62%)] hover:border-primary/30 hover:text-foreground"
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFormWeekdays([1, 2, 3, 4, 5])}
                    className="text-[11.5px] font-bold text-[hsl(0_0%_58%)] underline-offset-2 hover:text-primary hover:underline"
                  >
                    Mo–Fr
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormWeekdays([6, 7])}
                    className="text-[11.5px] font-bold text-[hsl(0_0%_58%)] underline-offset-2 hover:text-primary hover:underline"
                  >
                    Sa–So
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormWeekdays([1, 2, 3, 4, 5, 6, 7])}
                    className="text-[11.5px] font-bold text-[hsl(0_0%_58%)] underline-offset-2 hover:text-primary hover:underline"
                  >
                    Alle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3">
                <div className="flex flex-col gap-[7px]">
                  <Label className={labelClass}>
                    Von<span className="text-primary"> *</span>
                  </Label>
                  <Input
                    type="time"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-[7px]">
                  <Label className={labelClass}>
                    Bis<span className="text-primary"> *</span>
                  </Label>
                  <Input
                    type="time"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <span className="-mt-[9px] text-[11.5px] leading-relaxed text-[hsl(0_0%_58%)]">
                Ende ist exklusiv. 00:00 als Ende bedeutet Mitternacht (24:00). Bänder über
                Mitternacht als zwei Bänder anlegen.
              </span>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3">
                {(formEffectiveSport === "tennis"
                  ? ([["Preis 60 Min", formPrice60, setFormPrice60]] as const)
                  : ([
                      ["Preis 60 Min", formPrice60, setFormPrice60],
                      ["Preis 90 Min", formPrice90, setFormPrice90],
                      ["Preis 120 Min", formPrice120, setFormPrice120],
                    ] as const)
                ).map(([label, value, setter]) => (
                  <div key={label} className="flex flex-col gap-[7px]">
                    <Label className={labelClass}>{label}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder="Standard"
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      <span className="flex-none text-muted-foreground">€</span>
                    </div>
                  </div>
                ))}
              </div>
              <span className="-mt-[9px] text-[11.5px] leading-relaxed text-[hsl(0_0%_58%)]">
                Leer lassen = Standort-Ausnahme bzw. globaler Standardpreis bleibt gültig.
                {formEffectiveSport === "tennis" && (
                  <>
                    {" "}
                    Tennis ist nur 60 Minuten buchbar — 90- und 120-Minuten-Preise sind deshalb
                    nicht möglich.
                  </>
                )}
              </span>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
                <div className="flex flex-col gap-[7px]">
                  <Label className={labelClass}>Priorität</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-[11.5px] text-[hsl(0_0%_58%)]">
                    Höherer Wert gewinnt bei Überlappung.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Label className="text-[13.5px] font-bold text-foreground">Aktiv</Label>
                  <span className="text-xs text-muted-foreground">
                    Nur aktive Bänder wirken auf den Preis.
                  </span>
                </div>
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              </div>
            </div>

            <DialogFooter className="gap-2.5 border-t border-[hsl(0_0%_12%)] pt-4">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                >
                  Abbrechen
                </Button>
              </DialogClose>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] hover:opacity-90"
              >
                {editBand ? "Speichern" : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
