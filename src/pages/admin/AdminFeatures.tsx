import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, Loader2, Coins, ShoppingCart, DoorOpen, Users, Info,
  CalendarCheck, MapPin, Newspaper, ArrowRight, Eye, EyeOff, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FEATURE_NAMES, FEATURE_LABELS, FEATURE_TOGGLES_QUERY_KEY, type FeatureName, type FeatureState } from "@/hooks/useFeatureToggles";

interface FeatureConfig {
  name: FeatureName;
  description: string;
  /** Was der Schalter konkret ein- und ausblendet. */
  affects: string;
  route: string;
  icon: React.ElementType;
}

const FEATURES: FeatureConfig[] = [
  {
    name: "booking",
    description: "Standorte, Courts, Slot-Auswahl und Checkout – inkl. Gast-Buchung.",
    affects: "Nav-Link „Court buchen“ (öffentlich + eingeloggt), Hero-Button, /booking, Standort-Seiten, Checkout",
    route: "/booking",
    icon: CalendarCheck,
  },
  {
    name: "marketplace",
    description: "Shop mit Equipment, Merchandise und Punkte-Einlösung.",
    affects: "Nav-Link „Shop“ (öffentlich + eingeloggt), Dashboard-Kachel, /marketplace inkl. Produkt und Checkout",
    route: "/marketplace",
    icon: ShoppingCart,
  },
  {
    name: "events",
    description: "Padel-Events mit Anmeldung und Ticket-Code.",
    affects: "Nav-Link „Events“ (öffentlich + eingeloggt), Dashboard-Kachel, /events und /dashboard/events",
    route: "/events",
    icon: Calendar,
  },
  {
    name: "lobbies",
    description: "Spontane Spielrunden erstellen und beitreten.",
    affects: "Lobby-Buttons in Buchung und Buchungsbestätigung, /lobbies",
    route: "/lobbies",
    icon: DoorOpen,
  },
  {
    name: "league",
    description: "Rangliste und Spieler-Statistiken.",
    affects: "/dashboard/league und alle Einstiege dorthin",
    route: "/dashboard/league",
    icon: Trophy,
  },
  {
    name: "p2g",
    description: "Punkte sammeln durch Buchungen und Matches, einlösen im Shop.",
    affects: "/dashboard/p2g-points und alle Einstiege dorthin",
    route: "/dashboard/p2g-points",
    icon: Coins,
  },
  {
    name: "friends",
    description: "Freunde finden, einladen und chatten.",
    affects: "/dashboard/friends, /dashboard/chat und alle Einstiege dorthin",
    route: "/dashboard/friends",
    icon: Users,
  },
];

const STATE_OPTIONS: { value: FeatureState; label: string }[] = [
  { value: "visible", label: "Für alle sichtbar" },
  { value: "demo", label: "Nur Admins (Vorschau)" },
  { value: "hidden", label: "Aus" },
];

const STATE_BADGE: Record<FeatureState, { label: string; className: string }> = {
  visible: { label: "Live", className: "border-primary/[0.35] bg-primary/[0.12] text-primary" },
  demo: { label: "Vorschau", className: "border-[hsl(200_100%_75%/0.35)] bg-[hsl(200_100%_75%/0.12)] text-[#7FD4FF]" },
  hidden: { label: "Aus", className: "border-[hsl(0_0%_20%)] bg-white/[0.06] text-muted-foreground" },
};

const PILL_CLASSES =
  "inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]";

const STATE_INFO: { state: FeatureState; label: string; text: string }[] = [
  { state: "visible", label: "Für alle sichtbar", text: "Besucher und eingeloggte User sehen Nav-Link, Seite und alle Buttons dorthin." },
  { state: "demo", label: "Nur Admins (Vorschau)", text: "Nur Admins sehen die Funktion, mit blauem Vorschau-Hinweis unten links. Alle anderen sehen „Bald verfügbar“. So testest du vor dem Launch." },
  { state: "hidden", label: "Aus", text: "Niemand sieht die Funktion, auch Admins nicht. Nav-Link verschwindet, die Seite zeigt „Bald verfügbar“. Zum Testen „Nur Admins“ wählen." },
];

// ISO-Timestamp → Wert für <input type="datetime-local"> (lokale Zeit, "YYYY-MM-DDTHH:mm")
interface ContentStatus {
  locationsOnline: number;
  locationsOffline: number;
  courtsActive: number;
  courtsInactive: number;
  eventsPublished: number;
  eventsDraft: number;
  articlesPublished: number;
  articlesDraft: number;
  productsActive: number;
  productsInactive: number;
}

