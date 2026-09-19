import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Coins, Gift, Info, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
const INPUT_CLASS =
  "h-[42px] rounded-[11px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[15px] font-bold";
const SAVE_BUTTON =
  "h-[42px] w-fit gap-2 rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90";

/**
 * Punkte verdienen (feste Zahl je 60 Minuten) und Punkte einloesen
 * (Umrechenkurs) in einer Karte. Die beiden Kurse werden leicht verwechselt,
 * deshalb stehen sie hier klar getrennt und mit einer Beispielrechnung.
 */
export function PointsSettingsCard() {
  const [points60, setPoints60] = useState(100);
  const [creditsPerEuro, setCreditsPerEuro] = useState(100);
  const [maxPercent, setMaxPercent] = useState(50);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "payback_points_60min, credits_per_euro, credits_payment_max_percent, feature_credits_payment_enabled",
        )
        .eq("id", "global")
        .maybeSingle();
      if (error) {
        toast.error("Punkte-Einstellungen konnten nicht geladen werden");
      } else if (data) {
        const d = data as any;
        setPoints60(Number(d.payback_points_60min ?? 100));
        setCreditsPerEuro(Number(d.credits_per_euro ?? 100));
        setMaxPercent(Number(d.credits_payment_max_percent ?? 50));
        setPaymentEnabled(Boolean(d.feature_credits_payment_enabled));
      }
      setIsLoading(false);
    })();
  }, []);

  const togglePayment = async (enabled: boolean) => {
    setIsToggling(true);
    const { error } = await supabase
      .from("site_settings")
      .update({ feature_credits_payment_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", "global");
    if (error) toast.error("Fehler beim Speichern");
    else {
      setPaymentEnabled(enabled);
      toast.success(enabled ? "Punkte-Zahlung aktiviert" : "Punkte-Zahlung deaktiviert");
    }
    setIsToggling(false);
  };

  const save = async () => {
    if (points60 < 0) {
      toast.error("Punkte pro 60 Minuten dürfen nicht negativ sein");
      return;
    }
    if (creditsPerEuro < 1) {
      toast.error("Punkte für 1 € müssen mindestens 1 sein");
      return;
    }
    if (maxPercent < 1 || maxPercent > 100) {
      toast.error("Maximaler Anteil muss zwischen 1 und 100 liegen");
      return;
    }
    setIsSaving(true);
    const { error } = await (supabase as any)
      .from("site_settings")
      .update({
        payback_points_60min: Math.round(points60),
        credits_per_euro: Math.round(creditsPerEuro),
        credits_payment_max_percent: Math.round(maxPercent),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "global");
    if (error) toast.error("Fehler beim Speichern", { description: error.message });
    else toast.success("Punkte-Einstellungen gespeichert");
    setIsSaving(false);
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

  const points90 = Math.round(points60 * 1.5);
  const points120 = points60 * 2;
  const euroPer60 = creditsPerEuro > 0 ? points60 / creditsPerEuro : 0;
  // Beispiel an einem 100-Euro-Produkt, damit der Prozentsatz greifbar wird.
  const examplePct = Math.min(100, Math.max(0, maxPercent || 0));
  const exampleEuro = (100 * examplePct) / 100;
  const examplePoints = Math.round(exampleEuro * creditsPerEuro);
  const rateLooksWrong = creditsPerEuro > 1000;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-[18px]">
      {/* Verdienen */}
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex flex-col gap-[18px]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
              <Coins className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                Punkte verdienen
              </h2>
              <span className="text-[13px] leading-normal text-muted-foreground">
                Feste Punktzahl je 60 Minuten. Gilt an allen Standorten.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label className={FIELD_LABEL}>
              Punkte pro 60 Minuten<span className="text-primary"> *</span>
            </Label>
            <Input
              type="number"
              min={0}
              value={points60 === 0 ? "" : points60}
              placeholder="0"
              onChange={(e) => setPoints60(Number(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-2">
            {[
              { label: "60 Minuten", value: points60, factor: "" },
              { label: "90 Minuten", value: points90, factor: "×1,5" },
              { label: "120 Minuten", value: points120, factor: "×2,0" },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-[11px]"
              >
                <span className="flex items-center gap-2 text-[13px] text-[hsl(0_0%_78%)]">
                  {row.label}
                  {row.factor && (
                    <span className="font-mono text-[10.5px] text-muted-foreground">{row.factor}</span>
                  )}
                </span>
                <span className="whitespace-nowrap font-mono text-[15px] font-bold text-primary">
                  +{row.value.toLocaleString("de-DE")}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
            <Info className="mt-0.5 h-4 w-4 flex-none text-[#FFC44D]" />
            <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
              Punkte gibt es nur für tatsächlich bezahlte Buchungen. Freistunden und vollständig
              eingelöste Gutscheine ergeben null Punkte. Tennis sammelt keine Punkte. Bei einer
              Stornierung wird automatisch zurückgebucht.
            </span>
          </div>

          <Button onClick={save} disabled={isSaving} className={SAVE_BUTTON}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Punkte-Einstellungen speichern
          </Button>
        </div>
      </Card>

      {/* Einlösen */}
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
                <Gift className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Punkte einlösen
                </h2>
                <span className="text-[13px] leading-normal text-muted-foreground">
                  Wechselkurs für Punkte als Zahlungsmittel.
                </span>
              </div>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {paymentEnabled ? "Aktiv" : "Inaktiv"}
              </span>
              <Switch checked={paymentEnabled} onCheckedChange={togglePayment} disabled={isToggling} />
              {isToggling && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
          </div>

          {!paymentEnabled && (
            <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#FFC44D]" />
              <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                Im Shop ist derzeit keine Punkte-Einlösung sichtbar: Punktestand-Banner,
                Produkthinweis und der Regler im Checkout sind ausgeblendet. Nutzer sammeln
                weiter Punkte, können sie aber nicht einsetzen.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-[7px]">
            <Label className={FIELD_LABEL}>
              Punkte für 1 €<span className="text-primary"> *</span>
            </Label>
            <Input
              type="number"
              min={1}
              value={creditsPerEuro === 0 ? "" : creditsPerEuro}
              placeholder="0"
              onChange={(e) => setCreditsPerEuro(Number(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label className={FIELD_LABEL}>
              Max. Anteil einer Zahlung (%)<span className="text-primary"> *</span>
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxPercent === 0 ? "" : maxPercent}
              placeholder="0"
              onChange={(e) => setMaxPercent(Number(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">
              Gilt für jedes Marketplace-Produkt. Die maximale Punktzahl je Produkt rechnet
              sich daraus automatisch — bei 100 € Warenwert sind das{" "}
              <span className="font-mono font-bold text-foreground">
                {examplePoints.toLocaleString("de-DE")} Punkte
              </span>{" "}
              ={" "}
              {exampleEuro.toLocaleString("de-DE", {
                style: "currency",
                currency: "EUR",
                minimumFractionDigits: 2,
              })}{" "}
              Rabatt.
            </span>
          </div>

          {rateLooksWrong && (
            <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#FFC44D]" />
              <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                Bei {creditsPerEuro.toLocaleString("de-DE")} Punkten je Euro ist ein Punkt weniger
                als ein Zehntelcent wert. Rabatte fallen damit praktisch auf null. Gemeint war
                vermutlich ein deutlich kleinerer Wert, etwa 100.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5 rounded-[15px] border border-primary/[0.26] bg-gradient-to-br from-primary/[0.09] to-primary/[0.02] px-[17px] py-[15px]">
            <span className="text-[13px] text-[hsl(0_0%_72%)]">Was eine 60-Minuten-Buchung bringt</span>
            <span className="font-mono text-[17px] font-bold text-primary">
              +{points60.toLocaleString("de-DE")} Punkte ={" "}
              {euroPer60.toLocaleString("de-DE", {
                style: "currency",
                currency: "EUR",
                minimumFractionDigits: 2,
              })}{" "}
              Rabatt
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
