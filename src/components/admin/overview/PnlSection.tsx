import { useMemo, useState } from "react";
import {
  addDays, addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, endOfMonth, endOfQuarter,
  endOfWeek, endOfYear, format, startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subDays,
} from "date-fns";
import { de } from "date-fns/locale";
import { Download, Pencil, Plus, Trash2, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { usePnl, usePnlEntries, usePnlEntryMutations, type PnlEntry, type PnlEntryInput } from "@/hooks/usePnl";
import { buildPnl, pnlToCsv, valueOf, ZERO, type PnlBasis, type PnlBucket, type PnlLine, type PnlView } from "@/lib/pnl";

type Preset = "today" | "week" | "month" | "quarter" | "year" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Heute" },
  { key: "week", label: "Woche" },
  { key: "month", label: "Monat" },
  { key: "quarter", label: "Quartal" },
  { key: "year", label: "Jahr" },
  { key: "custom", label: "Frei" },
];

const CATEGORY_SUGGESTIONS = ["Miete", "Software", "Versicherung", "Marketing", "Personal", "Steuerberater", "Bank & Gebühren", "Sponsoring", "Sonstiges"];

const eur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

function periodFor(preset: Preset, now: Date, custom: { from: string; to: string }) {
  switch (preset) {
    case "today": return { from: startOfDay(now), to: startOfDay(now) };
    case "week": return { from: startOfWeek(now, { locale: de }), to: endOfWeek(now, { locale: de }) };
    case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
    case "quarter": return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "year": return { from: startOfYear(now), to: endOfYear(now) };
    default: {
      const from = custom.from ? new Date(custom.from) : startOfMonth(now);
      const to = custom.to ? new Date(custom.to) : now;
      return { from: startOfDay(from), to: startOfDay(to < from ? from : to) };
    }
  }
}

/** Die Vorperiode: gleiche Einheit davor, bei freiem Zeitraum gleiche Laenge davor. */
function previousOf(preset: Preset, from: Date, to: Date) {
  switch (preset) {
    case "today": return { from: subDays(from, 1), to: subDays(to, 1) };
    case "week": return { from: addWeeks(from, -1), to: addWeeks(to, -1) };
    case "month": return { from: addMonths(from, -1), to: endOfMonth(addMonths(from, -1)) };
    case "quarter": return { from: addQuarters(from, -1), to: endOfQuarter(addQuarters(from, -1)) };
    case "year": return { from: addYears(from, -1), to: endOfYear(addYears(from, -1)) };
    default: {
      const len = differenceInCalendarDays(to, from) + 1;
      return { from: subDays(from, len), to: subDays(from, 1) };
    }
  }
}

function bucketLabel(bucket: PnlBucket, iso: string): string {
  const d = new Date(iso);
  if (bucket === "day") return format(d, "EEE dd.MM.", { locale: de });
  if (bucket === "week") return `KW ${format(d, "II", { locale: de })}`;
  if (bucket === "month") return format(d, "MMM yyyy", { locale: de });
  return "Zeitraum";
}

const ROW_STYLE: Record<PnlLine["kind"], string> = {
  income: "text-foreground",
  manual_income: "text-foreground",
  refund: "text-[hsl(0_0%_62%)]",
  cost: "text-[hsl(0_0%_62%)]",
  manual_expense: "text-[hsl(0_0%_62%)]",
  subtotal: "font-semibold text-foreground border-t border-[hsl(0_0%_16%)]",
  result: "font-bold text-primary border-t-2 border-primary/40 text-[14px]",
  memo: "text-[hsl(0_0%_50%)] italic border-t border-dashed border-[hsl(0_0%_16%)]",
};


