import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Eye, EyeOff, Save, CreditCard, Mail, Sparkles, Languages, Globe, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripeConfig {
  /** 'live' = echte Abrechnung, 'test' = Sandbox. Steuert die ganze Plattform. */
  mode: "live" | "test";
  secret_key: string;
  webhook_secret: string;
  publishable_key: string;
  has_secret_key: boolean;
  has_webhook_secret: boolean;
  test_secret_key: string;
  test_webhook_secret: string;
  test_publishable_key: string;
  has_test_secret_key: boolean;
  has_test_webhook_secret: boolean;
}

interface ResendConfig {
  api_key: string;
  has_api_key: boolean;
}

interface AppConfig {
  url: string;
}

interface AnthropicConfig {
  api_key: string;
  has_api_key: boolean;
}

interface DeeplConfig {
  api_key: string;
  has_api_key: boolean;
}


interface ServiceRow {
  service: string;
  config: Record<string, string | boolean>;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// get_integration_configs_masked() returns secret values as "••••" + last 4 chars.
const MASK_PREFIX = "••••";
const isMasked = (v: unknown): boolean =>
  typeof v === "string" && v.startsWith(MASK_PREFIX);

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10.5px] font-bold text-primary">
      <span className="h-[5px] w-[5px] rounded-full bg-primary" />
      Verbunden
    </span>
  ) : (
    <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] px-2.5 py-1 text-[10.5px] font-bold text-[#FF6B6B]">
      <span className="h-[5px] w-[5px] rounded-full bg-[#FF6B6B]" />
      Nicht konfiguriert
    </span>
  );
}

