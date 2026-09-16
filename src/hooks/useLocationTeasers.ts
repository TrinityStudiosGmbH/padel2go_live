import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LocationTeaser {
  id: string;
  title: string;
  title_en: string | null;
  title_en_locked: boolean;
  description: string | null;
  description_en: string | null;
  description_en_locked: boolean;
  image_url: string | null;
  city: string | null;
  city_en: string | null;
  city_en_locked: boolean;
  expected_date: string | null;
  expected_date_en: string | null;
  expected_date_en_locked: boolean;
  club_url: string | null;
  whatsapp_group_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useLocationTeasers() {
  return useQuery({
    queryKey: ["location-teasers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_teasers" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LocationTeaser[];
    },
  });
}

export function useAllLocationTeasers() {
  return useQuery({
    queryKey: ["location-teasers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_teasers" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LocationTeaser[];
    },
  });
}