async function loadContentStatus(): Promise<ContentStatus> {
  const [locations, courts, events, articles, products] = await Promise.all([
    supabase.from("locations").select("is_online"),
    supabase.from("courts").select("is_active"),
    // events / articles / marketplace_items fehlen (noch) in den generierten Typen.
    (supabase as any).from("events").select("is_published") as Promise<{ data: { is_published: boolean }[] | null }>,
    (supabase as any).from("articles").select("is_published") as Promise<{ data: { is_published: boolean }[] | null }>,
    (supabase as any).from("marketplace_items").select("is_active, status") as Promise<{ data: { is_active: boolean; status: string }[] | null }>,
  ]);
  const count = <T,>(rows: T[] | null | undefined, pred: (r: T) => boolean) => (rows ?? []).filter(pred).length;
  return {
    locationsOnline: count(locations.data, (r) => r.is_online),
    locationsOffline: count(locations.data, (r) => !r.is_online),
    courtsActive: count(courts.data, (r) => r.is_active),
    courtsInactive: count(courts.data, (r) => !r.is_active),
    eventsPublished: count(events.data, (r) => r.is_published),
    eventsDraft: count(events.data, (r) => !r.is_published),
    articlesPublished: count(articles.data, (r) => r.is_published),
    articlesDraft: count(articles.data, (r) => !r.is_published),
    productsActive: count(products.data, (r) => r.is_active && r.status !== "draft"),
    productsInactive: count(products.data, (r) => !r.is_active || r.status === "draft"),
  };
}

