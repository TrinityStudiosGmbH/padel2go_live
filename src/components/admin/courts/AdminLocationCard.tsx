import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { MapPin, Edit, Building2, Trash2, Trophy, Brain, ShoppingCart, Euro, AlertTriangle } from "lucide-react";
import { COURT_FEATURES } from "@/lib/courtFeatures";
import { useState } from "react";
import { CourtPriceDialog } from "./CourtPriceDialog";
import { useQueryClient } from "@tanstack/react-query";
import { Location, SPORT_CHIP_CLASSES, SPORT_LABEL, courtSport } from "./types";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { LocationForm } from "./LocationForm";
import { CourtCountSelector } from "./CourtCountSelector";
import { useLocationMutations } from "./useLocationMutations";

const CHIP_BASE =
  "inline-flex items-center whitespace-nowrap rounded-[7px] border px-[9px] py-1 text-[11px] font-semibold";
const CHIP_OFF = "border-[hsl(0_0%_11%)] bg-white/[0.015] text-[hsl(0_0%_36%)]";
const CHIP_ON_NEUTRAL = "border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_78%)]";

/** Plattform-Merkmale in fester Reihenfolge — dieselben auf jeder Karte. */
const PLATFORM_FEATURES = [
  { key: "rewards_enabled", label: "Rewards", icon: Trophy, onClass: "border-primary/30 bg-primary/10 text-primary" },
  { key: "ai_analysis_enabled", label: "KI", icon: Brain, onClass: "border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]" },
  { key: "vending_enabled", label: "Automat", icon: ShoppingCart, onClass: "border-[hsl(263_100%_82%/0.3)] bg-[hsl(263_100%_82%/0.1)] text-[#C7A6FF]" },
] as const satisfies ReadonlyArray<{ key: keyof Location; label: string; icon: typeof Trophy; onClass: string }>;

interface AdminLocationCardProps {
  location: Location;
}

