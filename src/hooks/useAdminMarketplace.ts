import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MarketplaceCategory, MarketplaceItem, ProductStatus, ProductType } from "./useMarketplaceItems";

export interface MarketplaceItemInput {
  name: string;
  category: MarketplaceCategory;
  price_cents: number;
  description: string;
  image_url: string;
  partner_name?: string;
  stock_quantity?: number | null;
  sort_order?: number;
  is_active?: boolean;
  product_type?: ProductType;
  // Phase 1 catalog extensions
  slug?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  subtitle?: string | null;
  long_description?: string | null;
  specs?: { label: string; value: string }[];
  compare_at_price_cents?: number | null;
  is_featured?: boolean;
  status?: ProductStatus;
  meta_title?: string | null;
  meta_description?: string | null;
  tax_rate?: number;
  /** Einkaufspreis netto je Stueck */
  cost_cents?: number;
  // GPSR / Kennzeichnung (columns not yet in generated types.ts)
  manufacturer_name?: string | null;
  manufacturer_address?: string | null;
  manufacturer_email?: string | null;
  eu_responsible_name?: string | null;
  eu_responsible_address?: string | null;
  eu_responsible_email?: string | null;
  product_identifier?: string | null;
  safety_warnings?: string | null;
  textile_composition?: string | null;
  delivery_days_min?: number;
  delivery_days_max?: number;
  base_price_quantity?: number | null;
  base_price_unit?: string | null;
}

// Fetch all items (including inactive) for admin
export const useAdminMarketplaceItems = () => {
  return useQuery({
    queryKey: ["admin-marketplace-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_items")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as unknown as MarketplaceItem[];
    },
  });
};

export type FulfillmentStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface MarketplaceRedemption {
  id: string;
  user_id: string;
  item_id: string;
  credit_cost: number;
  status: string;
  reference_code: string | null;
  fulfillment_status: FulfillmentStatus;
  shipping_address_line1: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  created_at: string;
  item?: {
    name: string;
    category: string;
    product_type: ProductType;
  };
  user_email?: string;
  user_display_name?: string;
}

// Fetch all redemptions for admin
export const useAdminRedemptions = () => {
  return useQuery({
    queryKey: ["admin-marketplace-redemptions"],
    queryFn: async () => {
      // Only PAID orders belong in the fulfillment queue. Orders sit at status
      // 'pending' from checkout start until the payment webhook settles them, and
      // abandoned ones become 'cancelled' — surfacing either would let an admin ship
      // a never-paid item (indistinguishable by fulfillment_status alone).
      const { data, error } = await supabase
        .from("marketplace_redemptions")
        .select(`
          *,
          item:marketplace_items(name, category, product_type)
        `)
        .eq("status", "success")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MarketplaceRedemption[];
    },
  });
};

