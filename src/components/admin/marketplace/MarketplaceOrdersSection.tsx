import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Coins, Image as ImageIcon, Loader2, Package, RotateCcw, Send, Truck, Undo2 } from "lucide-react";
import {
  useAdminMarketplaceOrders,
  useUpdateFulfillmentStatus,
  useRefundMarketplaceOrder,
  useShipOrder,
  useAdminReturns,
  useUpdateReturn,
  type MarketplaceOrder,
  type FulfillmentStatus,
  type ReturnStatus,
  useMarketplaceReceipts,
  useAdminOrdersRealtime,
} from "@/hooks/useAdminMarketplace";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";

const eur = (cents: number | null | undefined) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);

const FULFILL_LABEL: Record<FulfillmentStatus, string> = {
  pending: "Offen",
  shipped: "Versendet",
  delivered: "Geliefert",
  cancelled: "Storniert",
};

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const CARRIERS = ["DHL", "DPD", "GLS", "Hermes", "Andere"];

const RETURN_LABEL: Record<ReturnStatus, string> = {
  requested: "Angemeldet",
  received: "Ware eingegangen",
  refunded: "Erstattet",
  rejected: "Abgelehnt",
};

// ── Styling-Tokens des neuen Designs (identisch zu AdminMarketplace.tsx) ──
const TH = "h-auto whitespace-nowrap pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]";
const PILL_BASE = "inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold";
const PILL_OPEN_COUNT =
  "whitespace-nowrap rounded-full border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-2.5 py-1 text-[11px] font-bold text-[#FFC44D]";
const STATUS_PILL: Record<string, string> = {
  pending: "border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]",
  shipped: "border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]",
  delivered: "border-primary/30 bg-primary/10 text-primary",
  cancelled: "border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]",
  refunded: "border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]",
};
const ICON_TILE_NEUTRAL =
  "flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]";
const BTN_DANGER_SM =
  "h-7 shrink-0 gap-1 rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] px-[11px] text-[11.5px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]";
const SELECT_SM =
  "rounded-lg border-[hsl(0_0%_16%)] bg-white/[0.05] text-xs font-semibold";

const ORDER_FILTERS: { key: string; label: string }[] = [
  { key: "open", label: "Offen (zu versenden)" },
  { key: "shipped", label: "Versendet" },
  { key: "delivered", label: "Geliefert" },
  { key: "refunded", label: "Storniert / Erstattet" },
  { key: "unpaid", label: "Zahlung offen" },
  { key: "all", label: "Alle" },
];

