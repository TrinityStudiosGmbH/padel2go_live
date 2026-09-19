import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarketplaceCategory = "courtbooking" | "equipment" | "other" | "events";
export type ProductType = "rental" | "purchase";
export type ProductStatus = "draft" | "published";

export interface MarketplaceItem {
  id: string;
  name: string;
  category: MarketplaceCategory;
  price_cents: number | null;
  description: string | null;
  partner_name: string | null;
  image_url: string | null;
  is_active: boolean;
  stock_quantity: number | null;
  sort_order: number;
  product_type: ProductType;
  // Phase 1 catalog extensions (not yet in generated types.ts)
  slug?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  subtitle?: string | null;
  long_description?: string | null;
  specs?: { label: string; value: string }[] | null;
  compare_at_price_cents?: number | null;
  is_featured?: boolean | null;
  status?: ProductStatus | null;
  meta_title?: string | null;
  meta_description?: string | null;
}

export const useMarketplaceItems = (category?: MarketplaceCategory) => {
  return useQuery({
    queryKey: ["marketplace-items", category],
    queryFn: async () => {
      let query = supabase
        .from("marketplace_items")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as MarketplaceItem[];
    },
  });
};