function SecretInput({
  label, value, onChange, placeholder, hint, warnHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  warnHint?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-[7px]">
      <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        <span className="tracking-[0.06em] text-muted-foreground/60"> · geheim</span>
      </Label>
      <div className="relative flex items-center">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Beim Speichern neu eingeben"}
          className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pr-11 font-mono text-[13px]"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:text-primary"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hint && (
        <p className={`text-[11px] leading-[1.45] ${warnHint ? "text-[#FFC44D]" : "text-muted-foreground"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminIntegrations() {
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  // Last loaded (masked) config per service — used on save to detect unchanged
  // fields and to carry over untouched plain values into the full-jsonb upsert.
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, Record<string, unknown>>>({});

  // Per-service form state (empty string = "don't change")
  const [stripe, setStripe] = useState<StripeConfig>({
    mode: "live",
    secret_key: "", webhook_secret: "", publishable_key: "",
    has_secret_key: false, has_webhook_secret: false,
    test_secret_key: "", test_webhook_secret: "", test_publishable_key: "",
    has_test_secret_key: false, has_test_webhook_secret: false,
  });
  const [resendState, setResendState] = useState<ResendConfig>({
    api_key: "", has_api_key: false,
  });
  const [appState, setAppState] = useState<AppConfig>({ url: "" });
  const [anthropicState, setAnthropicState] = useState<AnthropicConfig>({
    api_key: "",
    has_api_key: false,
  });
  const [deeplState, setDeeplState] = useState<DeeplConfig>({
    api_key: "",
    has_api_key: false,
  });

  // Masked preview ("••••" + letzte 4 Zeichen aus der RPC) als Input-Placeholder,
  // damit sichtbar ist, DASS und WELCHER Key hinterlegt ist. Reine Anzeige —
  // Speicher-/Maskierungs-Logik bleibt unberührt.
  const maskedPlaceholder = (service: string, key: string): string | undefined => {
    const v = originalConfigs[service]?.[key];
    if (!isMasked(v)) return undefined;
    const last4 = (v as string).slice(MASK_PREFIX.length);
    return last4 ? `${MASK_PREFIX}…${last4}` : MASK_PREFIX;
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadConfigs(); }, []);

  const loadConfigs = async () => {
    setIsLoading(true);
    // Direct SELECT on site_integration_configs is no longer allowed;
    // reads go through the masking RPC (secrets come back as "••••" + last4).
    const { data, error } = await (supabase.rpc as any)("get_integration_configs_masked");

    if (error || !data) {
      toast.error("Fehler beim Laden der Konfigurationen", { description: error?.message });
      setIsLoading(false);
      return;
    }

    const originals: Record<string, Record<string, unknown>> = {};
    for (const row of data as ServiceRow[]) {
      originals[row.service] = (row.config as Record<string, unknown>) ?? {};
    }
    setOriginalConfigs(originals);

    for (const row of data as ServiceRow[]) {
      const c = (row.config as Record<string, string>) ?? {};
      if (row.service === "stripe") {
        setStripe({
          mode: c.mode === "test" ? "test" : "live",
          secret_key: "",
          webhook_secret: "",
          publishable_key: c.publishable_key ?? "",
          has_secret_key: !!c.secret_key,
          has_webhook_secret: !!c.webhook_secret,
          test_secret_key: "",
          test_webhook_secret: "",
          test_publishable_key: c.test_publishable_key ?? "",
          has_test_secret_key: !!c.test_secret_key,
          has_test_webhook_secret: !!c.test_webhook_secret,
        });
      }
      if (row.service === "resend") {
        setResendState({
          api_key: "",
          has_api_key: !!c.api_key,
        });
      }
      if (row.service === "app") {
        setAppState({ url: c.url ?? "" });
      }
      if (row.service === "anthropic") {
        setAnthropicState({
          api_key: "",
          has_api_key: !!c.api_key,
        });
      }
      if (row.service === "deepl") {
        setDeeplState({
          api_key: "",
          has_api_key: !!c.api_key,
        });
      }
    }
    setIsLoading(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  // Secrets can no longer be read back from the browser (no SELECT policy;
  // reads are masked), and the upsert replaces the whole config jsonb. We
  // therefore: skip the upsert entirely when nothing changed, carry over
  // untouched plain (non-masked) values from the loaded config, and warn the
  // admin that secret fields which were not re-entered get cleared.
  /**
   * Speichert nur die Felder, die wirklich ausgefuellt wurden.
   *
   * Frueher schrieb das Formular die komplette Konfiguration neu. Geheime Werte
   * kommen aber maskiert aus der Datenbank und koennen nicht zurueckgeschrieben
   * werden — sie fehlten also beim Speichern und wurden geloescht. Wer nur den
   * Sandbox-Schluessel nachtragen wollte, verlor damit den Live-Schluessel.
   * merge_integration_config legt jetzt nur die uebergebenen Felder darueber.
   */
  const save = async (service: string, newConfig: Record<string, string>) => {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(newConfig)) {
      if (v === "" || v === null || v === undefined || isMasked(v)) continue;
      patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      toast.info("Keine Änderungen", {
        description: "Es wurde nichts eingegeben — bestehende Schlüssel bleiben erhalten.",
      });
      return;
    }

    setSaving(service);
    // Neue RPC, noch nicht in den generierten Typen -> Cast wie oben bei der Maskierung.
    let { error } = await (supabase.rpc as any)("merge_integration_config", {
      p_service: service,
      p_patch: patch,
    });

    // Solange die Migration noch nicht gelaufen ist, gibt es die Funktion nicht.
    // Dann der alte Weg, damit das Speichern nicht ausfaellt — mit dem alten
    // Nachteil, dass nicht neu eingegebene Geheimnisse dabei verloren gehen.
    if (error && /does not exist|PGRST202|schema cache/i.test(error.message ?? "")) {
      const original = originalConfigs[service] ?? {};
      const legacy: Record<string, string> = { ...patch };
      for (const [k, v] of Object.entries(original)) {
        if (k in legacy || isMasked(v)) continue;
        legacy[k] = String(v);
      }
      ({ error } = await (supabase.from as any)("site_integration_configs")
        .upsert({ service, config: legacy, updated_at: new Date().toISOString() }));
      if (!error) {
        toast.warning("Ohne Zusammenführen gespeichert", {
          description: "Die Datenbank-Migration fehlt noch. Nicht neu eingegebene geheime Werte wurden dabei entfernt.",
          duration: 10000,
        });
      }
    }
    setSaving(null);

    if (error) {
      toast.error("Fehler beim Speichern", { description: error.message });
      return;
    }
    toast.success("Gespeichert", {
      description: `${Object.keys(patch).length} Feld(er) aktualisiert. Nicht ausgefüllte Felder bleiben unverändert.`,
    });
    loadConfigs();
  };

  /** Der Modusschalter wirkt sofort und fasst keine Schluessel an. */
  const setStripeMode = async (next: "live" | "test") => {
    setSaving("stripe-mode");
    // Dieselbe neue RPC, ebenfalls noch ohne generierte Typen.
    const { error } = await (supabase.rpc as any)("merge_integration_config", {
      p_service: "stripe",
      p_patch: { mode: next },
    });
    setSaving(null);
    if (error) {
      const missing = /does not exist|PGRST202|schema cache/i.test(error.message ?? "");
      toast.error("Modus konnte nicht umgestellt werden", {
        description: missing
          ? "Die Datenbank-Migration für den Moduswechsel fehlt noch."
          : error.message,
      });
      return;
    }
    setStripe((p) => ({ ...p, mode: next }));
    toast.success(
      next === "test" ? "Testbetrieb aktiv — es fließt kein echtes Geld" : "Echtbetrieb aktiv — Zahlungen sind echt",
    );
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

  const saveButtonClass =
    "h-10 self-start rounded-[11px] bg-gradient-lime px-[18px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition hover:brightness-110";
  const fieldLabelClass = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
  const fieldInputClass = "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]";
  const fieldHintClass = "text-[11px] leading-[1.45] text-muted-foreground";

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="max-w-[720px] text-sm text-muted-foreground">
          API-Schlüssel und Konfiguration aller externen Dienste. Geheime Schlüssel werden serverseitig
          gespeichert und sind nach dem Speichern im Browser nicht mehr lesbar.
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))] items-start gap-[18px]">
          {/* ── Stripe ─────────────────────────────────────────────────────── */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
                    <CreditCard className="h-[17px] w-[17px]" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display text-base font-bold tracking-tight text-foreground">Stripe</span>
                    <span className="text-xs leading-snug text-muted-foreground">Zahlungsabwicklung für Courtbuchungen</span>
                  </div>
                </div>
                <StatusBadge configured={stripe.has_secret_key && stripe.has_webhook_secret} />
              </div>

              {/* Betriebsart — wirkt sofort und fuer die ganze Plattform */}
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[13px] border px-[15px] py-3.5 ${
                stripe.mode === "test"
                  ? "border-[hsl(41_100%_65%/0.35)] bg-[hsl(41_100%_65%/0.09)]"
                  : "border-primary/[0.26] bg-primary/[0.06]"
              }`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-bold text-foreground">
                    {stripe.mode === "test" ? "Testbetrieb (Sandbox)" : "Echtbetrieb"}
                  </span>
                  <span className="text-[12px] leading-relaxed text-muted-foreground">
                    {stripe.mode === "test"
                      ? "Alle Zahlungen laufen gegen die Sandbox. Es fließt kein echtes Geld, Testkarten wie 4242 4242 4242 4242 funktionieren."
                      : "Alle Zahlungen sind echt und werden abgerechnet."}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-2.5">
                  <span className="text-xs text-muted-foreground">Testbetrieb</span>
                  <Switch
                    checked={stripe.mode === "test"}
                    onCheckedChange={(on) => setStripeMode(on ? "test" : "live")}
                    disabled={saving === "stripe-mode"}
                  />
                  {saving === "stripe-mode" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </div>
              </div>

              {stripe.mode === "test" && (
                <div className="flex items-start gap-2.5 rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.08)] px-[15px] py-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[#FF6B6B]" />
                  <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_82%)]">
                    Solange der Testbetrieb läuft, kommt bei echten Kundenzahlungen kein Geld an.
                    Vor dem Start unbedingt zurück auf Echtbetrieb stellen. Belege aus dem Testbetrieb
                    tragen TEST-Nummern und werden beim Umschalten gelöscht — der Echtbetrieb beginnt
                    bei P2G-{new Date().getFullYear()}-000001.
                  </span>
                </div>
              )}

              {/* Echtbetrieb */}
              <div className="flex flex-col gap-[13px]">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_58%)]">
                  Echtbetrieb · Live-Schlüssel
                </span>
                <SecretInput
                  label="Secret Key"
                  value={stripe.secret_key}
                  onChange={(v) => setStripe(p => ({ ...p, secret_key: v }))}
                  placeholder={maskedPlaceholder("stripe", "secret_key")}
                  hint={stripe.has_secret_key ? "Hinterlegt. Leer lassen, um ihn zu behalten." : "sk_live_…"}
                />
                <SecretInput
                  label="Webhook Secret"
                  value={stripe.webhook_secret}
                  onChange={(v) => setStripe(p => ({ ...p, webhook_secret: v }))}
                  placeholder={maskedPlaceholder("stripe", "webhook_secret")}
                  hint={stripe.has_webhook_secret ? "Hinterlegt. Leer lassen, um es zu behalten." : "whsec_… aus dem Live-Webhook"}
                />
                <div className="flex flex-col gap-[7px]">
                  <Label className={fieldLabelClass}>
                    Publishable Key <span className="tracking-[0.06em] text-muted-foreground/60">(öffentlich)</span>
                  </Label>
                  <Input
                    value={stripe.publishable_key}
                    onChange={(e) => setStripe(p => ({ ...p, publishable_key: e.target.value }))}
                    placeholder="pk_live_…"
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
                  />
                </div>
              </div>

              {/* Testbetrieb */}
              <div className="flex flex-col gap-[13px] rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.02] p-[15px]">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_58%)]">
                  Testbetrieb · Sandbox-Schlüssel
                </span>
                <SecretInput
                  label="Test Secret Key"
                  value={stripe.test_secret_key}
                  onChange={(v) => setStripe(p => ({ ...p, test_secret_key: v }))}
                  placeholder={maskedPlaceholder("stripe", "test_secret_key")}
                  hint={stripe.has_test_secret_key ? "Hinterlegt. Leer lassen, um ihn zu behalten." : "sk_test_…"}
                />
                <SecretInput
                  label="Test Webhook Secret"
                  value={stripe.test_webhook_secret}
                  onChange={(v) => setStripe(p => ({ ...p, test_webhook_secret: v }))}
                  placeholder={maskedPlaceholder("stripe", "test_webhook_secret")}
                  hint={stripe.has_test_webhook_secret ? "Hinterlegt. Leer lassen, um es zu behalten." : "whsec_… aus dem Test-Webhook"}
                />
                <div className="flex flex-col gap-[7px]">
                  <Label className={fieldLabelClass}>
                    Test Publishable Key <span className="tracking-[0.06em] text-muted-foreground/60">(öffentlich)</span>
                  </Label>
                  <Input
                    value={stripe.test_publishable_key}
                    onChange={(e) => setStripe(p => ({ ...p, test_publishable_key: e.target.value }))}
                    placeholder="pk_test_…"
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
                  />
                </div>
              </div>

              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Der Webhook muss in beiden Stripe-Modi getrennt eingerichtet werden. Ziel ist jeweils{" "}
                <span className="font-mono text-[11px] text-foreground">
                  https://wvvdkuextsbsecqbfksb.supabase.co/functions/v1/stripe-webhook
                </span>
                . Jeder Modus hat sein eigenes Signaturgeheimnis.
              </p>

              <Button
                onClick={() => save("stripe", {
                  secret_key: stripe.secret_key,
                  webhook_secret: stripe.webhook_secret,
                  publishable_key: stripe.publishable_key,
                  test_secret_key: stripe.test_secret_key,
                  test_webhook_secret: stripe.test_webhook_secret,
                  test_publishable_key: stripe.test_publishable_key,
                })}
                disabled={saving === "stripe"}
                className={saveButtonClass}
              >
                {saving === "stripe" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </Card>

          {/* ── Resend ─────────────────────────────────────────────────────── */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-primary/30 bg-primary/10 text-primary">
                    <Mail className="h-[17px] w-[17px]" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display text-base font-bold tracking-tight text-foreground">Resend</span>
                    <span className="text-xs leading-snug text-muted-foreground">Buchungsbestätigungen, Einladungen und Kontaktmails</span>
                  </div>
                </div>
                <StatusBadge configured={resendState.has_api_key} />
              </div>
              <div className="flex flex-col gap-[13px]">
                <SecretInput
                  label="API Key"
                  value={resendState.api_key}
                  onChange={(v) => setResendState(p => ({ ...p, api_key: v }))}
                  placeholder={maskedPlaceholder("resend", "api_key")}
                  hint={resendState.has_api_key ? "••• API-Key hinterlegt" : "re_..."}
                />
                <p className={fieldHintClass}>
                  Versand läuft zentral über <strong className="font-semibold text-foreground">contact@padel2go.eu</strong>{" "}
                  (in Resend verifizierte Domain, Kunden können direkt antworten). Nur den API-Key eintragen.
                </p>
              </div>
              <Button
                onClick={() => save("resend", {
                  api_key: resendState.api_key,
                })}
                disabled={saving === "resend"}
                className={saveButtonClass}
              >
                {saving === "resend" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </Card>

          {/* ── Anthropic (KI) ─────────────────────────────────────────────── */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-[hsl(263_100%_82%/0.3)] bg-[hsl(263_100%_82%/0.1)] text-[#C7A6FF]">
                    <Sparkles className="h-[17px] w-[17px]" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display text-base font-bold tracking-tight text-foreground">Anthropic (KI)</span>
                    <span className="text-xs leading-snug text-muted-foreground">KI-Texterstellung für News-Artikel (Voice-In im News-Editor)</span>
                  </div>
                </div>
                <StatusBadge configured={anthropicState.has_api_key} />
              </div>
              <div className="flex flex-col gap-[13px]">
                <SecretInput
                  label="API Key"
                  value={anthropicState.api_key}
                  onChange={(v) => setAnthropicState((p) => ({ ...p, api_key: v }))}
                  placeholder={maskedPlaceholder("anthropic", "api_key")}
                  hint={anthropicState.has_api_key ? "••• API-Key hinterlegt" : "sk-ant-..."}
                />
              </div>
              <Button
                onClick={() => save("anthropic", { api_key: anthropicState.api_key })}
                disabled={saving === "anthropic"}
                className={saveButtonClass}
              >
                {saving === "anthropic" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </Card>

          {/* ── DeepL (Auto-Translation) ───────────────────────────────────── */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
                    <Languages className="h-[17px] w-[17px]" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display text-base font-bold tracking-tight text-foreground">DeepL</span>
                    <span className="text-xs leading-snug text-muted-foreground">Automatische DE→EN Übersetzung von Admin-Inhalten (Partner-Tiles, Vereine, Galerie, Touchpoints)</span>
                  </div>
                </div>
                <StatusBadge configured={deeplState.has_api_key} />
              </div>
              <div className="flex flex-col gap-[13px]">
                <SecretInput
                  label="API Key"
                  value={deeplState.api_key}
                  onChange={(v) => setDeeplState((p) => ({ ...p, api_key: v }))}
                  placeholder={maskedPlaceholder("deepl", "api_key")}
                  hint={deeplState.has_api_key ? "••• API-Key hinterlegt" : "z.B. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx (Free) oder ohne :fx (Pro)"}
                />
                <p className={fieldHintClass}>
                  Beim Speichern eines Inhalts im Admin (z.B. Partner-Tile, Verein, Touchpoint) wird der deutsche Text
                  automatisch an DeepL geschickt und das Ergebnis in die EN-Felder geschrieben — solange die Felder nicht
                  manuell gesperrt sind.
                </p>
              </div>
              <Button
                onClick={() => save("deepl", { api_key: deeplState.api_key })}
                disabled={saving === "deepl"}
                className={saveButtonClass}
              >
                {saving === "deepl" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </Card>

          {/* ── App-Konfiguration ───────────────────────────────────────────── */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-[hsl(0_0%_18%)] bg-white/5 text-[hsl(0_0%_82%)]">
                    <Globe className="h-[17px] w-[17px]" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display text-base font-bold tracking-tight text-foreground">App-Konfiguration</span>
                    <span className="text-xs leading-snug text-muted-foreground">Basis-URL und allgemeine Einstellungen</span>
                  </div>
                </div>
                <StatusBadge configured={!!appState.url} />
              </div>
              <div className="flex flex-col gap-[13px]">
                <div className="flex flex-col gap-[7px]">
                  <Label className={fieldLabelClass}>App URL</Label>
                  <Input
                    value={appState.url}
                    onChange={(e) => setAppState({ url: e.target.value })}
                    placeholder="https://padel2go.de"
                    type="url"
                    className={fieldInputClass}
                  />
                  <p className={fieldHintClass}>Wird für Weiterleitungen nach der Zahlung und in E-Mails verwendet.</p>
                </div>
              </div>
              <Button
                onClick={() => save("app", { url: appState.url })}
                disabled={saving === "app"}
                className={saveButtonClass}
              >
                {saving === "app" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </Card>
        </div>

        {/* Info */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-[11px]">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]">
                <ShieldCheck className="h-[15px] w-[15px]" />
              </span>
              <span className="font-display text-[15px] font-bold tracking-tight text-foreground">Sicherheitshinweis</span>
            </div>
            <p className="max-w-[760px] text-[13px] leading-relaxed text-[hsl(0_0%_68%)]">
              Geheime Schlüssel (Secret Keys) werden serverseitig gespeichert. Nach dem Speichern sind sie im
              Browser nicht mehr lesbar — es wird nur eine maskierte Vorschau angezeigt. Beim erneuten Speichern
              eines Dienstes müssen geheime Felder <strong className="font-semibold text-foreground">neu eingegeben</strong>{" "}
              werden, sonst werden sie entfernt (du erhältst dann einen Warnhinweis).
            </p>
            <p className="max-w-[760px] text-[13px] leading-relaxed text-[hsl(0_0%_68%)]">
              Alternativ kannst du Schlüssel direkt als{" "}
              <strong className="font-mono text-xs font-medium text-primary">Supabase Edge Function Secrets</strong>{" "}
              hinterlegen — diese haben Vorrang vor der hier gespeicherten Konfiguration.
            </p>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
