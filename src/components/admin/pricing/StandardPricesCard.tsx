import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useGlobalPrices, useUpsertGlobalPrices } from "@/hooks/useCourtPrices";
import { SPORT_LABEL, type CourtSport } from "@/components/admin/courts/types";

/** Tennis ist nur als 60-Minuten-Buchung moeglich. */
const DURATIONS: Record<CourtSport, number[]> = {
  padel: [60, 90, 120],
  tennis: [60],
};

const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";

const centsToInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");

const parseEuro = (raw: string): number | null => {
  const value = raw.trim().replace(",", ".");
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
};

/**
 * Die globalen Standardpreise. Sie gelten an allen Standorten; Abweichungen
 * legt der Admin darunter als Ausnahme an.
 */
export function StandardPricesCard() {
  const { data: prices = [], isLoading } = useGlobalPrices();
  const upsert = useUpsertGlobalPrices();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (prices.length === 0) return;
    const next: Record<string, string> = {};
    for (const row of prices) next[`${row.sport}-${row.duration_minutes}`] = centsToInput(row.price_cents);
    setDraft(next);
  }, [prices]);

  const save = () => {
    const rows: Array<{ sport: CourtSport; duration_minutes: number; price_cents: number }> = [];
    for (const sport of Object.keys(DURATIONS) as CourtSport[]) {
      for (const duration of DURATIONS[sport]) {
        const cents = parseEuro(draft[`${sport}-${duration}`] ?? "");
        if (cents === null) {
          toast.error(`Preis für ${SPORT_LABEL[sport]} ${duration} Min. ist ungültig`, {
            description: "Bitte einen Betrag ab 0,00 € eintragen.",
          });
          return;
        }
        rows.push({ sport, duration_minutes: duration, price_cents: cents });
      }
    }
    upsert.mutate(rows);
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
            <Globe className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Standardpreise
            </h2>
            <span className="text-[13px] leading-normal text-muted-foreground">
              Gelten an allen Standorten. Abweichungen trägst du unten als Ausnahme ein.
            </span>
          </div>
        </div>

        {(Object.keys(DURATIONS) as CourtSport[]).map((sport) => (
          <div key={sport} className="flex flex-col gap-[9px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_58%)]">
              {SPORT_LABEL[sport]}
            </span>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3">
              {DURATIONS[sport].map((duration) => (
                <div key={duration} className="flex flex-col gap-[7px]">
                  <Label className={FIELD_LABEL}>{duration} Min.</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      value={draft[`${sport}-${duration}`] ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [`${sport}-${duration}`]: e.target.value }))
                      }
                      placeholder="0,00"
                      className="h-[42px] min-w-0 flex-1 rounded-[11px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[15px] font-bold"
                    />
                    <span className="flex-none text-muted-foreground">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          onClick={save}
          disabled={upsert.isPending}
          className="h-[42px] w-fit gap-2 rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90"
        >
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Standardpreise speichern
        </Button>
      </div>
    </Card>
  );
}