function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-[3px] rounded-[11px] border border-[hsl(0_0%_14%)] bg-white/[0.04] p-[3px]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            value === o.key ? "bg-primary text-[#0A0A0A]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PnlSection({ basis }: { basis: PnlBasis }) {
  const now = new Date();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") });
  const [view, setView] = useState<PnlView>("net");
  const [bucket, setBucket] = useState<PnlBucket>("total");
  const [compare, setCompare] = useState(true);
  const { stateOf } = useFeatureToggles();
  const showLobby = stateOf("lobbies") !== "hidden";

  const { from, to } = useMemo(() => periodFor(preset, now, custom), [preset, custom, now.toDateString()]);
  const prev = useMemo(() => previousOf(preset, from, to), [preset, from, to]);

  const current = usePnl(from, to, basis, bucket);
  const previous = usePnl(prev.from, prev.to, basis, "total", bucket === "total" && compare);

  const buckets = useMemo(() => {
    if (bucket === "total") return [format(from, "yyyy-MM-dd")];
    const keys = new Set<string>();
    // Alle Scheiben im Zeitraum, auch leere — sonst fehlen stille Wochen in der Tabelle.
    let d = bucket === "week" ? startOfWeek(from, { locale: de }) : bucket === "month" ? startOfMonth(from) : from;
    while (d <= to) {
      keys.add(format(d, "yyyy-MM-dd"));
      d = bucket === "day" ? addDays(d, 1) : bucket === "week" ? addWeeks(d, 1) : addMonths(d, 1);
    }
    for (const r of current.data ?? []) keys.add(r.bucket_start);
    return [...keys].sort();
  }, [bucket, from, to, current.data]);

  const lines = useMemo(() => buildPnl(current.data ?? [], buckets, { showLobby }), [current.data, buckets, showLobby]);
  const prevLines = useMemo(
    () => buildPnl(previous.data ?? [], [format(prev.from, "yyyy-MM-dd")], { showLobby }),
    [previous.data, prev.from, showLobby],
  );
  const prevByKey = useMemo(() => new Map(prevLines.map((l) => [l.key, l.total])), [prevLines]);
  const showCompare = bucket === "total" && compare;

  const exportCsv = () => {
    const labels = buckets.map((b) => bucketLabel(bucket, b));
    const csv = pnlToCsv(lines, buckets, bucket === "total" ? [`${format(from, "dd.MM.yyyy")}–${format(to, "dd.MM.yyyy")}`] : labels, view);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `p2g-pnl-${format(from, "yyyy-MM-dd")}_${format(to, "yyyy-MM-dd")}-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="font-display text-base font-bold tracking-tight text-foreground">Ergebnis</h2>
        <span className="text-xs text-muted-foreground">
          {basis === "cash" ? "nach Belegdatum — was eingegangen ist" : "nach Leistungsdatum — was gespielt und geliefert wurde"} · sportartübergreifend
        </span>
      </div>

      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          {/* Einstellleiste */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Toggle<Preset> value={preset} options={PRESETS} onChange={setPreset} />
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-9 w-[150px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.03] text-[12.5px]" />
                <span className="text-xs text-muted-foreground">bis</span>
                <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-9 w-[150px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.03] text-[12.5px]" />
              </div>
            )}
            <Toggle<PnlView> value={view} options={[{ key: "net", label: "Netto" }, { key: "gross", label: "Brutto" }]} onChange={setView} />
            <Toggle<PnlBucket>
              value={bucket}
              options={[{ key: "total", label: "Gesamt" }, { key: "day", label: "je Tag" }, { key: "week", label: "je Woche" }, { key: "month", label: "je Monat" }]}
              onChange={setBucket}
            />
            {bucket === "total" && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[hsl(71_91%_51%)]" />
                Vorperiode
              </label>
            )}
            <div className="ml-auto flex items-center gap-2">
              {current.isFetching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!current.data} className="rounded-[10px]">
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>

          <p className="text-[12px] text-muted-foreground">
            {format(from, "dd.MM.yyyy")} – {format(to, "dd.MM.yyyy")}
            {showCompare && <> · Vorperiode {format(prev.from, "dd.MM.yyyy")} – {format(prev.to, "dd.MM.yyyy")}</>}
            {" · "}Punkte und Gutscheine mindern das Entgelt; gezählt wird, was gezahlt wurde.
          </p>

          {/* Tabelle */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Position</th>
                  {bucket === "total" ? (
                    <>
                      <th className="pb-2 pr-4 text-right font-normal">Zeitraum</th>
                      {showCompare && <th className="pb-2 pr-4 text-right font-normal">Vorperiode</th>}
                      {showCompare && <th className="pb-2 text-right font-normal">Δ</th>}
                    </>
                  ) : (
                    <>
                      {buckets.map((b) => <th key={b} className="whitespace-nowrap pb-2 pr-4 text-right font-normal">{bucketLabel(bucket, b)}</th>)}
                      <th className="pb-2 text-right font-normal">Summe</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const total = valueOf(l.total, view);
                  const prevTotal = showCompare ? valueOf(prevByKey.get(l.key) ?? ZERO, view) : null;
                  const delta = prevTotal !== null ? total - prevTotal : null;
                  const indent = l.kind === "income" || l.kind === "manual_income" || l.kind === "refund" || l.kind === "cost" || l.kind === "manual_expense";
                  return (
                    <tr key={l.key} className={ROW_STYLE[l.kind]}>
                      <td className={`py-1.5 pr-4 ${indent ? "pl-3" : ""}`}>{l.label}</td>
                      {bucket === "total" ? (
                        <>
                          <td className="py-1.5 pr-4 text-right font-mono tabular-nums">{eur(total)}</td>
                          {showCompare && <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-[hsl(0_0%_55%)]">{eur(prevTotal ?? 0)}</td>}
                          {showCompare && (
                            <td className={`py-1.5 text-right font-mono tabular-nums ${delta === 0 ? "text-[hsl(0_0%_45%)]" : (delta ?? 0) > 0 ? "text-primary" : "text-[#FF6B6B]"}`}>
                              {delta === null ? "" : `${delta > 0 ? "+" : ""}${eur(delta)}`}
                            </td>
                          )}
                        </>
                      ) : (
                        <>
                          {buckets.map((b) => <td key={b} className="py-1.5 pr-4 text-right font-mono tabular-nums">{eur(valueOf(l.values[b] ?? ZERO, view))}</td>)}
                          <td className="py-1.5 text-right font-mono tabular-nums font-semibold">{eur(total)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {current.error && (
            <p className="text-[12px] text-[#FF6B6B]">Ergebnis konnte nicht geladen werden: {(current.error as Error).message}</p>
          )}
        </div>
      </Card>

      <PnlEntriesManager />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manuelle Posten und Fixkosten
// ─────────────────────────────────────────────────────────────────────────────

const RECURRENCE_LABEL: Record<PnlEntry["recurrence"], string> = {
  once: "einmalig", monthly: "monatlich", quarterly: "quartalsweise", yearly: "jährlich",
};

const emptyEntry = (): PnlEntryInput => ({
  kind: "expense", category: "", label: "", amount_cents: 0, tax_rate: 19,
  recurrence: "monthly", entry_date: format(startOfMonth(new Date()), "yyyy-MM-dd"), end_date: null, notes: null,
});

function PnlEntriesManager() {
  const { data: entries, isLoading } = usePnlEntries();
  const { save, remove } = usePnlEntryMutations();
  const [editing, setEditing] = useState<(PnlEntryInput & { id?: string }) | null>(null);
  const [deleting, setDeleting] = useState<PnlEntry | null>(null);
  const [amountInput, setAmountInput] = useState("");

  const open = (e?: PnlEntry) => {
    const base = e ? { ...e } : emptyEntry();
    setEditing(base);
    setAmountInput(base.amount_cents ? (base.amount_cents / 100).toFixed(2) : "");
  };

  const submit = async () => {
    if (!editing) return;
    const amount = Math.round(parseFloat(amountInput.replace(",", ".")) * 100);
    if (!editing.label.trim()) return toast.error("Bitte eine Bezeichnung angeben");
    if (!editing.category.trim()) return toast.error("Bitte eine Kategorie angeben");
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Bitte einen gültigen Betrag angeben");
    try {
      await save.mutateAsync({ ...editing, label: editing.label.trim(), category: editing.category.trim(), amount_cents: amount });
      toast.success(editing.id ? "Posten gespeichert" : "Posten angelegt");
      setEditing(null);
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", { description: (err as Error).message });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Posten gelöscht");
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", { description: (err as Error).message });
    } finally {
      setDeleting(null);
    }
  };

  const field = "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.03] text-[13px]";

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13.5px] font-bold text-foreground">Manuelle Posten &amp; Fixkosten</span>
            <span className="text-[12px] text-muted-foreground">
              Miete, Software, Versicherung — alles, was nicht über die Plattform läuft. Wiederkehrende Posten zählen automatisch in jedem Zeitraum mit.
            </span>
          </div>
          <Button size="sm" onClick={() => open()} className="rounded-[10px]">
            <Plus className="h-3.5 w-3.5" /> Posten anlegen
          </Button>
        </div>

        {isLoading ? (
          <span className="text-[12.5px] text-muted-foreground">Lade…</span>
        ) : !entries?.length ? (
          <div className="flex items-start gap-2 rounded-[12px] border border-dashed border-[hsl(0_0%_18%)] px-4 py-3 text-[12.5px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-none" /> Noch keine Posten. Leg die Fixkosten der OpCo an, dann steht das Ergebnis oben nicht nur aus Umsatz.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 pr-3 font-normal">Bezeichnung</th>
                  <th className="pb-2 pr-3 font-normal">Kategorie</th>
                  <th className="pb-2 pr-3 font-normal">Art</th>
                  <th className="pb-2 pr-3 text-right font-normal">Netto</th>
                  <th className="pb-2 pr-3 text-right font-normal">USt</th>
                  <th className="pb-2 pr-3 font-normal">Wiederholung</th>
                  <th className="pb-2 pr-3 font-normal">Ab / am</th>
                  <th className="pb-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-[hsl(0_0%_12%)]">
                    <td className="py-2 pr-3 text-foreground">{e.label}{e.notes && <span className="block text-[11px] text-muted-foreground">{e.notes}</span>}</td>
                    <td className="py-2 pr-3">{e.category}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${e.kind === "income" ? "border-primary/30 bg-primary/10 text-primary" : "border-[hsl(0_0%_25%)] bg-white/[0.04] text-[hsl(0_0%_70%)]"}`}>
                        {e.kind === "income" ? "Einnahme" : "Ausgabe"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{eur(e.amount_cents)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-[hsl(0_0%_60%)]">{Number(e.tax_rate)} %</td>
                    <td className="py-2 pr-3">{RECURRENCE_LABEL[e.recurrence]}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {format(new Date(e.entry_date), "dd.MM.yyyy")}
                      {e.recurrence !== "once" && <span className="text-muted-foreground"> – {e.end_date ? format(new Date(e.end_date), "dd.MM.yyyy") : "offen"}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => open(e)} className="h-8 px-2"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(e)} className="h-8 px-2 text-[#FF6B6B] hover:text-[#FF6B6B]"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Posten bearbeiten" : "Posten anlegen"}</DialogTitle>
            <DialogDescription>Beträge netto. Die Steuer wird für die Brutto-Sicht und die USt-Zahllast mitgerechnet.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Bezeichnung</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="z. B. Büro Humboldtstraße" className={field} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Art</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v as PnlEntry["kind"] })}>
                  <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Ausgabe</SelectItem>
                    <SelectItem value="income">Einnahme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Kategorie</Label>
                <Input list="pnl-categories" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Miete, Software, …" className={field} />
                <datalist id="pnl-categories">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Betrag netto (€)</Label>
                <Input type="number" min={0} step={0.01} value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="0.00" className={field} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Steuersatz</Label>
                <Select value={String(editing.tax_rate)} onValueChange={(v) => setEditing({ ...editing, tax_rate: Number(v) })}>
                  <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="19">19 %</SelectItem>
                    <SelectItem value="7">7 %</SelectItem>
                    <SelectItem value="0">0 % — ohne Vorsteuer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Wiederholung</Label>
                <Select value={editing.recurrence} onValueChange={(v) => setEditing({ ...editing, recurrence: v as PnlEntry["recurrence"] })}>
                  <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RECURRENCE_LABEL) as PnlEntry["recurrence"][]).map((k) => <SelectItem key={k} value={k}>{RECURRENCE_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{editing.recurrence === "once" ? "Datum" : "Beginn"}</Label>
                <Input type="date" value={editing.entry_date} onChange={(e) => setEditing({ ...editing, entry_date: e.target.value })} className={field} />
              </div>
              {editing.recurrence !== "once" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Ende (optional)</Label>
                  <Input type="date" value={editing.end_date ?? ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })} className={field} />
                </div>
              )}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Notiz (optional)</Label>
                <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} rows={2} className="rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.03] text-[13px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Speichere…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Posten löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleting?.label}" verschwindet aus allen Zeiträumen, auch aus vergangenen. Nicht umkehrbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
