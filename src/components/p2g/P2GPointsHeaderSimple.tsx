import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Trophy, Zap, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/p2g/AnimatedCounter";
import { NavLink } from "@/components/NavLink";
import type { P2GSummary } from "@/hooks/useP2GPoints";
import { usePointsValue } from "@/hooks/usePointsValue";
import { formatPrice } from "@/lib/pricing";

interface P2GPointsHeaderSimpleProps {
  summary: P2GSummary | undefined;
  isLoading: boolean;
}

/**
 * Punktestand und was er wert ist. Bewusst ohne Stufen: es zaehlt nur, wie viele
 * Punkte da sind und wie viel Rabatt das im Marketplace bedeutet.
 */
export function P2GPointsHeaderSimple({ summary, isLoading }: P2GPointsHeaderSimpleProps) {
  const { t } = useTranslation("p2g");
  const { centsPerPoint } = usePointsValue();

  const playCredits = summary?.play_credits ?? 0;
  const lifetimeCredits = summary?.lifetime_credits ?? 0;
  const valueCents = Math.floor(playCredits * centsPerPoint);
  const pointsPerEuro = centsPerPoint > 0 ? Math.round(100 / centsPerPoint) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 p-2">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            {t("p2gPointsHeaderSimple.title")}
          </h1>
          <p className="mt-1 text-muted-foreground">{t("p2gPointsHeaderSimple.subtitle")}</p>
        </div>

        <Button variant="lime" size="sm" asChild className="gap-2">
          <NavLink to="/marketplace">
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">{t("p2gPointsHeaderSimple.redeem")}</span>
          </NavLink>
        </Button>
      </div>

      {!isLoading && summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="relative overflow-hidden border border-primary/25">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent" />
            <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/20 opacity-20 blur-3xl" />

            <CardContent className="relative p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-primary/15 p-4">
                    <Zap className="h-10 w-10 text-primary" />
                  </div>
                  <div>
                    <span className="block text-sm text-muted-foreground">
                      {t("p2gPointsHeaderSimple.playCredits")}
                    </span>
                    <span className="font-stat text-4xl font-bold text-primary">
                      <AnimatedCounter value={playCredits} />
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-start md:justify-end">
                  <div className="rounded-xl border border-border/50 bg-background/50 p-4 backdrop-blur-sm">
                    <span className="block text-sm text-muted-foreground">
                      {t("p2gPointsHeaderSimple.discountValue")}
                    </span>
                    <span className="font-stat text-3xl font-bold text-foreground">
                      {formatPrice(valueCents, "EUR")}
                    </span>
                    {pointsPerEuro > 0 && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t("p2gPointsHeaderSimple.rate", { points: pointsPerEuro.toLocaleString("de-DE") })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {lifetimeCredits > 0 && (
                <div className="mt-6 rounded-xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground backdrop-blur-sm">
                  {t("p2gPointsHeaderSimple.lifetime", { count: lifetimeCredits.toLocaleString("de-DE") })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isLoading && (
        <Card className="border-0 bg-muted/20">
          <CardContent className="p-6">
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
