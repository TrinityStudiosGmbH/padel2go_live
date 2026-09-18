import { Loader2, CheckCircle, Users, AlertTriangle, Zap, MapPin, LayoutGrid, Calendar, Clock, Hourglass, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import type { Court, TimeSlot } from "./types";
import type { DbLocation } from "@/types/database";
import type { LobbySettings } from "@/types/lobby";
import { formatPrice } from "@/lib/pricing";

interface BookingSummaryProps {
  location: DbLocation;
  courts: Court[];
  selectedCourt: string | null;
  selectedDate: Date;
  selectedDuration: number;
  selectedSlot: TimeSlot | null;
  booking: boolean;
  user: any;
  onBook: () => void;
  priceCents: number | null;
  /** Punkte, die diese Buchung einbringt. 0 = keine (Tennis oder Gratisbuchung). */
  paybackPoints?: number;
  hasPrices?: boolean;
  // Lobby settings
  lobbyEnabled?: boolean;
  onLobbyEnabledChange?: (enabled: boolean) => void;
  lobbySettings?: LobbySettings;
  onLobbySettingsChange?: (settings: LobbySettings) => void;
  userSkillLevel?: number;
  // Feature toggle
  lobbiesFeatureEnabled?: boolean;
}

export function BookingSummary({
  location,
  courts,
  selectedCourt,
  selectedDate,
  selectedDuration,
  selectedSlot,
  booking,
  user,
  onBook,
  priceCents,
  paybackPoints = 0,
  hasPrices = true,
  lobbyEnabled = false,
  onLobbyEnabledChange,
  lobbySettings,
  onLobbySettingsChange,
  userSkillLevel = 5,
  lobbiesFeatureEnabled = false,
}: BookingSummaryProps) {
  const { t, i18n } = useTranslation("booking");
  const dateLocale = i18n.language === "en" ? enUS : de;

  const infoRow = "flex items-center gap-2.5";
  const infoIcon = "w-[15px] h-[15px] text-primary shrink-0";
  const infoText = "text-sm text-[hsl(0_0%_85%)] min-w-0 truncate";

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-6 sticky top-[90px] flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-foreground">{t("summary.title")}</h2>
        <span className="inline-flex items-center gap-1.5 font-stat text-[11px] text-primary">
          <span className="w-[7px] h-[7px] rounded-full bg-primary animate-pulse-glow" />
          LIVE
        </span>
      </div>

      {/* Info box */}
      <div className="flex flex-col gap-2.5 p-3.5 bg-white/[0.03] border border-[hsl(0_0%_13%)] rounded-[14px]">
        <div className={infoRow}>
          <MapPin className={infoIcon} />
          <span className="sr-only">{t("summary.location")}</span>
          <span className={infoText}>{location.name}</span>
        </div>
        <div className={infoRow}>
          <LayoutGrid className={infoIcon} />
          <span className="sr-only">{t("summary.court")}</span>
          <span className={infoText}>{courts.find((c) => c.id === selectedCourt)?.name || "-"}</span>
        </div>
        <div className={infoRow}>
          <Calendar className={infoIcon} />
          <span className="sr-only">{t("summary.date")}</span>
          <span className={infoText}>{format(selectedDate, "dd.MM.yyyy", { locale: dateLocale })}</span>
        </div>
        <div className={infoRow}>
          <Hourglass className={infoIcon} />
          <span className="sr-only">{t("summary.duration")}</span>
          <span className={infoText}>{t("summary.durationMinutes", { count: selectedDuration })}</span>
        </div>
        <div className={infoRow}>
          <Clock className={infoIcon} />
          <span className="sr-only">{t("summary.time")}</span>
          <span className={`font-stat text-[13.5px] text-[hsl(0_0%_85%)] min-w-0 truncate`}>
            {selectedSlot ? `${selectedSlot.time}${t("summary.timeSuffix")}` : "-"}
          </span>
        </div>
      </div>

      {/* Lobby Toggle Section */}
      {user && selectedSlot && onLobbyEnabledChange && onLobbySettingsChange && lobbySettings && (
        <div className="rounded-[14px] bg-white/[0.03] border border-[hsl(0_0%_13%)] p-3.5">
          <label className={`flex items-center gap-3 ${lobbiesFeatureEnabled ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <Users className={`w-[17px] h-[17px] shrink-0 ${lobbiesFeatureEnabled ? "text-primary" : "text-muted-foreground"}`} />
            <span className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className={`text-[13.5px] font-semibold ${!lobbiesFeatureEnabled ? "text-muted-foreground" : "text-foreground"}`}>
                  {t("summary.openAsLobby")}
                </span>
                {!lobbiesFeatureEnabled && (
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {t("summary.comingSoonBadge")}
                  </span>
                )}
              </span>
              <span className="text-xs text-[hsl(0_0%_55%)]">
                {lobbiesFeatureEnabled ? t("summary.lobbyDescEnabled") : t("summary.lobbyDescDisabled")}
              </span>
            </span>
            <Switch
              checked={lobbiesFeatureEnabled ? lobbyEnabled : false}
              onCheckedChange={lobbiesFeatureEnabled ? onLobbyEnabledChange : undefined}
              disabled={!lobbiesFeatureEnabled}
              className={!lobbiesFeatureEnabled ? "opacity-50" : ""}
            />
          </label>

          {lobbiesFeatureEnabled && lobbyEnabled && (
            <div className="mt-4 space-y-4 p-4 bg-muted/50 rounded-lg">
              {/* Player Count */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">{t("summary.playerCount")}</label>
                <Select
                  value={lobbySettings.capacity.toString()}
                  onValueChange={(v) =>
                    onLobbySettingsChange({
                      ...lobbySettings,
                      capacity: Number(v) as 2 | 4,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">{t("summary.singlesOption")}</SelectItem>
                    <SelectItem value="4">{t("summary.doublesOption")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Skill Range Display */}
              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="text-muted-foreground">
                  {t("summary.skillRange", { min: lobbySettings.skillRange[0], max: lobbySettings.skillRange[1] })}
                </span>
                <span className="text-xs text-muted-foreground/70">{t("summary.skillRangeHint")}</span>
              </div>

              {/* Public Toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-muted-foreground">{t("summary.publicVisible")}</span>
                <Switch
                  checked={lobbySettings.isPublic}
                  onCheckedChange={(checked) =>
                    onLobbySettingsChange({
                      ...lobbySettings,
                      isPublic: checked,
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Price Display */}
      {!hasPrices ? (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-400">{t("summary.noPricesConfigured")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="h-px bg-[hsl(0_0%_13%)]" />
          <div className="flex justify-between items-baseline">
            <span className="text-[14.5px] font-bold text-foreground">{t("summary.totalPrice")}</span>
            <span className="flex flex-col items-end">
              <span className="font-stat font-bold text-3xl text-primary leading-[1.1]">
                {formatPrice(priceCents!, "EUR")}
              </span>
              <span className="text-[11px] text-[hsl(0_0%_50%)]">inkl. MwSt.</span>
            </span>
          </div>
          {paybackPoints > 0 && (
            <div className="flex items-center justify-between rounded-[10px] border border-primary/25 bg-primary/[0.06] px-3 py-2">
              <span className="text-[12.5px] text-[hsl(0_0%_62%)]">Du sammelst</span>
              <span className="font-stat text-[13px] font-bold text-primary">
                +{paybackPoints.toLocaleString("de-DE")} Punkte
              </span>
            </div>
          )}
        </div>
      )}

      {selectedSlot && (
        <div className="bg-primary/[0.06] border border-primary/25 rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-primary mb-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">{t("summary.slotAvailable")}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedSlot.courtName} • {format(selectedDate, "dd.MM.", { locale: dateLocale })} • {selectedSlot.time}
            {t("summary.timeSuffix")}
          </p>
        </div>
      )}

      <Button
        onClick={onBook}
        disabled={!selectedSlot || booking || !hasPrices}
        variant="hero"
        className="w-full"
        size="xl"
      >
        {booking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {t("summary.booking")}
          </>
        ) : (
          <>
            <Zap className="w-[17px] h-[17px] mr-1.5" />
            {t("summary.bookNow")}
          </>
        )}
      </Button>

      {!user && (
        <div className="flex items-start gap-2.5 bg-primary/[0.06] border border-primary/25 rounded-[14px] px-3.5 py-3">
          <UserCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[12.5px] leading-[1.55] text-[hsl(0_0%_75%)]">
            {t("summary.guestNote.intro")}
            <a href="/auth" className="text-primary hover:underline">
              {t("summary.guestNote.login")}
            </a>
            {t("summary.guestNote.outro")}
          </p>
        </div>
      )}
    </div>
  );
}