// Update fulfillment status
export const useUpdateFulfillmentStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, fulfillment_status }: { id: string; fulfillment_status: FulfillmentStatus }) => {
      const { data, error } = await supabase
        .from("marketplace_redemptions")
        .update({ fulfillment_status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-redemptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
      toast.success("Status aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
};

// ── Full order/fulfillment view (paid + refunded/cancelled) ──────────────────
/** Ein Beleg, wie die Verwaltung ihn braucht: Nummer, Betrag, Art. */
export interface OrderReceipt {
  receipt_number: string;
  receipt_type: "marketplace_order" | "marketplace_refund";
  source_id: string;
  paid_cents: number;
  tax_cents: number;
  tax_rate: number;
  issued_at: string;
}

/**
 * Belege zu Marketplace-Bestellungen, gruppiert nach Bestellung.
 *
 * Eine eigene Abfrage, weil receipts.source_id kein Fremdschluessel ist —
 * PostgREST kann darueber nicht verknuepfen. Eine Bestellung kann ZWEI Belege
 * haben: die Rechnung und, nach einer Erstattung, die Korrekturrechnung.
 */
export const useMarketplaceReceipts = () => {
  return useQuery({
    queryKey: ["admin-marketplace-receipts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("receipts")
        .select("receipt_number, receipt_type, source_id, paid_cents, tax_cents, tax_rate, issued_at")
        .in("receipt_type", ["marketplace_order", "marketplace_refund"])
        .order("receipt_number", { ascending: true });
      if (error) throw error;

      const byOrder = new Map<string, { invoice?: OrderReceipt; credit?: OrderReceipt }>();
      for (const r of (data ?? []) as OrderReceipt[]) {
        const entry = byOrder.get(r.source_id) ?? {};
        if (r.receipt_type === "marketplace_refund") entry.credit = r;
        else entry.invoice = r;
        byOrder.set(r.source_id, entry);
      }
      return byOrder;
    },
  });
};

export interface MarketplaceOrder {
  id: string;
  status: string;
  fulfillment_status: FulfillmentStatus;
  reference_code: string | null;
  created_at: string;
  quantity: number | null;
  amount_cents: number | null;
  play_spent: number | null;
  reward_spent: number | null;
  points_balance_before: number | null;
  points_balance_after: number | null;
  guest_email: string | null;
  guest_name: string | null;
  user_id: string | null;
  shipping_address_line1: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  is_test?: boolean;
  tracking_number?: string | null;
  carrier?: string | null;
  shipped_at?: string | null;
  item?: { name: string; image_url: string | null } | null;
}

export const useAdminMarketplaceOrders = () => {
  return useQuery({
    queryKey: ["admin-marketplace-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_redemptions")
        .select(`
          id, status, fulfillment_status, reference_code, created_at, quantity,
          amount_cents, play_spent, reward_spent, points_balance_before, points_balance_after,
          guest_email, guest_name, user_id,
          shipping_address_line1, shipping_postal_code, shipping_city, shipping_country,
          tracking_number, carrier, shipped_at, is_test,
          item:marketplace_items(name, image_url)
        `)
        // 'pending' gehoert dazu: eine angefangene, unbezahlte Bestellung war
        // fuer die Verwaltung bisher unsichtbar — wer dem Kunden helfen will,
        // muss sie sehen.
        .in("status", ["pending", "success", "refunded", "cancelled"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceOrder[];
    },
    // Der Status aendert sich auch ohne Zutun der Verwaltung: ein Kunde
    // storniert, der Stripe-Webhook erstattet, der Aufraeumer laesst eine
    // Bestellung verfallen. Realtime unten holt das sofort, dieses Intervall
    // ist der Rueckfall, falls die Verbindung haengt.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
};

/**
 * Haelt die Bestellliste der Verwaltung aktuell.
 *
 * Ein Kanal je Browsertab, mit Zaehler — dieselbe Vorsicht wie bei den
 * Lobbies, auch wenn hier nur wenige Admins gleichzeitig zusehen.
 */
let ordersChannel: ReturnType<typeof supabase.channel> | null = null;
let ordersRefCount = 0;

export const useAdminOrdersRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    ordersRefCount += 1;
    if (!ordersChannel) {
      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
        queryClient.invalidateQueries({ queryKey: ["admin-marketplace-receipts"] });
      };
      ordersChannel = supabase
        .channel("admin-marketplace-orders-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_redemptions" }, refresh)
        .subscribe();
    }
    return () => {
      ordersRefCount -= 1;
      if (ordersRefCount <= 0) {
        ordersRefCount = 0;
        if (ordersChannel) { supabase.removeChannel(ordersChannel); ordersChannel = null; }
      }
    };
  }, [queryClient]);
};

/**
 * Loescht eine Testbestellung.
 *
 * Nur Testvorgaenge — die Datenbankfunktion weist alles andere ab. Ein echter
 * Geschaeftsvorfall gehoert storniert, nicht geloescht.
 */
export const useDeleteTestOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await (supabase.rpc as any)("delete_test_order", { p_order_id: orderId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      toast.success("Testbestellung gelöscht");
    },
    onError: (e: Error) => toast.error("Löschen fehlgeschlagen", { description: e.message }),
  });
};

// Admin-initiated cancellation + refund (Stripe money back + points + stock reversal)
export const useRefundMarketplaceOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke("marketplace-refund", {
        body: { order_id: orderId },
      });
      if (error) {
        let serverMessage: string | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            serverMessage = body?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        throw new Error(serverMessage || error.message);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error!);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-redemptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      toast.success("Bestellung storniert & erstattet");
    },
    onError: (error: Error) => {
      toast.error("Stornierung fehlgeschlagen: " + error.message);
    },
  });
};