export function MarketplaceOrdersSection() {
  const { data: orders, isLoading } = useAdminMarketplaceOrders();
  const { data: receipts } = useMarketplaceReceipts();
  useAdminOrdersRealtime();
  const updateFulfillment = useUpdateFulfillmentStatus();
  const refund = useRefundMarketplaceOrder();
  const shipOrder = useShipOrder();

  const [filter, setFilter] = useState<string>("open");
  const [refundTarget, setRefundTarget] = useState<MarketplaceOrder | null>(null);
  const [shipForms, setShipForms] = useState<Record<string, { carrier: string; tracking: string }>>({});

  const setShipForm = (id: string, patch: Partial<{ carrier: string; tracking: string }>) =>
    setShipForms((f) => ({ ...f, [id]: { ...(f[id] ?? { carrier: "DHL", tracking: "" }), ...patch } }));

  const all = orders ?? [];
  const openCount = all.filter((o) => o.status === "success" && o.fulfillment_status === "pending").length;

  const filtered = all.filter((o) => {
    if (filter === "all") return true;
    if (filter === "open") return o.status === "success" && o.fulfillment_status === "pending";
    if (filter === "shipped") return o.status === "success" && o.fulfillment_status === "shipped";
    if (filter === "delivered") return o.status === "success" && o.fulfillment_status === "delivered";
    if (filter === "refunded") return o.status === "refunded" || o.status === "cancelled";
    if (filter === "unpaid") return o.status === "pending";
    return true;
  });

  const statusBadge = (o: MarketplaceOrder) => {
    if (o.status === "pending") {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-2.5 py-1 text-[11px] font-semibold text-[#FFC44D]">
          Zahlung offen
        </span>
      );
    }
    const key = o.status === "refunded" ? "refunded" : o.status === "cancelled" ? "cancelled" : o.fulfillment_status;
    const label =
      o.status === "refunded" ? "Erstattet" : o.status === "cancelled" ? "Storniert" : FULFILL_LABEL[o.fulfillment_status];
    return (
      <span className={`${PILL_BASE} ${STATUS_PILL[key]}`}>
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        {label}
      </span>
    );
  };

  return (
    <>
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={ICON_TILE_NEUTRAL}>
            <Truck className="h-[15px] w-[15px]" />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            Bestellungen &amp; Versand
          </h2>
          {openCount > 0 && <span className={PILL_OPEN_COUNT}>{openCount} offen</span>}
        </div>

        <div
          role="group"
          aria-label="Bestellungen filtern"
          className="flex flex-wrap gap-[3px] self-start rounded-[11px] border border-[hsl(0_0%_14%)] bg-white/[0.04] p-[3px]"
        >
          {ORDER_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                filter === f.key ? "bg-primary text-[#0A0A0A]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-50" />
            <p className="text-sm">Keine Bestellungen in dieser Ansicht.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                  <TableHead className={TH}>Datum</TableHead>
                  <TableHead className={TH}>Bestellnr.</TableHead>
                  <TableHead className={TH}>Kunde</TableHead>
                  <TableHead className={TH}>Produkt</TableHead>
                  <TableHead className={TH}>Lieferadresse</TableHead>
                  <TableHead className={`${TH} text-right`}>Bezahlt</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={TH}>Beleg</TableHead>
                  <TableHead className={`${TH} text-right`}>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const refunded = o.status !== "success";
                  const pointsSpent = (o.play_spent ?? 0) + (o.reward_spent ?? 0);
                  const hasAddress = !!o.shipping_address_line1;
                  const form = shipForms[o.id] ?? { carrier: "DHL", tracking: "" };
                  const shipping = shipOrder.isPending && shipOrder.variables?.order_id === o.id;
                  return (
                    <TableRow
                      key={o.id}
                      className={`border-[hsl(0_0%_12%)] hover:bg-white/[0.022] ${refunded ? "opacity-60" : ""}`}
                    >
                      <TableCell className="whitespace-nowrap py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                        {dateFmt(o.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 pr-3.5 font-mono text-[12.5px] text-foreground">
                        {o.reference_code || o.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="py-3 pr-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
                            {o.guest_name || (o.user_id ? "Konto-Nutzer" : "Gast")}
                          </span>
                          {o.guest_email && (
                            <span className="break-all font-mono text-[11px] text-muted-foreground">{o.guest_email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 pr-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 flex-none overflow-hidden rounded-lg border border-[hsl(0_0%_15%)] bg-muted">
                            {o.item?.image_url ? (
                              <img src={o.item.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="max-w-[170px] truncate text-[12.5px] font-semibold text-foreground">
                              {o.item?.name || "—"}
                            </span>
                            <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                              Menge: {o.quantity ?? 1}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] py-3 pr-3.5">
                        {hasAddress ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="whitespace-nowrap text-xs text-[hsl(0_0%_78%)]">{o.shipping_address_line1}</span>
                            <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                              {o.shipping_postal_code} {o.shipping_city} · {o.shipping_country || "DE"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Keine Versandadresse</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 pr-3.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="whitespace-nowrap font-mono text-[13px] font-bold text-foreground">
                            {eur(o.amount_cents)}
                          </span>
                          {pointsSpent > 0 && (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10.5px] text-primary">
                              <Coins className="h-3 w-3" />
                              {pointsSpent.toLocaleString("de-DE")} P. eingelöst
                            </span>
                          )}
                          {o.points_balance_before !== null && o.points_balance_after !== null && (
                            <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                              Stand: {o.points_balance_before.toLocaleString("de-DE")} →{" "}
                              {o.points_balance_after.toLocaleString("de-DE")} P.
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 pr-3.5">
                        <div className="flex flex-col gap-1">
                          {statusBadge(o)}
                          {o.tracking_number && (o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered") && (
                            <span className="whitespace-nowrap font-mono text-[10.5px] text-[hsl(0_0%_58%)]">
                              {o.carrier} · {o.tracking_number}
                              {o.shipped_at && <> · {dateFmt(o.shipped_at)}</>}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 pr-3.5">
                        {(() => {
                          const r = receipts?.get(o.id);
                          if (!r?.invoice) {
                            // Kein Beleg heisst: nichts bezahlt. Ein Beleg entsteht
                            // erst mit der Zahlung, nicht mit der Bestellung.
                            return <span className="font-mono text-[11px] text-[hsl(0_0%_45%)]">—</span>;
                          }
                          return (
                            <div className="flex flex-col items-start gap-1.5">
                              <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_72%)]">
                                {r.invoice.receipt_number}
                              </span>
                              <InvoiceDownloadButton
                                sourceId={o.id}
                                receiptType="marketplace_order"
                                label="Rechnung"
                                className="h-7 gap-1.5 px-2 text-[11.5px]"
                              />
                              {r.credit && (
                                <>
                                  <span className="whitespace-nowrap font-mono text-[11px] text-[#FF6B6B]">
                                    {r.credit.receipt_number}
                                  </span>
                                  <InvoiceDownloadButton
                                    sourceId={o.id}
                                    receiptType="marketplace_refund"
                                    label="Storno"
                                    className="h-7 gap-1.5 border-[hsl(0_100%_71%/0.35)] px-2 text-[11.5px] text-[#FF6B6B]"
                                  />
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="flex flex-col items-end gap-[7px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <Select
                              value={o.fulfillment_status}
                              onValueChange={(v) =>
                                updateFulfillment.mutate({ id: o.id, fulfillment_status: v as FulfillmentStatus })
                              }
                              disabled={refunded}
                            >
                              <SelectTrigger className={`h-[30px] w-[130px] ${SELECT_SM}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Offen</SelectItem>
                                <SelectItem value="shipped">Versendet</SelectItem>
                                <SelectItem value="delivered">Geliefert</SelectItem>
                              </SelectContent>
                            </Select>
                            {!refunded && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={BTN_DANGER_SM}
                                onClick={() => setRefundTarget(o)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Stornieren
                              </Button>
                            )}
                          </div>
                          {!refunded && o.fulfillment_status === "pending" && hasAddress && (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <Select value={form.carrier} onValueChange={(v) => setShipForm(o.id, { carrier: v })}>
                                <SelectTrigger className={`h-[30px] w-[92px] shrink-0 ${SELECT_SM}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CARRIERS.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-[30px] w-[130px] rounded-lg border-[hsl(0_0%_16%)] bg-white/[0.05] font-mono text-[11.5px]"
                                placeholder="Sendungsnummer"
                                value={form.tracking}
                                onChange={(e) => setShipForm(o.id, { tracking: e.target.value })}
                              />
                              <Button
                                size="sm"
                                className="h-[30px] shrink-0 gap-1 rounded-lg bg-gradient-lime px-[11px] text-[11.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
                                disabled={!form.tracking.trim() || shipping}
                                onClick={() =>
                                  shipOrder.mutate({
                                    order_id: o.id,
                                    tracking_number: form.tracking.trim(),
                                    carrier: form.carrier,
                                  })
                                }
                              >
                                {shipping ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                Versenden + Mail
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>

    {/* Refund confirmation */}
    <AlertDialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
      <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[450px] sm:rounded-[20px]">
        <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <AlertDialogHeader className="space-y-[7px] text-left">
          <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
            Bestellung stornieren &amp; erstatten?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
            {refundTarget && (
              <>
                „{refundTarget.item?.name}" ({refundTarget.reference_code}) wird storniert.
                {(refundTarget.amount_cents ?? 0) > 0 && (
                  <> Der bezahlte Betrag <strong className="text-foreground">{eur(refundTarget.amount_cents)}</strong> wird über Stripe zurückerstattet.</>
                )}
                {((refundTarget.play_spent ?? 0) + (refundTarget.reward_spent ?? 0)) > 0 && (
                  <> Eingelöste Punkte werden dem Konto gutgeschrieben.</>
                )}
                {" "}Der Lagerbestand wird zurückgebucht. Diese Aktion kann nicht rückgängig gemacht werden.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2.5">
          <AlertDialogCancel
            disabled={refund.isPending}
            className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
          >
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            disabled={refund.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!refundTarget) return;
              refund.mutate(refundTarget.id, { onSuccess: () => setRefundTarget(null) });
            }}
          >
            {refund.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Stornieren &amp; erstatten
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <MarketplaceReturnsSection />
    </>
  );
}

function MarketplaceReturnsSection() {
  const { data: returns, isLoading } = useAdminReturns();
  const updateReturn = useUpdateReturn();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const list = returns ?? [];
  const openReturns = list.filter((r) => r.status === "requested" || r.status === "received").length;

  const saveNote = (id: string, current: string | null) => {
    const value = notes[id];
    if (value === undefined || value === (current ?? "")) return;
    updateReturn.mutate({ id, admin_note: value });
  };

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={ICON_TILE_NEUTRAL}>
            <Undo2 className="h-[15px] w-[15px]" />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            Retouren &amp; Widerrufe
          </h2>
          {openReturns > 0 && <span className={PILL_OPEN_COUNT}>{openReturns} offen</span>}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Keine Retouren vorhanden.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                  <TableHead className={TH}>Datum</TableHead>
                  <TableHead className={TH}>Bestellung</TableHead>
                  <TableHead className={TH}>Grund</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={TH}>Interne Notiz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.022]">
                    <TableCell className="whitespace-nowrap py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                      {dateFmt(r.requested_at)}
                    </TableCell>
                    <TableCell className="min-w-[160px] py-3 pr-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap font-mono text-[12.5px] text-foreground">
                          {r.order?.reference_code || r.order_id.slice(0, 8)}
                        </span>
                        <span className="max-w-[200px] truncate text-xs text-[hsl(0_0%_78%)]">
                          {r.order?.item?.name || "—"}
                        </span>
                        {r.order?.guest_email && (
                          <span className="break-all font-mono text-[10.5px] text-muted-foreground">
                            {r.order.guest_email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[180px] max-w-[280px] py-3 pr-3.5">
                      <span className="whitespace-pre-wrap text-[12.5px] text-[hsl(0_0%_78%)]">{r.reason || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3 pr-3.5">
                      <Select
                        value={r.status}
                        onValueChange={(v) => updateReturn.mutate({ id: r.id, status: v as ReturnStatus })}
                      >
                        <SelectTrigger className={`h-8 w-[160px] rounded-[9px] ${SELECT_SM} text-[12.5px]`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(RETURN_LABEL) as ReturnStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>{RETURN_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[200px] py-3">
                      <Input
                        className="h-8 rounded-[9px] border-[hsl(0_0%_14%)] bg-white/[0.04] text-[12.5px]"
                        placeholder="Notiz…"
                        value={notes[r.id] ?? r.admin_note ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                        onBlur={() => saveNote(r.id, r.admin_note)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="border-t border-[hsl(0_0%_12%)] pt-3 text-xs text-[hsl(0_0%_58%)]">
          Erstattung wie gewohnt über den Stornieren-Button der Bestellung auslösen.
        </p>
      </div>
    </Card>
  );
}
