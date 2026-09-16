import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Eye, Send, CheckCircle2, XCircle, Loader2, KeyRound, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MailMeta {
  id: string;
  group: string;
  label: string;
  description: string;
  source: string;
}

interface SendResult {
  id: string;
  ok: boolean;
  error?: string;
  emailId?: string;
}

const GROUP_ORDER = ["Buchung", "Events", "Shop", "Newsletter", "Intern"];

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-mail-test", { body });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const errBody = await ctx.clone().json().catch(() => null) as { error?: string } | null;
      if (errBody?.error) throw new Error(errBody.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function MailTestPanel() {
  const { user, resetPassword } = useAuth();
  const [to, setTo] = useState(user?.email ?? "");
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const [preview, setPreview] = useState<{ label: string; subject: string; html: string } | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["admin-mail-test-catalog"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await invoke<{ mails: MailMeta[] }>({ action: "list" })).mails,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, MailMeta[]>();
    for (const m of catalog ?? []) map.set(m.group, [...(map.get(m.group) ?? []), m]);
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, mails: map.get(g)! }));
  }, [catalog]);

  const validTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const sendMutation = useMutation({
    mutationFn: async (type: string | null) =>
      (await invoke<{ results: SendResult[] }>(
        type ? { action: "send", type, to: to.trim() } : { action: "send_all", to: to.trim() },
      )).results,
    onSuccess: (res) => {
      setResults((prev) => ({ ...prev, ...Object.fromEntries(res.map((r) => [r.id, r])) }));
      const failed = res.filter((r) => !r.ok);
      if (failed.length === 0) toast.success(res.length === 1 ? `Testmail an ${to.trim()} gesendet` : `${res.length} Testmails an ${to.trim()} gesendet`);
      else toast.error(`${failed.length} von ${res.length} Mails fehlgeschlagen`);
    },
    onError: (e: Error) => toast.error("Senden fehlgeschlagen: " + e.message),
  });

  const previewMutation = useMutation({
    mutationFn: async (m: MailMeta) => ({ label: m.label, ...(await invoke<{ subject: string; html: string }>({ action: "preview", type: m.id })) }),
    onSuccess: (p) => setPreview(p),
    onError: (e: Error) => toast.error("Vorschau fehlgeschlagen: " + e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await resetPassword(to.trim());
      if (error) throw new Error(error.message ?? "Fehler");
    },
    onSuccess: () => toast.success(`Passwort-Reset-Mail an ${to.trim()} ausgelöst (nur für registrierte Konten)`),
    onError: (e: Error) => toast.error("Auslösen fehlgeschlagen: " + e.message),
  });

  const busyType = sendMutation.isPending ? sendMutation.variables : undefined;

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-base font-bold tracking-tight text-foreground">E-Mail-Test</span>
              <span className="text-xs leading-snug text-muted-foreground">
                Jede ausgehende Mail mit Beispieldaten an eine beliebige Adresse schicken. Betreff bekommt den Präfix [TEST].
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] p-[15px]">
          <div className="flex min-w-[220px] flex-1 flex-col gap-[7px]">
            <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Empfänger</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
            />
          </div>
          <Button
            onClick={() => sendMutation.mutate(null)}
            disabled={!validTo || sendMutation.isPending || !catalog?.length}
            className="h-10 rounded-[10px] bg-gradient-lime px-4 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {sendMutation.isPending && busyType === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Alle {catalog?.length ?? ""} Mails senden
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : (
          grouped.map(({ group, mails }) => (
            <div key={group} className="flex flex-col gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[hsl(0_0%_58%)]">{group}</span>
              {mails.map((m) => {
                const r = results[m.id];
                const sending = sendMutation.isPending && busyType === m.id;
                return (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-3"
                  >
                    <span className="flex h-6 w-6 flex-none items-center justify-center">
                      {r ? (
                        r.ok
                          ? <CheckCircle2 className="h-[17px] w-[17px] text-primary" />
                          : <XCircle className="h-[17px] w-[17px] text-[#FF6B6B]" />
                      ) : (
                        <span className="h-[7px] w-[7px] rounded-full bg-[hsl(0_0%_25%)]" />
                      )}
                    </span>
                    <div className="flex min-w-[200px] flex-1 flex-col gap-[2px]">
                      <span className="text-sm font-bold text-foreground">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.description}</span>
                      <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground/70">{m.source}</span>
                      {r && !r.ok && <span className="text-xs text-[#FF6B6B]">{r.error}</span>}
                    </div>
                    <div className="flex flex-none gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => previewMutation.mutate(m)}
                        disabled={previewMutation.isPending}
                        className="h-9 rounded-[10px] border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                      >
                        <Eye className="h-[15px] w-[15px]" /> Vorschau
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => sendMutation.mutate(m.id)}
                        disabled={!validTo || sendMutation.isPending}
                        className="h-9 rounded-[10px] bg-primary/15 text-primary hover:bg-primary/25"
                      >
                        {sending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Send className="h-[15px] w-[15px]" />}
                        Senden
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[hsl(0_0%_58%)]">Auth (Supabase)</span>
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center">
              <KeyRound className="h-[15px] w-[15px] text-muted-foreground" />
            </span>
            <div className="flex min-w-[200px] flex-1 flex-col gap-[2px]">
              <span className="text-sm font-bold text-foreground">Passwort zurücksetzen</span>
              <span className="text-xs text-muted-foreground">
                Löst die echte Supabase-Auth-Mail aus. Funktioniert nur, wenn die Adresse ein registriertes Konto ist.
              </span>
              <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground/70">Supabase Auth → Templates → Reset password</span>
            </div>
            <Button
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={!validTo || resetMutation.isPending}
              className="h-9 rounded-[10px] bg-primary/15 text-primary hover:bg-primary/25"
            >
              {resetMutation.isPending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Send className="h-[15px] w-[15px]" />}
              Auslösen
            </Button>
          </div>
          <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(200_100%_75%/0.22)] bg-[hsl(200_100%_75%/0.06)] px-[15px] py-[13px]">
            <Info className="mt-0.5 h-[15px] w-[15px] flex-none text-[#7FD4FF]" />
            <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
              „Confirm signup“ und „Change Email“ verschickt Supabase nur bei einer echten Registrierung bzw.
              Adressänderung. Die Vorlagen liegen in <span className="font-mono">docs/email-templates/</span> und werden im
              Supabase-Dashboard gepflegt.
            </span>
          </div>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden rounded-[20px] border-[hsl(0_0%_15%)] bg-[hsl(0_0%_4%)] p-0">
          <DialogHeader className="gap-[3px] space-y-0 border-b border-[hsl(0_0%_12%)] px-5 py-4 text-left">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Vorschau · {preview?.label}</span>
            <DialogTitle className="font-display text-base font-extrabold tracking-tight text-foreground">
              {preview?.subject}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe
              title={`Vorschau ${preview.label}`}
              srcDoc={preview.html}
              sandbox=""
              className="h-[75vh] w-full border-0 bg-[#0A0A0A]"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