export default function AdminFeatures() {
  const queryClient = useQueryClient();
  const [featureVisibility, setFeatureVisibility] = useState<Record<FeatureName, FeatureState>>(
    Object.fromEntries(FEATURE_NAMES.map((n) => [n, "hidden"])) as Record<FeatureName, FeatureState>,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: ["admin-content-status"],
    queryFn: loadContentStatus,
    staleTime: 30_000,
  });

  useEffect(() => {
    fetchFeatureStates();
  }, []);

  const fetchFeatureStates = async () => {
    try {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", "global").single();
      if (error) throw error;
      const row = data as Record<string, unknown>;
      setFeatureVisibility(
        Object.fromEntries(
          FEATURE_NAMES.map((n) => {
            const v = row[`feature_${n}_state`];
            return [n, v === "visible" || v === "demo" ? v : "hidden"];
          }),
        ) as Record<FeatureName, FeatureState>,
      );
    } catch (error) {
      console.error("Error fetching feature states:", error);
      toast.error("Fehler beim Laden der Sichtbarkeit");
    } finally {
      setIsLoading(false);
    }
  };

  const updateFeatureState = async (name: FeatureName, state: FeatureState) => {
    setSavingKey(name);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("site_settings")
        .update({ [`feature_${name}_state`]: state, updated_at: new Date().toISOString(), updated_by: userData.user?.id })
        .eq("id", "global");
      if (error) throw error;
      setFeatureVisibility((prev) => ({ ...prev, [name]: state }));
      queryClient.invalidateQueries({ queryKey: FEATURE_TOGGLES_QUERY_KEY });
      const messages: Record<FeatureState, string> = {
        visible: `${FEATURE_LABELS[name]} ist jetzt für alle sichtbar`,
        demo: `${FEATURE_LABELS[name]} sehen jetzt nur Admins (Vorschau)`,
        hidden: `${FEATURE_LABELS[name]} ist jetzt ausgeblendet`,
      };
      toast.success(messages[state]);
    } catch (error) {
      console.error("Error updating feature state:", error);
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const contentRows: { icon: React.ElementType; label: string; on: number; off: number; onLabel: string; offLabel: string; to: string; hint: string }[] = content
    ? [
        { icon: MapPin, label: "Standorte", on: content.locationsOnline, off: content.locationsOffline, onLabel: "online", offLabel: "offline", to: "/admin/courts", hint: "Schalter „Online“ pro Standort" },
        { icon: CalendarCheck, label: "Courts", on: content.courtsActive, off: content.courtsInactive, onLabel: "aktiv", offLabel: "inaktiv", to: "/admin/courts", hint: "Schalter „Aktiv“ pro Court" },
        { icon: Calendar, label: "Events", on: content.eventsPublished, off: content.eventsDraft, onLabel: "veröffentlicht", offLabel: "Entwurf", to: "/admin/events", hint: "„Veröffentlicht“ pro Event" },
        { icon: Newspaper, label: "Artikel", on: content.articlesPublished, off: content.articlesDraft, onLabel: "veröffentlicht", offLabel: "Entwurf", to: "/admin/news", hint: "„Veröffentlicht“ + Zielgruppe pro Artikel" },
        { icon: ShoppingCart, label: "Produkte", on: content.productsActive, off: content.productsInactive, onLabel: "im Shop", offLabel: "inaktiv / Entwurf", to: "/admin/marketplace", hint: "„Aktiv“ + Status pro Produkt" },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="text-sm text-muted-foreground">
          Hier steuerst du, welche <span className="font-semibold text-foreground">Funktionen</span> Besucher und User sehen.
          Ob einzelne <span className="font-semibold text-foreground">Inhalte</span> (Standorte, Events, Artikel, Produkte) erscheinen,
          entscheidest du dort, wo du sie pflegst – die Übersicht unten zeigt den Stand.
        </p>

        {/* ── Funktionen ───────────────────────────────────── */}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="font-display text-base font-bold tracking-tight text-foreground">Funktionen</span>
          <span className="text-[12.5px] text-muted-foreground">{FEATURES.length} Funktionen · ein Zustand steuert Nav-Link, Seite und Buttons</span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3.5">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const state = featureVisibility[feature.name];
            const isSaving = savingKey === feature.name;
            const badge = STATE_BADGE[state];
            return (
              <Card key={feature.name} className="flex h-full flex-col gap-3.5 rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border ${
                        state === "visible"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : state === "demo"
                            ? "border-[hsl(200_100%_75%/0.32)] bg-[hsl(200_100%_75%/0.12)] text-[#7FD4FF]"
                            : "border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-display text-[15px] font-bold tracking-tight text-foreground">{FEATURE_LABELS[feature.name]}</span>
                      <Link to={feature.route} className="truncate font-mono text-[10.5px] text-muted-foreground hover:text-primary">
                        {feature.route}
                      </Link>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${PILL_CLASSES} flex-none ${badge.className}`}>
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {badge.label}
                  </Badge>
                </div>

                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{feature.description}</p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
                  <span className="font-semibold text-muted-foreground">Wirkt auf: </span>
                  {feature.affects}
                </p>

                <div className="mt-auto flex items-center gap-2.5">
                  <Select value={state} onValueChange={(value) => updateFeatureState(feature.name, value as FeatureState)} disabled={isSaving}>
                    <SelectTrigger className="h-[38px] w-full rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isSaving && <Loader2 className="h-4 w-4 flex-none animate-spin text-primary" />}
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── Erklärung der Zustände ───────────────────────── */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
                <Info className="h-[15px] w-[15px]" />
              </span>
              <span className="font-display text-[15px] font-bold tracking-tight text-foreground">Die drei Zustände</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
              {STATE_INFO.map((info) => (
                <div key={info.state} className="flex flex-col gap-[7px] rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] p-3.5">
                  <span className={`${PILL_CLASSES} self-start ${STATE_BADGE[info.state].className}`}>
                    {info.state === "visible" ? <Eye className="h-3 w-3" /> : info.state === "demo" ? <ShieldCheck className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {info.label}
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-muted-foreground">{info.text}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Inhalte ──────────────────────────────────────── */}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="font-display text-base font-bold tracking-tight text-foreground">Inhalte</span>
          <span className="text-[12.5px] text-muted-foreground">Werden dort ein- und ausgeblendet, wo sie gepflegt werden – hier nur der Stand</span>
        </div>

        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          {contentLoading || !content ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {contentRows.map((row) => (
                <Link
                  key={row.label}
                  to={row.to}
                  className="group flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-3 transition-colors hover:border-primary/40"
                >
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)] group-hover:text-primary">
                    <row.icon className="h-4 w-4" />
                  </span>
                  <div className="flex min-w-[160px] flex-1 flex-col gap-[2px]">
                    <span className="text-sm font-bold text-foreground">{row.label}</span>
                    <span className="text-xs text-muted-foreground">{row.hint}</span>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <span className={`${PILL_CLASSES} ${row.on > 0 ? STATE_BADGE.visible.className : STATE_BADGE.hidden.className}`}>
                      {row.on} {row.onLabel}
                    </span>
                    <span className={`${PILL_CLASSES} ${STATE_BADGE.hidden.className}`}>
                      {row.off} {row.offLabel}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

      </div>
    </AdminLayout>
  );
}