export function AdminLocationCard({ location }: AdminLocationCardProps) {
  const queryClient = useQueryClient();
  const [priceDialogCourt, setPriceDialogCourt] = useState<{ id: string; name: string } | null>(null);
  const {
    toggleCourtMutation,
    toggleLocationOnline,
    toggleLocationFeature,
    deleteLocationMutation,
  } = useLocationMutations();

  const courts = location.courts || [];
  const tennisCourts = courts.filter((c) => courtSport(c) === "tennis").length;
  const padelCourts = courts.length - tennisCourts;

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-border bg-gradient-card">
      {/* Bild-Header */}
      <div className="relative h-[150px] flex-none">
        {location.main_image_url ? (
          <img
            src={location.main_image_url}
            alt={location.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-secondary to-muted">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(0_0%_0%/0.15),hsl(0_0%_0%/0.85))]" />

        {/* Status- und 24/7-Pills */}
        <div className="absolute left-[13px] right-[13px] top-[13px] flex items-center justify-between gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/65 px-[11px] py-[5px] text-[11px] font-bold backdrop-blur-md ${
              location.is_online
                ? "border-primary/40 text-primary"
                : "border-[hsl(0_100%_71%/0.4)] text-[#FF6B6B]"
            }`}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-current" />
            {location.is_online ? "Online" : "Offline"}
          </span>
          <span
            className={`whitespace-nowrap rounded-full border bg-black/65 px-2.5 py-[5px] font-mono text-[10px] tracking-[0.1em] backdrop-blur-md ${
              location.is_24_7 ? "border-white/20 text-foreground" : "border-white/10 text-[hsl(0_0%_55%)]"
            }`}
          >
            {location.is_24_7 ? "24/7" : "Feste Zeiten"}
          </span>
        </div>

        {/* Name + Adresse */}
        <div className="absolute bottom-[13px] left-[15px] right-[15px] flex flex-col gap-[3px]">
          <CardTitle className="truncate font-display text-lg font-extrabold tracking-tight text-foreground">
            {location.name}
          </CardTitle>
          <p className="flex items-center gap-1.5 text-xs text-[hsl(0_0%_78%)]">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {location.city
                ? `${location.address || ""}, ${location.postal_code || ""} ${location.city}`
                : location.address || "Keine Adresse"}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[15px] px-[18px] pb-[18px] pt-4">
        {/* Merkmale — bewusst auf JEDER Karte dieselbe Liste in derselben
            Reihenfolge, Inaktives nur gedimmt. So zeigen alle Karten dieselben
            Infos, sind vergleichbar und bleiben gleich hoch. */}
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_FEATURES.map(({ key, label, icon: Icon, onClass }) => {
            const on = !!location[key];
            return (
              <span
                key={key}
                title={on ? `${label}: aktiv` : `${label}: inaktiv`}
                className={`${CHIP_BASE} ${on ? onClass : CHIP_OFF}`}
              >
                <Icon className="mr-1 h-3 w-3" /> {label}
              </span>
            );
          })}
          {COURT_FEATURES.map(({ key, label, icon: Icon }) => {
            const on = (location.features_json as Record<string, boolean> | null)?.[key] === true;
            return (
              <span
                key={key}
                title={on ? `${label}: vorhanden` : `${label}: nicht vorhanden`}
                className={`${CHIP_BASE} ${on ? CHIP_ON_NEUTRAL : CHIP_OFF}`}
              >
                <Icon className="mr-1 h-3 w-3" /> {label}
              </span>
            );
          })}
        </div>

        {/* Feature Toggles */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-[11px] border border-[hsl(0_0%_12%)] bg-white/[0.028] p-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`online-${location.id}`} className="text-[12.5px] font-semibold text-[hsl(0_0%_85%)]">
              Online
            </Label>
            <Switch
              id={`online-${location.id}`}
              checked={location.is_online}
              onCheckedChange={(checked) =>
                toggleLocationOnline.mutate({
                  locationId: location.id,
                  isOnline: checked,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`rewards-${location.id}`} className="text-[12.5px] font-semibold text-[hsl(0_0%_85%)]">
              Rewards
            </Label>
            <Switch
              id={`rewards-${location.id}`}
              checked={location.rewards_enabled}
              onCheckedChange={(checked) =>
                toggleLocationFeature.mutate({
                  locationId: location.id,
                  feature: "rewards_enabled",
                  enabled: checked,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`ai-${location.id}`} className="text-[12.5px] font-semibold text-[hsl(0_0%_85%)]">
              KI-Analyse
            </Label>
            <Switch
              id={`ai-${location.id}`}
              checked={location.ai_analysis_enabled}
              onCheckedChange={(checked) =>
                toggleLocationFeature.mutate({
                  locationId: location.id,
                  feature: "ai_analysis_enabled",
                  enabled: checked,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`vending-${location.id}`} className="text-[12.5px] font-semibold text-[hsl(0_0%_85%)]">
              Automaten
            </Label>
            <Switch
              id={`vending-${location.id}`}
              checked={location.vending_enabled}
              onCheckedChange={(checked) =>
                toggleLocationFeature.mutate({
                  locationId: location.id,
                  feature: "vending_enabled",
                  enabled: checked,
                })
              }
            />
          </div>
        </div>

        {/* Courts */}
        <div className="flex flex-col gap-[9px] border-t border-[hsl(0_0%_12%)] pt-[13px]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h3 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[hsl(0_0%_65%)]">
              Courts ({courts.length})
              {" · "}
              <span className={padelCourts > 0 ? "text-primary" : "text-[hsl(0_0%_40%)]"}>{padelCourts} Padel</span>
              {" · "}
              <span className={tennisCourts > 0 ? "text-[#7FD4FF]" : "text-[hsl(0_0%_40%)]"}>{tennisCourts} Tennis</span>
            </h3>
            <CourtCountSelector
              locationId={location.id}
              currentCourts={courts}
              maxCourts={2}
            />
          </div>
          {courts.length === 0 ? (
            <p className="rounded-[11px] border border-dashed border-[hsl(0_0%_14%)] px-[11px] py-[9px] text-[12.5px] text-muted-foreground">
              Noch keine Courts angelegt.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-[9px]">
              {/* Show active courts first, then inactive */}
              {[...courts]
                .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))
                .map((court) => (
                <div
                  key={court.id}
                  className={`flex items-center gap-2.5 rounded-[11px] border py-[9px] pl-[11px] pr-[9px] ${
                    court.is_active
                      ? "border-[hsl(0_0%_12%)] bg-white/[0.028]"
                      : "border-[hsl(0_0%_12%)] bg-white/[0.015] opacity-60"
                  }`}
                >
                  <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${
                    court.is_active ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {court.name}
                  </span>
                  <span
                    className={`flex-shrink-0 whitespace-nowrap rounded-[7px] border px-[7px] py-[3px] text-[10.5px] font-semibold ${
                      SPORT_CHIP_CLASSES[courtSport(court)]
                    }`}
                  >
                    {SPORT_LABEL[courtSport(court)]}
                  </span>
                  {!court.is_active && (
                    <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-[hsl(0_100%_71%/0.1)] px-2 py-[3px] text-[10.5px] font-bold text-[#FF6B6B]">
                      Inaktiv
                    </span>
                  )}
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                      onClick={() => setPriceDialogCourt({ id: court.id, name: court.name })}
                    >
                      <Euro className="h-3.5 w-3.5" />
                    </Button>
                    <Label
                      htmlFor={`court-active-${court.id}`}
                      className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(0_0%_58%)] sm:inline"
                    >
                      Aktiv
                    </Label>
                    <Switch
                      id={`court-active-${court.id}`}
                      checked={court.is_active}
                      onCheckedChange={(checked) =>
                        toggleCourtMutation.mutate({ courtId: court.id, isActive: checked })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aktionen — durch mt-auto auf jeder Karte auf gleicher Hoehe */}
        <div className="mt-auto flex gap-[9px] pt-1">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 flex-1 gap-[7px] rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
              >
                <Edit className="h-3.5 w-3.5" />
                Bearbeiten
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
              <DialogHeader className="gap-[5px] space-y-0 text-left">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Standort
                </span>
                <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                  Standort bearbeiten
                </DialogTitle>
              </DialogHeader>
              <LocationForm
                location={location}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.adminLocations] });
                }}
              />
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0 rounded-[10px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
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
                  Standort löschen?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
                  "{location.name}" und alle zugehörigen Courts werden unwiderruflich gelöscht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2.5">
                <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                  Abbrechen
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteLocationMutation.mutate(location.id)}
                  className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
                >
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Court Price Dialog */}
      {priceDialogCourt && (
        <CourtPriceDialog
          court={priceDialogCourt}
          locationName={location.name}
          open={!!priceDialogCourt}
          onOpenChange={(open) => !open && setPriceDialogCourt(null)}
        />
      )}
    </Card>
  );
}
