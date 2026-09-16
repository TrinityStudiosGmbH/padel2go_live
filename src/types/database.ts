/**
 * Database entity types - represent the full row structure from Supabase tables.
 * These include all columns like user_id, timestamps, etc.
 * 
 * For UI-specific view models that omit certain fields (like user_id),
 * see src/components/account/types.ts
 */

// ============================================
// User-related tables
// ============================================

export interface DbProfile {
  user_id: string;
  username: string | null;
  display_name: string | null;
  age: number | null;
  avatar_url: string | null;
  games_played_self: number | null;
  skill_self_rating: number | null;
  shipping_address_line1: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  referral_code: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWallet {
  user_id: string;
  play_credits: number;
  reward_credits: number;
  lifetime_credits: number;
  last_game_credits: number | null;
  last_game_date: string | null;
  updated_at: string;
}

export interface DbSkillStats {
  user_id: string;
  skill_level: number | null;
  ai_rank: number | null;
  last_ai_update: string | null;
}

// ============================================
// Location & Court tables
// ============================================

export interface DbLocation {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  is_online: boolean;
  is_24_7: boolean;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  main_image_url: string | null;
  opening_hours_json: Record<string, { open: string; close: string }>;
  rewards_enabled: boolean;
  ai_analysis_enabled: boolean;
  vending_enabled: boolean;
  features_json: Record<string, boolean | undefined> | null;
  whatsapp_group_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface DbCourt {
  id: string;
  location_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

// ============================================
// Booking tables
// ============================================

export interface DbBooking {
  id: string;
  user_id: string;
  court_id: string;
  location_id: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "pending_payment" | "expired";
  price_cents: number | null;
  currency: string | null;
  hold_expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

// ============================================
// Event tables
// ============================================

export interface DbEvent {
  id: string;
  location_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  ticket_url: string;
  start_at: string | null;
  end_at: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}
