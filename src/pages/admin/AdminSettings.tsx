import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, AlertTriangle, Eraser, RefreshCw, CheckCircle2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { MailTestPanel } from "@/components/admin/settings/MailTestPanel";

type PreviewTable = {
  table: string;
  label: string;
  mode: "delete" | "reset";
  count: number;
  available: boolean;
  error: string | null;
};

type PreviewCategory = {
  key: string;
  label: string;
  hint: string;
  total: number;
  tables: PreviewTable[];
};

type ResetRow = {
  category: string;
  table: string;
  label: string;
  mode: string;
  rows: number;
};

type ResetResult = {
  total_rows: number;
  results: ResetRow[];
  errors: { table: string; message: string }[];
  message: string;
};

const LOCKS = [
  {
    key: "pin_lock_vereine" as const,
    label: 'Sperre für „Für Vereine"',
    hint: "PIN-Eingabe für /fuer-vereine erforderlich",
  },
  {
    key: "pin_lock_partner" as const,
    label: 'Sperre für „Für Partner"',
    hint: "PIN-Eingabe für /fuer-partner erforderlich",
  },
];

export default function AdminSettings() {
  const { settings, isLoading, isSaving, updateSetting } = useSiteSettings();

  const [preview, setPreview] = useState<PreviewCategory[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmText, setConfirmText] = useState("");
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const { data: launchState } = useQuery({
    queryKey: ["admin-settings-app-launched"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("feature_app_launched")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const appLaunched = launchState?.feature_app_launched === true;

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "launch_reset_preview" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.categories as PreviewCategory[];
    },
    onSuccess: (categories) => {
      setPreview(categories);
      // Everything starts unchecked — each category has to be enabled deliberately.
      setSelected({});
    },
    onError: (error: Error) => toast.error("Vorschau fehlgeschlagen: " + error.message),
  });

  const executeMutation = useMutation({
    mutationFn: async (categories: string[]) => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "launch_reset_execute", categories, confirmPhrase: "RESET" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ResetResult;
    },
    onSuccess: (data) => {
      setResetResult(data);
      setConfirmText("");
      setSelected({});
      if (data.errors.length > 0) toast.warning(data.message);
      else toast.success(data.message);
      previewMutation.mutate();
    },
    onError: (error: Error) => toast.error("Reset fehlgeschlagen: " + error.message),
  });

  const selectedKeys = Object.keys(selected).filter((key) => selected[key]);
  const selectedRows = (preview ?? [])
    .filter((cat) => selected[cat.key])
    .reduce((sum, cat) => sum + cat.total, 0);
  const canExecute =
    confirmText === "RESET" && selectedKeys.length > 0 && !executeMutation.isPending;

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="text-sm text-muted-foreground">
          PIN-Sperren der B2B-Seiten, E-Mail-Test und Launch-Reset zum Bereinigen der Testdaten vor
          dem Go-Live.
        </p>

        {/* Inhalts-Sperre — echtes Backend (site_settings) */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                  <Lock className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display text-base font-bold tracking-tight text-foreground">
                    Inhalts-Sperre
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    B2B-Seiten für nicht autorisierte Besucher sperren (PIN erforderlich).
                  </span>
                </div>
              </div>
              <span className="inline-flex flex-none items-center gap-[7px] whitespace-nowrap rounded-full border border-primary/[0.28] bg-primary/[0.09] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
                <span className="h-[5px] w-[5px] rounded-full bg-primary" />
                Persistiert
              </span>
            </div>

            <div className="flex flex-col gap-[11px]">
              {LOCKS.map((lock) => (
                <div
                  key={lock.key}
                  className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] p-[15px]"
                >
                  <div className="flex min-w-[180px] flex-1 flex-col gap-[3px]">
                    <Label className="text-sm font-bold text-foreground">{lock.label}</Label>
                    <span className="text-xs text-muted-foreground">{lock.hint}</span>
                    <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground/70">
                      site_settings.{lock.key}
                    </span>
                  </div>
                  <Switch
                    checked={settings?.[lock.key] ?? true}
                    onCheckedChange={(checked) => updateSetting(lock.key, checked)}
                    disabled={isLoading || isSaving}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
              <AlertTriangle className="mt-0.5 h-[15px] w-[15px] flex-none text-[#FFC44D]" />
              <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
                Beim Aktivieren einer Sperre werden{" "}
                <span className="font-semibold text-foreground">alle bisherigen Entsperrungen ungültig</span> —
                Besucher müssen die PIN erneut eingeben.
              </span>
            </div>
          </div>
        </Card>

        {/* E-Mail-Test — jede ausgehende Mail mit Beispieldaten verschicken */}
        <MailTestPanel />

        {/* Launch-Reset — löscht Testdaten, Stammdaten und Inhalte bleiben */}
        <Card className="rounded-2xl border-[hsl(0_100%_71%/0.26)] bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
                  <Eraser className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display text-base font-bold tracking-tight text-foreground">
                    Launch-Reset
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    Testdaten vor dem Go-Live entfernen.
                  </span>
                </div>
              </div>
              <span className="inline-flex flex-none items-center gap-[7px] whitespace-nowrap rounded-full border border-[hsl(0_100%_71%/0.28)] bg-[hsl(0_100%_71%/0.09)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#FF6B6B]">
                <span className="h-[5px] w-[5px] rounded-full bg-[#FF6B6B]" />
                Unwiderruflich
              </span>
            </div>

            <p className="text-[12.5px] leading-relaxed text-[hsl(0_0%_74%)]">
              Löscht angesammelte Testdaten — Buchungen, Bestellungen, Punkte, Belege, Social-Daten,
              Event-Anmeldungen und Logs. <span className="font-semibold text-foreground">Stammdaten,
              Inhalte und Benutzer bleiben unangetastet</span>: Plätze, Standorte, Preise, Vereine,
              Shop-Produkte, News-Artikel, Events, Konfigurationen, Profile und Newsletter-Empfänger.
              Wallets werden nicht gelöscht, sondern auf 0 gesetzt.
            </p>

            {appLaunched && (
              <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] px-[15px] py-[13px]">
                <AlertTriangle className="mt-0.5 h-[15px] w-[15px] flex-none text-[#FF6B6B]" />
                <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_80%)]">
                  <span className="font-semibold text-foreground">
                    Plattform ist bereits gelauncht
                  </span>{" "}
                  — hier fallen echte Kundendaten! Nur ausführen, wenn du dir absolut sicher bist.
                  <span className="ml-1.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground/70">
                    site_settings.feature_app_launched
                  </span>
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="h-[38px] rounded-[11px] border border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13px] font-bold text-foreground hover:bg-white/10"
              >
                <RefreshCw
                  className={`mr-2 h-[15px] w-[15px] ${previewMutation.isPending ? "animate-spin" : ""}`}
                />
                {preview ? "Vorschau aktualisieren" : "Vorschau laden"}
              </Button>
              {preview && (
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
                  {selectedKeys.length} von {preview.length} Kategorien ·{" "}
                  <span className="font-bold text-foreground">{selectedRows}</span> Zeilen ausgewählt
                </span>
              )}
            </div>

            {preview && (
              <div className="flex flex-col gap-[11px]">
                {preview.map((cat) => (
                  <div
                    key={cat.key}
                    className={`flex flex-col gap-2.5 rounded-[14px] border p-[15px] ${
                      selected[cat.key]
                        ? "border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.05)]"
                        : "border-[hsl(0_0%_12%)] bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3.5">
                      <Checkbox
                        id={`launch-reset-${cat.key}`}
                        checked={selected[cat.key] ?? false}
                        onCheckedChange={(checked) =>
                          setSelected((prev) => ({ ...prev, [cat.key]: checked === true }))
                        }
                        className="mt-0.5 border-[hsl(0_0%_32%)] data-[state=checked]:border-[#FF6B6B] data-[state=checked]:bg-[#FF6B6B] data-[state=checked]:text-[#0A0A0A]"
                      />
                      <div className="flex min-w-[180px] flex-1 flex-col gap-[3px]">
                        <Label
                          htmlFor={`launch-reset-${cat.key}`}
                          className="cursor-pointer text-sm font-bold text-foreground"
                        >
                          {cat.label}
                        </Label>
                        <span className="text-xs leading-snug text-muted-foreground">{cat.hint}</span>
                      </div>
                      <span className="flex-none rounded-full border border-[hsl(0_0%_16%)] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold tracking-[0.06em] text-foreground">
                        {cat.total}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-[28px]">
                      {cat.tables.map((t) => (
                        <span
                          key={t.table}
                          className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground/80"
                        >
                          <span
                            className={`h-1 w-1 flex-none rounded-full ${
                              t.available ? "bg-[hsl(0_0%_32%)]" : "bg-[#FFC44D]"
                            }`}
                          />
                          {t.table}
                          <span className="font-bold text-[hsl(0_0%_74%)]">
                            {t.available ? t.count : "n/a"}
                          </span>
                          {t.mode === "reset" && (
                            <span className="text-[9.5px] uppercase tracking-[0.1em] text-[#FFC44D]">
                              reset
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                <label className="flex flex-col gap-[7px]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Gib RESET ein, um zu bestätigen<span className="text-[#FF6B6B]"> *</span>
                  </span>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESET"
                    className="h-[42px] max-w-[240px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/[0.04] font-mono text-sm font-bold tracking-[0.12em] focus-visible:border-[#FF6B6B] focus-visible:ring-0"
                  />
                </label>

                <Button
                  onClick={() => executeMutation.mutate(selectedKeys)}
                  disabled={!canExecute}
                  className="h-[42px] w-fit rounded-[11px] bg-[#FF6B6B] px-[19px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585] disabled:bg-[hsl(0_0%_14%)] disabled:text-[hsl(0_0%_45%)] disabled:opacity-100"
                >
                  {executeMutation.isPending
                    ? "Bereinige..."
                    : `${selectedKeys.length} Kategorie${selectedKeys.length === 1 ? "" : "n"} zurücksetzen`}
                </Button>
              </div>
            )}

            {resetResult && (
              <div className="flex flex-col gap-[9px] rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] p-[15px]">
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                  <CheckCircle2 className="h-[13px] w-[13px]" />
                  Bereinigt — {resetResult.total_rows} Zeilen
                </span>
                {resetResult.results.map((row) => (
                  <span
                    key={`${row.category}-${row.table}`}
                    className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground"
                  >
                    <span className="h-1 w-1 flex-none rounded-full bg-[hsl(0_0%_32%)]" />
                    {row.table}
                    <span className="font-bold text-foreground">{row.rows}</span>
                    <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
                      {row.mode === "reset" ? "zurückgesetzt" : "gelöscht"}
                    </span>
                  </span>
                ))}
                {resetResult.errors.map((err) => (
                  <span
                    key={err.table}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-[#FFC44D]"
                  >
                    <AlertTriangle className="h-[13px] w-[13px] flex-none" />
                    <span className="font-mono font-bold">{err.table}</span>
                    <span className="text-[hsl(0_0%_70%)]">{err.message}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
