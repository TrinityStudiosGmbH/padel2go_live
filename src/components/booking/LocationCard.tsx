import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import {
  MapPin,
  Clock,
  ArrowRight,
  Trophy,
  Brain,
  ShoppingCart,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import type { DbLocation } from "@/types/database";
import { StorageImage } from "@/components/StorageImage";
import { WhatsAppGroupButton } from "@/components/WhatsAppBusiness";

interface LocationCardProps {
  location: DbLocation;
  todayFreeSlots: number;
  occupancyPercent: number;
  index?: number;
  minPriceCents?: number | null;
  /** Padel-Courts — die Karte spricht in erster Linie von Padel. */
  courtCount?: number;
  /** > 0 blendet den Chip „Auch Tennis" ein. */
  tennisCourtCount?: number;
}

export function LocationCard({ location, todayFreeSlots, occupancyPercent, index = 0, minPriceCents, courtCount, tennisCourtCount = 0 }: LocationCardProps) {
  const { t } = useTranslation("booking");
  const hasTennis = tennisCourtCount > 0;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName = dayNames[new Date().getDay()];
  const hours = location.opening_hours_json?.[todayName];

  // Format price for display (simple integer for compact badges)
  const formatPriceShort = (cents: number) => (cents / 100).toFixed(0);

  // Ampel-Status aus Auslastung (frei / mittel / voll)
  const busy = occupancyPercent >= 75;
  const mid = occupancyPercent >= 55 && !busy;
  const status = {
    label: busy ? "Fast ausgebucht" : mid ? "Gut gebucht" : "Verfügbar",
    textColor: busy ? "hsl(0 72% 70%)" : mid ? "hsl(45 90% 65%)" : "hsl(var(--primary))",
    accentColor: busy ? "hsl(0 72% 55%)" : mid ? "hsl(45 90% 55%)" : "hsl(var(--primary))",
    borderColor: busy ? "hsl(0 72% 55% / 0.4)" : mid ? "hsl(45 90% 55% / 0.4)" : "hsl(var(--primary) / 0.4)",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group flex flex-col rounded-2xl border border-border/60 bg-gradient-card overflow-hidden hover:border-primary/30 transition-all"
    >
      {/* Hero-Bild + Overlays */}
      <div className="relative">
        {location.main_image_url ? (
          <StorageImage
            src={location.main_image_url}
            renderWidth={800}
            alt={location.name}
            className="block w-full h-[168px] object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-[168px] bg-gradient-to-br from-primary/20 via-secondary to-muted flex items-center justify-center">
            <MapPin className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}

        {/* Scrim */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 30%, hsl(0 0% 4%))" }}
        />

        {/* Status-Badge (Ampel) oben-links */}
        <span
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-xs font-semibold whitespace-nowrap backdrop-blur-md"
          style={{
            color: status.textColor,
            background: "hsl(0 0% 0% / 0.72)",
            border: `1px solid ${status.borderColor}`,
          }}
        >
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full ${busy ? "" : "animate-pulse-glow"}`}
            style={{ background: status.accentColor }}
          />
          {status.label}
        </span>

        {/* Preis-Badge oben-rechts */}
        {minPriceCents && (
          <span
            className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-[11px] py-[5px] font-stat text-xs font-bold text-foreground whitespace-nowrap backdrop-blur-md"
            style={{ background: "hsl(0 0% 0% / 0.72)", border: "1px solid hsl(0 0% 100% / 0.15)" }}
          >
            {t("locationCard.fromPrice", { price: formatPriceShort(minPriceCents) })}/h
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-[13px] px-5 pt-[18px] pb-5">
        <div className="flex flex-col gap-[5px]">
          <h3 className="text-[19.5px] font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
            {location.name}
          </h3>
          {(location.city || !!courtCount) && (
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground min-w-0">
              <MapPin className="w-[13px] h-[13px] shrink-0" />
              <span className="truncate">
                {location.city}
                {location.city && !!courtCount ? " · " : ""}
                {!!courtCount && (
                  <>
                    <span className="font-stat">{courtCount}</span>{" "}
                    {hasTennis ? t("locationCard.padelCourts") : t("locationCard.courts")}
                  </>
                )}
              </span>
            </span>
          )}
        </div>

        {/* Feature-Chips */}
        {(location.rewards_enabled || location.ai_analysis_enabled || location.vending_enabled || hasTennis) && (
          <div className="flex flex-wrap gap-[7px]">
            {location.rewards_enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/5 px-2.5 py-1 text-xs font-semibold text-[hsl(0_0%_75%)]">
                <Trophy className="w-3 h-3" /> P2G Rewards
              </span>
            )}
            {location.ai_analysis_enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/5 px-2.5 py-1 text-xs font-semibold text-[hsl(0_0%_75%)]">
                <Brain className="w-3 h-3" /> KI-Analyse
              </span>
            )}
            {location.vending_enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/5 px-2.5 py-1 text-xs font-semibold text-[hsl(0_0%_75%)]">
                <ShoppingCart className="w-3 h-3" /> {t("locationCard.vending")}
              </span>
            )}
            {hasTennis && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/5 px-2.5 py-1 text-xs font-semibold text-[hsl(0_0%_75%)]">
                <CircleDot className="w-3 h-3" /> {t("locationCard.tennis")}
              </span>
            )}
          </div>
        )}

        {/* Auslastung heute + Balken */}
        <div className="flex flex-col gap-1.5" title={t("locationCard.occupancy", { percent: occupancyPercent })}>
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] text-[hsl(0_0%_55%)]">Auslastung heute</span>
            <span className="font-stat text-xs font-bold" style={{ color: status.accentColor }}>
              {t("locationCard.today")} {t("locationCard.slots", { count: todayFreeSlots })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(0_0%_12%)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${occupancyPercent}%`, background: status.accentColor }}
            />
          </div>
        </div>

        {/* Footer: Öffnungszeiten + Auswählen */}
        <div className="mt-auto flex items-center justify-between gap-2.5 pt-1">
          <span className="inline-flex items-center gap-1.5 font-stat text-xs text-muted-foreground min-w-0">
            <Clock className="w-[13px] h-[13px] shrink-0" />
            <span className="truncate">
              {hours ? t("locationCard.hoursRange", { open: hours.open, close: hours.close }) : t("locationCard.closed")}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {location.whatsapp_group_url && (
              <WhatsAppGroupButton
                href={location.whatsapp_group_url}
                label={t("locationCard.whatsapp")}
                compact
              />
            )}
            <Button variant="lime" size="sm" className="group/btn shrink-0" asChild>
              <NavLink to={`/booking/locations/${location.slug}`}>
                {t("locationCard.select")}
                <ArrowRight className="w-[15px] h-[15px] group-hover/btn:translate-x-1 transition-transform" />
              </NavLink>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
