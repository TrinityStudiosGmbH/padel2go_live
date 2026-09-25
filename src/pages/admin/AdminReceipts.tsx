import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Archive, Download, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import { useDataMode } from "@/hooks/useDataMode";
import { zipSync, strToU8 } from "fflate";

interface ReceiptRow {
  id: string;
  receipt_number: string;
  receipt_type: string;
  source_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  description: string | null;
  gross_cents: number;
  paid_cents: number;
  net_cents: number;
  tax_rate: number;
  tax_cents: number;
  stripe_fee_cents: number;
  issued_at: string;
  service_date: string | null;
  is_test: boolean;
  category: "booking" | "marketplace" | "lobby" | "event" | "other";
  is_refund: boolean;
  sport: string | null;
  reference_code: string | null;
}

const CATEGORY_LABEL: Record<ReceiptRow["category"], string> = {
  booking: "Buchung", marketplace: "Marketplace", lobby: "Lobby-Anteil", event: "Event-Ticket", other: "Sonstiges",
};

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export default function AdminReceipts() {
  const now = new Date();
  const [from, setFrom] = useState(iso(startOfMonth(now)));
  const [to, setTo] = useState(iso(now));
  const [category, setCategory] = useState<"all" | ReceiptRow["category"]>("all");
  const [kind, setKind] = useState<"all" | "invoice" | "refund">("all");
  const [sport, setSport] = useState<"all" | "padel" | "tennis">("all");
  const [search, setSearch] = useState("");
  const [zipBusy, setZipBusy] = useState<string | null>(null);
  const { isTest } = useDataMode();

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["admin-receipts", from, to, isTest],
    enabled: isTest !== undefined,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_receipts")
        .select("id, receipt_number, receipt_type, source_id, recipient_name, recipient_email, description, gross_cents, paid_cents, net_cents, tax_rate, tax_cents, stripe_fee_cents, issued_at, service_date, is_test, category, is_refund, sport, reference_code")
        .eq("is_test", isTest)
        .gte("issued_at", `${from}T00:00:00+02:00`)
        .lte("issued_at", `${to}T23:59:59+02:00`)
        .order("receipt_number", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ReceiptRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (category === "all" || r.category === category) &&
      (kind === "all" || (kind === "refund") === r.is_refund) &&
      (sport === "all" || r.sport === sport) &&
      (!q || r.receipt_number.toLowerCase().includes(q) || (r.recipient_name ?? "").toLowerCase().includes(q) ||
        (r.recipient_email ?? "").toLowerCase().includes(q) || (r.reference_code ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)),
    );
  }, [rows, category, kind, sport, search]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => ({ gross: acc.gross + r.paid_cents, tax: acc.tax + r.tax_cents, net: acc.net + r.net_cents, fee: acc.fee + (r.stripe_fee_cents ?? 0) }),
    { gross: 0, tax: 0, net: 0, fee: 0 },
  ), [filtered]);

  const buildCsv = (rows: ReceiptRow[]) => {
    const num = (c: number) => ((c ?? 0) / 100).toFixed(2).replace(".", ",");
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = "Belegnummer;Art;Sport;Datum;Leistungsdatum;Empfänger;Beschreibung;Brutto;Zahlbetrag;Netto;USt-Satz;USt-Betrag;Stripe-Gebühr";
    const lines = rows.map((r) => [
      esc(r.receipt_number), esc(CATEGORY_LABEL[r.category] + (r.is_refund ? " (Korrektur)" : "")), esc(r.sport ?? ""),
      format(new Date(r.issued_at), "dd.MM.yyyy"), r.service_date ? format(new Date(r.service_date), "dd.MM.yyyy") : "",
      esc(r.recipient_name ?? r.recipient_email ?? ""), esc(r.description),
      num(r.gross_cents), num(r.paid_cents), num(r.net_cents), String(r.tax_rate).replace(".", ","), num(r.tax_cents), num(r.stripe_fee_cents ?? 0),
    ].join(";"));
    return "\uFEFF" + [header, ...lines].join("\n");
  };

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!filtered.length) return toast.info("Keine Belege in der Auswahl");
    saveBlob(new Blob([buildCsv(filtered)], { type: "text/csv;charset=utf-8" }), `p2g-belege${isTest ? "-TEST" : ""}-${from}_${to}.csv`);
  };

  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  /**
   * ZIP entsteht im Browser: jedes PDF kommt einzeln von receipt-pdf (mit
   * eigenem Zeitbudget), gepackt wird hier. Eine Server-Funktion, die alle
   * PDFs am Stueck baut, laeuft ab einer Handvoll Belegen in die Rechenzeit-
   * grenze der Edge Functions. So geht es fuer 5 wie fuer 500.
   */
  const exportZip = async (label: string, f: string, t: string) => {
    setZipBusy(label);
    setZipProgress(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return toast.error("Bitte neu anmelden");

      const { data, error } = await (supabase as any)
        .from("admin_receipts")
        .select("id, receipt_number, receipt_type, source_id, recipient_name, recipient_email, description, gross_cents, paid_cents, net_cents, tax_rate, tax_cents, stripe_fee_cents, issued_at, service_date, is_test, category, is_refund, sport, reference_code")
        .eq("is_test", isTest)
        .gte("issued_at", `${f}T00:00:00+02:00`)
        .lte("issued_at", `${t}T23:59:59+02:00`)
        .order("receipt_number", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const list = (data ?? []) as ReceiptRow[];
      if (!list.length) return toast.info("Keine Belege in diesem Zeitraum");

      const files: Record<string, Uint8Array> = {};
      let done = 0;
      setZipProgress({ done, total: list.length });
      const fehler: string[] = [];
      // Drei gleichzeitig: schnell genug, ohne die Funktion zu ueberrennen.
      const queue = [...list];
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receipt-pdf`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ receipt_id: r.id }),
          });
          if (res.ok) files[`${r.receipt_number}.pdf`] = new Uint8Array(await res.arrayBuffer());
          else fehler.push(r.receipt_number);
          done += 1;
          setZipProgress({ done, total: list.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      files["belege.csv"] = strToU8(buildCsv(list));
      const zipped = zipSync(files, { level: 6 });
      saveBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), `p2g-belege${isTest ? "-TEST" : ""}-${f}_${t}.zip`);
      if (fehler.length) toast.warning(`${fehler.length} Beleg(e) fehlen im ZIP: ${fehler.slice(0, 3).join(", ")}${fehler.length > 3 ? "…" : ""}`);
      else toast.success(`${list.length} Belege als ZIP exportiert`);
    } catch (e) {
      toast.error("Export fehlgeschlagen", { description: (e as Error).message });
    } finally {
      setZipBusy(null);
      setZipProgress(null);
    }
  };

  const week = { from: iso(startOfWeek(now, { locale: de })), to: iso(endOfWeek(now, { locale: de })) };
  const month = { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
  const field = "h-9 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.03] text-[12.5px]";

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Belege</h1>
            <p className="text-sm text-muted-foreground">
              Alle Rechnungen und Korrekturrechnungen der gewählten Datenansicht (Schalter oben rechts). Exporte aus der Testansicht tragen „TEST“ im Dateinamen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportZip("week", week.from, week.to)} disabled={!!zipBusy} className="rounded-[10px]">
              {zipBusy === "week" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} ZIP diese Woche
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportZip("month", month.from, month.to)} disabled={!!zipBusy} className="rounded-[10px]">
              {zipBusy === "month" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} ZIP dieser Monat
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportZip("range", from, to)} disabled={!!zipBusy} className="rounded-[10px]">
              {zipBusy === "range" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} ZIP Zeitraum
            </Button>
            <Button size="sm" onClick={exportCsv} className="rounded-[10px]">
              <Download className="h-3.5 w-3.5" /> CSV Auswahl
            </Button>
            {zipProgress && (
              <span className="font-mono text-[11.5px] text-muted-foreground">{zipProgress.done} / {zipProgress.total} PDFs</span>
            )}
          </div>
        </div>

        <Card className="rounded-2xl border-border bg-gradient-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} w-[150px]`} />
            <span className="text-xs text-muted-foreground">bis</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} w-[150px]`} />
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger className={`${field} w-[160px]`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Arten</SelectItem>
                <SelectItem value="booking">Buchung</SelectItem>
                <SelectItem value="marketplace">Marketplace</SelectItem>
                <SelectItem value="lobby">Lobby-Anteil</SelectItem>
                <SelectItem value="event">Event-Ticket</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className={`${field} w-[170px]`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Rechnung + Korrektur</SelectItem>
                <SelectItem value="invoice">Nur Rechnungen</SelectItem>
                <SelectItem value="refund">Nur Korrekturen</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sport} onValueChange={(v) => setSport(v as typeof sport)}>
              <SelectTrigger className={`${field} w-[130px]`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Sportarten</SelectItem>
                <SelectItem value="padel">Padel</SelectItem>
                <SelectItem value="tennis">Tennis</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nummer, Kunde, Referenz…" className={`${field} pl-8`} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Belege", String(filtered.length)], ["Zahlbetrag", eur(totals.gross)], ["USt", eur(totals.tax)], ["Netto", eur(totals.net)]].map(([k, v]) => (
            <Card key={k} className="rounded-2xl border-border bg-gradient-card p-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{k}</span>
              <div className="mt-1 font-mono text-[20px] font-bold text-foreground">{v}</div>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl border-border bg-gradient-card p-4 sm:p-5">
          {isLoading ? (
            <span className="text-sm text-muted-foreground">Lade Belege…</span>
          ) : error ? (
            <span className="text-sm text-[#FF6B6B]">{(error as Error).message}</span>
          ) : filtered.length === 0 ? (
            <span className="text-sm text-muted-foreground">Keine Belege für diese Auswahl.</span>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="pb-2 pr-3 font-normal">Nummer</th>
                    <th className="pb-2 pr-3 font-normal">Datum</th>
                    <th className="pb-2 pr-3 font-normal">Art</th>
                    <th className="pb-2 pr-3 font-normal">Empfänger</th>
                    <th className="pb-2 pr-3 font-normal">Beschreibung</th>
                    <th className="pb-2 pr-3 text-right font-normal">Zahlbetrag</th>
                    <th className="pb-2 pr-3 text-right font-normal">USt</th>
                    <th className="pb-2 pr-3 text-right font-normal">Netto</th>
                    <th className="pb-2 pr-3 text-right font-normal">Gebühr</th>
                    <th className="pb-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-[hsl(0_0%_12%)]">
                      <td className="py-2 pr-3 font-mono text-[12px] text-foreground whitespace-nowrap">
                        {r.receipt_number}
                        {r.is_test && <span className="ml-1.5 rounded-full border border-[hsl(0_0%_30%)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(0_0%_62%)]">Test</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{format(new Date(r.issued_at), "dd.MM.yyyy")}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {CATEGORY_LABEL[r.category]}{r.sport ? ` · ${r.sport === "padel" ? "Padel" : "Tennis"}` : ""}
                        {r.is_refund && <span className="ml-1.5 text-[11px] text-[#FF6B6B]">Korrektur</span>}
                      </td>
                      <td className="py-2 pr-3">{r.recipient_name ?? r.recipient_email ?? "—"}</td>
                      <td className="py-2 pr-3 max-w-[260px] truncate text-[hsl(0_0%_62%)]" title={r.description ?? ""}>{r.reference_code ? `${r.reference_code} · ` : ""}{r.description}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{eur(r.paid_cents)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-[hsl(0_0%_60%)]">{eur(r.tax_cents)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{eur(r.net_cents)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-[hsl(0_0%_60%)]">{r.stripe_fee_cents ? eur(r.stripe_fee_cents) : "—"}</td>
                      <td className="py-2 text-right">
                        <InvoiceDownloadButton sourceId={r.source_id} receiptType={r.receipt_type} label="PDF" className="h-8 rounded-[9px]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {isTest && (
          <p className="flex items-center gap-1.5 text-[12px] text-[#FFC44D]"><FileText className="h-3.5 w-3.5" /> Ansicht Testdaten — Testbelege tragen TEST-Nummern und verschwinden beim Umschalten von Stripe auf Echtbetrieb.</p>
        )}
      </div>
    </AdminLayout>
  );
}
