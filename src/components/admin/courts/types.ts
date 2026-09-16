// Re-export shared constants for backwards compatibility
export { WEEKDAYS } from "@/types/constants";
// Re-export centralized query keys
export { QUERY_KEYS } from "@/lib/queryKeys";

export type CourtSport = "padel" | "tennis";

export const SPORT_LABEL: Record<CourtSport, string> = {
  padel: "Padel",
  tennis: "Tennis",
};

/**
 * Sportart eines Courts. Alles, was nicht ausdrücklich Tennis ist, gilt als
 * Padel — genau wie der DB-Default. So bleiben Bestandsdaten ohne `sport`
 * (z. B. aus einem noch nicht neu geladenen Cache) korrekt zugeordnet.
 */
export const courtSport = (court: { sport?: string | null }): CourtSport =>
  court.sport === "tennis" ? "tennis" : "padel";

/** Pill auf dunklem Bild-Header (AdminCourtCard). Tennis = Hellblau, Padel = Lime. */
export const SPORT_PILL_CLASSES: Record<CourtSport, string> = {
  padel: "border-primary/40 text-primary",
  tennis: "border-[hsl(200_100%_75%/0.45)] text-[#7FD4FF]",
};

/** Chip auf Kartenfläche (AdminLocationCard, Dialoge). */
export const SPORT_CHIP_CLASSES: Record<CourtSport, string> = {
  padel: "border-primary/30 bg-primary/10 text-primary",
  tennis: "border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]",
};

export interface Location {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  is_online: boolean;
  is_24_7: boolean;
  postal_code: string | null;
  city: string | null;
  country: string;
  main_image_url: string | null;
  tennis_image_url: string | null;
  whatsapp_group_url: string | null;
  opening_hours_json: Record<string, { open: string; close: string }>;
  rewards_enabled: boolean;
  ai_analysis_enabled: boolean;
  vending_enabled: boolean;
  features_json: {
    wifi?: boolean;
    accessible?: boolean;
    family_friendly?: boolean;
  } | null;
  courts: {
    id: string;
    name: string;
    is_active: boolean;
    location_id: string;
    sport?: string | null;
  }[];
}