// Mark order as shipped (tracking + carrier) and send shipping confirmation mail
export const useShipOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { order_id: string; tracking_number: string; carrier: string }) => {
      const { data, error } = await supabase.functions.invoke("send-marketplace-shipped", {
        body: input,
      });
      if (error) {
        let serverMessage: string | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            serverMessage = body?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        throw new Error(serverMessage || error.message);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error!);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-redemptions"] });
      toast.success("Als versendet markiert & Versandbestätigung gesendet");
    },
    onError: (error: Error) => {
      toast.error("Versand fehlgeschlagen: " + error.message);
    },
  });
};

// ── Returns / Widerrufe ──────────────────────────────────────────────────────
export type ReturnStatus = "requested" | "received" | "refunded" | "rejected";

export interface MarketplaceReturn {
  id: string;
  order_id: string;
  user_id: string | null;
  reason: string | null;
  status: ReturnStatus;
  admin_note: string | null;
  requested_at: string;
  order?: {
    reference_code: string | null;
    guest_email: string | null;
    user_id: string | null;
    item?: { name: string } | null;
  } | null;
}

export const useAdminReturns = () => {
  return useQuery({
    queryKey: ["admin-marketplace-returns"],
    queryFn: async () => {
      // marketplace_returns is not yet in generated types.ts
      const { data, error } = await (supabase as any)
        .from("marketplace_returns")
        .select(`
          *,
          order:marketplace_redemptions(reference_code, guest_email, user_id, item:marketplace_items(name))
        `)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as MarketplaceReturn[];
    },
  });
};

export const useUpdateReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; status?: ReturnStatus; admin_note?: string }) => {
      const { error } = await (supabase as any)
        .from("marketplace_returns")
        .update(fields)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-returns"] });
      toast.success("Retoure aktualisiert");
    },
    onError: (error: Error) => {
      toast.error("Fehler: " + error.message);
    },
  });
};

// Create new item
export const useCreateMarketplaceItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: MarketplaceItemInput) => {
      const { data, error } = await supabase
        .from("marketplace_items")
        // credit_cost entfaellt mit Migration 20260920100000; die generierten
        // Typen fuehren die Spalte noch als Pflichtfeld. Cast wie anderswo im Repo.
        .insert([{
          ...item,
          is_active: item.is_active ?? true,
          sort_order: item.sort_order ?? 0,
          product_type: item.product_type ?? "rental",
        } as any])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
      toast.success("Produkt erfolgreich erstellt");
    },
    onError: (error) => {
      toast.error("Fehler beim Erstellen: " + error.message);
    },
  });
};

// Update item
export const useUpdateMarketplaceItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<MarketplaceItemInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("marketplace_items")
        .update(item)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
      toast.success("Produkt erfolgreich aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler beim Aktualisieren: " + error.message);
    },
  });
};

// Delete item
export const useDeleteMarketplaceItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<"deleted" | "deactivated"> => {
      // Bestellungen (marketplace_redemptions) sind aufbewahrungspflichtige Belege und
      // referenzieren das Produkt — ein Produkt mit Bestellungen wird deshalb nur
      // deaktiviert (aus dem Shop genommen), nicht gelöscht.
      const { count, error: countError } = await supabase
        .from("marketplace_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("item_id", id);
      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        const { error } = await supabase
          .from("marketplace_items")
          .update({ is_active: false })
          .eq("id", id);
        if (error) throw error;
        return "deactivated";
      }

      const { error } = await supabase
        .from("marketplace_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return "deleted";
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
      if (result === "deactivated") {
        toast.info("Produkt hat Bestellungen – es wurde deaktiviert statt gelöscht", {
          description:
            "Bestellhistorie und Belege bleiben erhalten. Das Produkt ist im Shop nicht mehr sichtbar (Filter: Inaktiv).",
        });
      } else {
        toast.success("Produkt erfolgreich gelöscht");
      }
    },
    onError: (error) => {
      toast.error("Fehler beim Löschen: " + error.message);
    },
  });
};

// Toggle active status
export const useToggleMarketplaceItemStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from("marketplace_items")
        .update({ is_active })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
      toast.success(data.is_active ? "Produkt aktiviert" : "Produkt deaktiviert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
};
