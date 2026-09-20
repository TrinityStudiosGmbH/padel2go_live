import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";

export interface ShippingAddress {
  address_line1: string;
  postal_code: string;
  city: string;
  country: string;
}

interface CheckoutParams {
  itemId: string;
  itemName: string;
  pointsToUse?: number;
  quantity?: number;
  voucherId?: string | null;
  shipping?: ShippingAddress;
  guestEmail?: string;
  guestName?: string;
}

interface CheckoutResponse {
  url?: string | null;
  free?: boolean;
  reference_code?: string;
  error?: string;
}

export const useMarketplaceCheckout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      pointsToUse,
      quantity,
      voucherId,
      shipping,
      guestEmail,
      guestName,
    }: CheckoutParams): Promise<CheckoutResponse> => {
      const { data, error } = await supabase.functions.invoke("marketplace-checkout", {
        body: {
          item_id: itemId,
          points_to_use: pointsToUse ?? 0,
          quantity: quantity ?? 1,
          ...(voucherId ? { voucher_id: voucherId } : {}),
          ...(shipping ? { shipping } : {}),
          ...(guestEmail ? { guest_email: guestEmail } : {}),
          ...(guestName ? { guest_name: guestName } : {}),
        },
      });

      if (error) {
        // FunctionsHttpError carries the non-2xx Response — surface the server's German message.
        let serverMessage: string | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            serverMessage = body?.error ?? null;
          } catch {
            /* ignore parse errors — fall back to the generic error message */
          }
        }
        throw new Error(serverMessage || error.message);
      }
      if (data?.error) throw new Error(data.error);

      return data as CheckoutResponse;
    },
    onSuccess: (data, variables) => {
      // Remainder charged via Stripe — redirect to the hosted checkout.
      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      // Points covered the whole price — the order is already placed server-side.
      toast.success(`${variables.itemName} erfolgreich gekauft!`, {
        description: data?.reference_code ? `Referenz: ${data.reference_code}` : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["account-data"] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.marketplaceRedemptions] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.marketplaceItems] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gCreditBreakdown] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gFeed] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gSummary] });
    },
    onError: (error: Error) => {
      toast.error("Kauf fehlgeschlagen", {
        description: error.message || "Bitte versuche es später erneut.",
      });
    },
  });
};
