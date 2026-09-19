import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Package, ShoppingBag, ArrowRight, Coins, MapPin,
  Clock, Truck, PackageCheck, XCircle, RotateCcw, Image as ImageIcon, CreditCard,
} from "lucide-react";
import { useUserRedemptions, type UserRedemption } from "@/hooks/useUserRedemptions";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { eur } from "@/lib/marketplace";
import { StorageImage } from "@/components/StorageImage";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

type StatusView = { label: string; icon: typeof Clock; className: string };

function statusView(o: UserRedemption): StatusView {
  if (o.status === "pending")
    return { label: "Zahlung offen", icon: CreditCard, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (o.status === "refunded")
    return { label: "Erstattet", icon: RotateCcw, className: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (o.status === "cancelled")
    return { label: "Storniert", icon: XCircle, className: "bg-muted text-muted-foreground border-border" };
  switch (o.fulfillment_status) {
    case "shipped":
      return { label: "Versandt", icon: Truck, className: "bg-primary/15 text-primary border-primary/30" };
    case "delivered":
      return { label: "Geliefert", icon: PackageCheck, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    default:
      return { label: "In Bearbeitung", icon: Clock, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  }
}

const RETURN_BADGE: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  received: "bg-primary/15 text-primary border-primary/30",
  refunded: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function AccountOrdersTab() {
  const { t } = useTranslation("account");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useUserRedemptions();

  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [resumingId, setResumingId] = useState<string | null>(null);

  /**
   * Zurueck in die angefangene Zahlung. Wir rufen dieselbe Kasse noch einmal
   * auf; sie erkennt die laufende Bestellung und gibt die BESTEHENDE
   * Stripe-Sitzung zurueck, legt also keine zweite an. Eine doppelte Abbuchung
   * ist damit ausgeschlossen.
   */
  const resumePayment = async (order: UserRedemption) => {
    setResumingId(order.id);
    try {
      const { data, error } = await invokeEdgeFunction<{ url?: string; error?: string }>(
        "marketplace-checkout",
        { body: { item_id: order.item_id, quantity: order.quantity ?? 1 } },
      );
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data?.error || error?.message || "Die Zahlung konnte nicht fortgesetzt werden.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResumingId(null);
    }
  };

  const { data: returns } = useQuery({
    queryKey: ["marketplace-returns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("marketplace_returns")
        .select("order_id,status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return rows as { order_id: string; status: string }[];
    },
  });
  const returnByOrder = new Map((returns ?? []).map((r) => [r.order_id, r.status]));

  const requestReturn = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { error } = await (supabase as any).from("marketplace_returns").insert({
        order_id: orderId,
        user_id: user!.id,
        reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("orders.return.successToast"));
      setReturnOrderId(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["marketplace-returns", user?.id] });
    },
    onError: () => {
      toast.error(t("orders.return.errorToast"));
    },
  });

  // Offene Bestellungen gehoeren SICHTBAR hierher. Frueher waren sie
  // ausgefiltert: wer den Bezahlvorgang abgebrochen hat, sah nichts mehr davon
  // und kam 45 Minuten lang auch nicht weiter, weil die Kasse den Artikel als
  // belegt meldete. Nur wirklich fehlgeschlagene Versuche bleiben verborgen.
  const orders = (data ?? []).filter((o) =>
    ["success", "refunded", "cancelled", "pending"].includes(o.status),
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 rounded-2xl border border-border bg-card">
        <span className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Package className="w-7 h-7 text-muted-foreground" />
        </span>
        <h3 className="text-lg font-semibold">Noch keine Bestellungen</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Sobald du im Marketplace bestellst, findest du hier deine Bestellungen und den Versandstatus.
        </p>
        <Button asChild variant="lime" className="mt-1">
          <Link to="/marketplace" className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            Zum Marketplace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o, i) => {
        const sv = statusView(o);
        const Icon = sv.icon;
        const pointsSpent = (o.play_spent ?? 0) + (o.reward_spent ?? 0);
        const hasAddress = !!o.shipping_address_line1;
        // Tracking columns not yet in generated types.ts
        const tracking = (o as any).tracking_number as string | null;
        const carrier = (o as any).carrier as string | null;
        const returnStatus = returnByOrder.get(o.id);
        return (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.3) }}
            className="rounded-2xl border border-border bg-card p-4 sm:p-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                {o.item?.image_url ? (
                  <StorageImage src={o.item.image_url} renderWidth={200} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{o.item?.name || "Produkt"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {dateFmt(o.created_at)} · Menge {o.quantity ?? 1}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 gap-1.5 ${sv.className}`}>
                    <Icon className="w-3 h-3" />
                    {sv.label}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                  <span className="font-mono font-semibold">{eur(o.amount_cents)}</span>
                  {pointsSpent > 0 && (
                    <span className="inline-flex items-center gap-1 text-primary text-xs">
                      <Coins className="w-3.5 h-3.5" />
                      {pointsSpent.toLocaleString("de-DE")} Punkte
                    </span>
                  )}
                  {o.reference_code && (
                    <span className="font-mono text-xs text-muted-foreground">Nr. {o.reference_code}</span>
                  )}
                </div>

                {/* Ab bezahlt gibt es die Rechnung. Eine stornierte oder offene
                    Bestellung hat keinen Beleg, dort waere der Knopf eine Sackgasse. */}
                {(o.status === "success" || o.status === "refunded") && (
                  <div className="mt-3">
                    <InvoiceDownloadButton sourceId={o.id} receiptType="marketplace_order" className="gap-1.5" />
                  </div>
                )}

                {o.status === "pending" && (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
                    <span className="text-[13px] leading-relaxed text-amber-200/90">
                      Diese Bestellung ist noch nicht bezahlt. Es wurde nichts abgebucht.
                    </span>
                    <Button
                      size="sm"
                      variant="lime"
                      className="w-fit gap-2"
                      disabled={resumingId === o.id}
                      onClick={() => resumePayment(o)}
                    >
                      {resumingId === o.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      Jetzt bezahlen
                    </Button>
                  </div>
                )}

                {hasAddress && (
                  <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      {o.shipping_address_line1}, {o.shipping_postal_code} {o.shipping_city}
                    </span>
                  </div>
                )}

                {tracking && (
                  <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <Truck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="font-mono">{[carrier, tracking].filter(Boolean).join(" · ")}</span>
                  </div>
                )}

                {o.status === "refunded" && (
                  <p className="text-xs text-red-400 mt-2">
                    Diese Bestellung wurde storniert und erstattet. Eingelöste Punkte wurden zurückgebucht.
                  </p>
                )}

                {o.status === "success" && hasAddress && (
                  returnStatus ? (
                    <Badge variant="outline" className={`mt-3 gap-1.5 ${RETURN_BADGE[returnStatus] ?? RETURN_BADGE.requested}`}>
                      <RotateCcw className="w-3 h-3" />
                      {t(`orders.return.status.${returnStatus}`)}
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 text-xs"
                      onClick={() => setReturnOrderId(o.id)}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      {t("orders.return.reportButton")}
                    </Button>
                  )
                )}
              </div>
            </div>
          </motion.div>
        );
      })}

      <Dialog
        open={!!returnOrderId}
        onOpenChange={(open) => {
          if (!open) {
            setReturnOrderId(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.return.dialogTitle")}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="orders.return.dialogBody"
                components={{ 1: <Link to="/widerruf" className="underline text-primary" /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("orders.return.reasonPlaceholder")}
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnOrderId(null)}>
              {t("orders.return.cancel")}
            </Button>
            <Button
              variant="lime"
              disabled={requestReturn.isPending}
              onClick={() => returnOrderId && requestReturn.mutate({ orderId: returnOrderId, reason })}
            >
              {requestReturn.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("orders.return.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
