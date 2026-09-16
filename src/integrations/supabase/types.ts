export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_activity_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      admin_broadcasts: {
        Row: {
          admin_user_id: string
          created_at: string | null
          cta_label: string | null
          cta_url: string | null
          expires_at: string | null
          id: string
          message: string
          recipients_count: number | null
          target_type: string
          target_user_ids: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          expires_at?: string | null
          id?: string
          message: string
          recipients_count?: number | null
          target_type: string
          target_user_ids?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          recipients_count?: number | null
          target_type?: string
          target_user_ids?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_player_analytics: {
        Row: {
          data: Json | null
          has_ai_data: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          data?: Json | null
          has_ai_data?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json | null
          has_ai_data?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_visual_assets: {
        Row: {
          asset_type: string
          created_at: string | null
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string | null
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string | null
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_participants: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          invited_user_id: string
          invited_username: string
          inviter_user_id: string
          paid_at: string | null
          share_fraction: number | null
          share_price_cents: number | null
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          invited_user_id: string
          invited_username: string
          inviter_user_id: string
          paid_at?: string | null
          share_fraction?: number | null
          share_price_cents?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          invited_user_id?: string
          invited_username?: string
          inviter_user_id?: string
          paid_at?: string | null
          share_fraction?: number | null
          share_price_cents?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_players: {
        Row: {
          booking_id: string
          created_at: string
          display_name: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_players_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          allocation_minutes: number | null
          booked_for_member_name: string | null
          booked_for_member_user_id: string | null
          booking_origin: string
          cancelled_at: string | null
          club_booked_by_user_id: string | null
          club_id: string | null
          club_owner_id: string | null
          court_id: string
          created_at: string
          currency: string | null
          end_time: string
          hold_expires_at: string | null
          id: string
          is_free_allocation: boolean
          location_id: string
          notes: string | null
          payment_mode: string | null
          price_cents: number | null
          reminder_sent_1h: string | null
          reminder_sent_24h: string | null
          rewards_processed_at: string | null
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Insert: {
          allocation_minutes?: number | null
          booked_for_member_name?: string | null
          booked_for_member_user_id?: string | null
          booking_origin?: string
          cancelled_at?: string | null
          club_booked_by_user_id?: string | null
          club_id?: string | null
          club_owner_id?: string | null
          court_id: string
          created_at?: string
          currency?: string | null
          end_time: string
          hold_expires_at?: string | null
          id?: string
          is_free_allocation?: boolean
          location_id: string
          notes?: string | null
          payment_mode?: string | null
          price_cents?: number | null
          reminder_sent_1h?: string | null
          reminder_sent_24h?: string | null
          rewards_processed_at?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Update: {
          allocation_minutes?: number | null
          booked_for_member_name?: string | null
          booked_for_member_user_id?: string | null
          booking_origin?: string
          cancelled_at?: string | null
          club_booked_by_user_id?: string | null
          club_id?: string | null
          club_owner_id?: string | null
          court_id?: string
          created_at?: string
          currency?: string | null
          end_time?: string
          hold_expires_at?: string | null
          id?: string
          is_free_allocation?: boolean
          location_id?: string
          notes?: string | null
          payment_mode?: string | null
          price_cents?: number | null
          reminder_sent_1h?: string | null
          reminder_sent_24h?: string | null
          rewards_processed_at?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_api_keys: {
        Row: {
          api_key_hash: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          location_id: string
          name: string
          salt: string | null
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          location_id: string
          name: string
          salt?: string | null
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          location_id?: string
          name?: string
          salt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_api_keys_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_session_players: {
        Row: {
          created_at: string
          id: string
          match_analysis_id: string | null
          position: string
          scanned_at: string
          session_id: string
          team: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_analysis_id?: string | null
          position: string
          scanned_at?: string
          session_id: string
          team: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_analysis_id?: string | null
          position?: string
          scanned_at?: string
          session_id?: string
          team?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_session_players_match_analysis_id_fkey"
            columns: ["match_analysis_id"]
            isOneToOne: false
            referencedRelation: "match_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "camera_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_sessions: {
        Row: {
          booking_id: string | null
          court_id: string
          created_at: string
          ended_at: string | null
          error_message: string | null
          id: string
          processed_at: string | null
          raw_data: Json | null
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          court_id: string
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          raw_data?: Json | null
          session_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          court_id?: string
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          raw_data?: Json | null
          session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_sessions_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_court_assignments: {
        Row: {
          allowed_booking_windows: Json | null
          club_id: string
          court_id: string
          created_at: string
          id: string
          monthly_free_minutes: number
          updated_at: string
        }
        Insert: {
          allowed_booking_windows?: Json | null
          club_id: string
          court_id: string
          created_at?: string
          id?: string
          monthly_free_minutes?: number
          updated_at?: string
        }
        Update: {
          allowed_booking_windows?: Json | null
          club_id?: string
          court_id?: string
          created_at?: string
          id?: string
          monthly_free_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_court_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_court_assignments_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_owner_assignments: {
        Row: {
          allowed_booking_windows: Json | null
          court_id: string
          created_at: string
          id: string
          monthly_free_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_booking_windows?: Json | null
          court_id: string
          created_at?: string
          id?: string
          monthly_free_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_booking_windows?: Json | null
          court_id?: string
          created_at?: string
          id?: string
          monthly_free_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_owner_assignments_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_quota_ledger: {
        Row: {
          booking_id: string | null
          club_id: string | null
          club_owner_id: string
          court_id: string
          created_at: string
          id: string
          minutes_refunded: number
          minutes_used: number
          month_start_date: string
        }
        Insert: {
          booking_id?: string | null
          club_id?: string | null
          club_owner_id: string
          court_id: string
          created_at?: string
          id?: string
          minutes_refunded?: number
          minutes_used?: number
          month_start_date: string
        }
        Update: {
          booking_id?: string | null
          club_id?: string | null
          club_owner_id?: string
          court_id?: string
          created_at?: string
          id?: string
          minutes_refunded?: number
          minutes_used?: number
          month_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_quota_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_quota_ledger_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_quota_ledger_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_users: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_active: boolean
          role_in_club: string
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role_in_club?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role_in_club?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_users_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_contact_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_contact_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_contact_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      court_prices: {
        Row: {
          court_id: string | null
          created_at: string
          duration_minutes: number
          id: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          court_id?: string | null
          created_at?: string
          duration_minutes: number
          id?: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          court_id?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_prices_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_claims: {
        Row: {
          claim_date: string
          created_at: string
          credits_awarded: number
          id: string
          user_id: string
        }
        Insert: {
          claim_date: string
          created_at?: string
          credits_awarded?: number
          id?: string
          user_id: string
        }
        Update: {
          claim_date?: string
          created_at?: string
          credits_awarded?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      event_artists: {
        Row: {
          created_at: string
          event_id: string
          id: string
          image_url: string | null
          instagram_url: string | null
          name: string
          role: string
          sort_order: number | null
          spotify_url: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          name: string
          role?: string
          sort_order?: number | null
          spotify_url?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          name?: string
          role?: string
          sort_order?: number | null
          spotify_url?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_brands: {
        Row: {
          brand_type: string
          created_at: string
          event_id: string
          id: string
          instagram_url: string | null
          logo_url: string | null
          name: string
          sort_order: number | null
          website_url: string | null
        }
        Insert: {
          brand_type?: string
          created_at?: string
          event_id: string
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name: string
          sort_order?: number | null
          website_url?: string | null
        }
        Update: {
          brand_type?: string
          created_at?: string
          event_id?: string
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name?: string
          sort_order?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_brands_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address_line1: string | null
          capacity: number | null
          city: string | null
          created_at: string
          description: string | null
          end_at: string | null
          event_type: string | null
          featured: boolean
          highlights: string[] | null
          id: string
          image_url: string | null
          is_published: boolean
          location_id: string
          location_url: string | null
          postal_code: string | null
          price_cents: number | null
          price_label: string | null
          slug: string | null
          start_at: string | null
          ticket_url: string
          title: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          address_line1?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string | null
          featured?: boolean
          highlights?: string[] | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          location_id: string
          location_url?: string | null
          postal_code?: string | null
          price_cents?: number | null
          price_label?: string | null
          slug?: string | null
          start_at?: string | null
          ticket_url: string
          title: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          address_line1?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string | null
          featured?: boolean
          highlights?: string[] | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          location_id?: string
          location_url?: string | null
          postal_code?: string | null
          price_cents?: number | null
          price_label?: string | null
          slug?: string | null
          start_at?: string | null
          ticket_url?: string
          title?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_levels_config: {
        Row: {
          created_at: string | null
          description: string | null
          emoji: string | null
          gradient: string | null
          id: number
          max_points: number | null
          min_points: number
          name: string
          perks: string[] | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          gradient?: string | null
          id?: number
          max_points?: number | null
          min_points: number
          name: string
          perks?: string[] | null
          sort_order: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          gradient?: string | null
          id?: number
          max_points?: number | null
          min_points?: number
          name?: string
          perks?: string[] | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: []
      }
      lobbies: {
        Row: {
          booking_id: string | null
          capacity: number
          court_id: string
          created_at: string | null
          currency: string
          description: string | null
          end_time: string
          host_user_id: string
          id: string
          is_private: boolean | null
          location_id: string
          price_per_player_cents: number
          price_total_cents: number
          skill_max: number
          skill_min: number
          start_time: string
          status: string
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          capacity?: number
          court_id: string
          created_at?: string | null
          currency?: string
          description?: string | null
          end_time: string
          host_user_id: string
          id?: string
          is_private?: boolean | null
          location_id: string
          price_per_player_cents: number
          price_total_cents: number
          skill_max?: number
          skill_min?: number
          start_time: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          capacity?: number
          court_id?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          end_time?: string
          host_user_id?: string
          id?: string
          is_private?: boolean | null
          location_id?: string
          price_per_player_cents?: number
          price_total_cents?: number
          skill_max?: number
          skill_min?: number
          start_time?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobbies_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobbies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_events: {
        Row: {
          actor_id: string | null
          created_at: string | null
          event_type: string
          id: string
          lobby_id: string
          metadata: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          lobby_id: string
          metadata?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          lobby_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lobby_events_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_events_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobby_stats"
            referencedColumns: ["lobby_id"]
          },
        ]
      }
      lobby_members: {
        Row: {
          created_at: string | null
          id: string
          lobby_id: string
          paid_at: string | null
          payment_intent_id: string | null
          reserved_until: string | null
          status: string
          stripe_checkout_session_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lobby_id: string
          paid_at?: string | null
          payment_intent_id?: string | null
          reserved_until?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lobby_id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          reserved_until?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_members_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_members_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobby_stats"
            referencedColumns: ["lobby_id"]
          },
        ]
      }
      location_teasers: {
        Row: {
          city: string | null
          club_url: string | null
          created_at: string | null
          description: string | null
          expected_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          club_url?: string | null
          created_at?: string | null
          description?: string | null
          expected_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          club_url?: string | null
          created_at?: string | null
          description?: string | null
          expected_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          ai_analysis_enabled: boolean
          amenities: string[] | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          features_json: Json | null
          gallery_image_urls: string[] | null
          id: string
          is_24_7: boolean
          is_online: boolean
          lat: number | null
          lng: number | null
          main_image_url: string | null
          name: string
          opening_hours_json: Json
          postal_code: string | null
          rewards_enabled: boolean
          slug: string
          timezone: string
          updated_at: string
          vending_enabled: boolean
        }
        Insert: {
          address?: string | null
          ai_analysis_enabled?: boolean
          amenities?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          features_json?: Json | null
          gallery_image_urls?: string[] | null
          id?: string
          is_24_7?: boolean
          is_online?: boolean
          lat?: number | null
          lng?: number | null
          main_image_url?: string | null
          name: string
          opening_hours_json?: Json
          postal_code?: string | null
          rewards_enabled?: boolean
          slug: string
          timezone?: string
          updated_at?: string
          vending_enabled?: boolean
        }
        Update: {
          address?: string | null
          ai_analysis_enabled?: boolean
          amenities?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          features_json?: Json | null
          gallery_image_urls?: string[] | null
          id?: string
          is_24_7?: boolean
          is_online?: boolean
          lat?: number | null
          lng?: number | null
          main_image_url?: string | null
          name?: string
          opening_hours_json?: Json
          postal_code?: string | null
          rewards_enabled?: boolean
          slug?: string
          timezone?: string
          updated_at?: string
          vending_enabled?: boolean
        }
        Relationships: []
      }
      marketplace_items: {
        Row: {
          category: string
          created_at: string | null
          credit_cost: number
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          partner_name: string | null
          product_type: string
          sort_order: number | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          credit_cost: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          partner_name?: string | null
          product_type?: string
          sort_order?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          credit_cost?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          partner_name?: string | null
          product_type?: string
          sort_order?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_redemptions: {
        Row: {
          created_at: string | null
          credit_cost: number
          fulfillment_status: string
          id: string
          item_id: string
          reference_code: string | null
          shipping_address_line1: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal_code: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credit_cost: number
          fulfillment_status?: string
          id?: string
          item_id: string
          reference_code?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          credit_cost?: number
          fulfillment_status?: string
          id?: string
          item_id?: string
          reference_code?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_redemptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
        ]
      }
      match_analyses: {
        Row: {
          ai_score: number | null
          analyzed_at: string | null
          created_at: string
          credits_awarded: number
          formula_version: number
          id: string
          manual_score: number | null
          match_id: string
          metadata: Json | null
          opponent_user_id: string | null
          result: string | null
          skill_level_snapshot: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_score?: number | null
          analyzed_at?: string | null
          created_at?: string
          credits_awarded?: number
          formula_version?: number
          id?: string
          manual_score?: number | null
          match_id: string
          metadata?: Json | null
          opponent_user_id?: string | null
          result?: string | null
          skill_level_snapshot?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_score?: number | null
          analyzed_at?: string | null
          created_at?: string
          credits_awarded?: number
          formula_version?: number
          id?: string
          manual_score?: number | null
          match_id?: string
          metadata?: Json | null
          opponent_user_id?: string | null
          result?: string | null
          skill_level_snapshot?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_opt_in_settings: {
        Row: {
          availability_json: Json | null
          created_at: string
          id: string
          is_active: boolean
          preferred_location_ids: string[] | null
          skill_range_max: number | null
          skill_range_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          availability_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          preferred_location_ids?: string[] | null
          skill_range_max?: number | null
          skill_range_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          availability_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          preferred_location_ids?: string[] | null
          skill_range_max?: number | null
          skill_range_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_suggestions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          location_id: string | null
          match_reason: string | null
          matched_user_id: string
          responded_at: string | null
          score: number | null
          status: string
          suggested_at: string
          suggested_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          location_id?: string | null
          match_reason?: string | null
          matched_user_id: string
          responded_at?: string | null
          score?: number | null
          status?: string
          suggested_at?: string
          suggested_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          location_id?: string | null
          match_reason?: string | null
          matched_user_id?: string
          responded_at?: string | null
          score?: number | null
          status?: string
          suggested_at?: string
          suggested_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_suggestions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          broadcast_id: string | null
          created_at: string | null
          cta_url: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          broadcast_id?: string | null
          created_at?: string | null
          cta_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          broadcast_id?: string | null
          created_at?: string | null
          cta_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "admin_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tiles: {
        Row: {
          bg_color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          partner_type: string
          region: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          bg_color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          partner_type?: string
          region?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          bg_color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          partner_type?: string
          region?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_total_cents: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total_cents: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total_cents?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          balance_after: number
          created_at: string | null
          credit_type: string
          delta_points: number
          description: string | null
          entry_type: string
          id: string
          reward_instance_id: string | null
          source_id: string | null
          source_type: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string | null
          credit_type?: string
          delta_points: number
          description?: string | null
          entry_type: string
          id?: string
          reward_instance_id?: string | null
          source_id?: string | null
          source_type?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string | null
          credit_type?: string
          delta_points?: number
          description?: string | null
          entry_type?: string
          id?: string
          reward_instance_id?: string | null
          source_id?: string | null
          source_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_reward_instance_id_fkey"
            columns: ["reward_instance_id"]
            isOneToOne: false
            referencedRelation: "reward_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email_verified_at: string | null
          games_played_self: number | null
          phone_verified_at: string | null
          profile_completed_at: string | null
          referral_code: string | null
          shipping_address_line1: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal_code: string | null
          skill_self_rating: number | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_verified_at?: string | null
          games_played_self?: number | null
          phone_verified_at?: string | null
          profile_completed_at?: string | null
          referral_code?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          skill_self_rating?: number | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_verified_at?: string | null
          games_played_self?: number | null
          phone_verified_at?: string | null
          profile_completed_at?: string | null
          referral_code?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          skill_self_rating?: number | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      referral_attributions: {
        Row: {
          created_at: string | null
          first_booking_at: string | null
          id: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          signup_completed_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_booking_at?: string | null
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          signup_completed_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_booking_at?: string | null
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
          signup_completed_at?: string | null
        }
        Relationships: []
      }
      reward_definitions: {
        Row: {
          approval_required: boolean
          awarding_mode: string
          caps: Json | null
          category: string
          created_at: string | null
          description: string | null
          display_rule_text: string | null
          expiry_days: number | null
          is_active: boolean | null
          key: string
          lock_policy: Json | null
          points_rule: Json
          title: string
        }
        Insert: {
          approval_required?: boolean
          awarding_mode?: string
          caps?: Json | null
          category: string
          created_at?: string | null
          description?: string | null
          display_rule_text?: string | null
          expiry_days?: number | null
          is_active?: boolean | null
          key: string
          lock_policy?: Json | null
          points_rule?: Json
          title: string
        }
        Update: {
          approval_required?: boolean
          awarding_mode?: string
          caps?: Json | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_rule_text?: string | null
          expiry_days?: number | null
          is_active?: boolean | null
          key?: string
          lock_policy?: Json | null
          points_rule?: Json
          title?: string
        }
        Relationships: []
      }
      reward_instances: {
        Row: {
          available_at: string | null
          claimed_at: string | null
          created_at: string | null
          definition_key: string
          expires_at: string | null
          id: string
          metadata: Json | null
          points: number
          reversed_at: string | null
          source_id: string
          source_type: string
          status: string
          user_id: string
        }
        Insert: {
          available_at?: string | null
          claimed_at?: string | null
          created_at?: string | null
          definition_key: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          points: number
          reversed_at?: string | null
          source_id: string
          source_type: string
          status?: string
          user_id: string
        }
        Update: {
          available_at?: string | null
          claimed_at?: string | null
          created_at?: string | null
          definition_key?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          points?: number
          reversed_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_instances_definition_key_fkey"
            columns: ["definition_key"]
            isOneToOne: false
            referencedRelation: "reward_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      site_settings: {
        Row: {
          credits_payment_max_percent: number
          credits_per_euro: number
          feature_booking_state: string
          feature_courts_public_enabled: boolean
          feature_credits_payment_enabled: boolean
          feature_events_state: string
          feature_friends_state: string
          feature_league_state: string
          feature_lobbies_state: string
          feature_marketplace_state: string
          feature_p2g_state: string
          id: string
          launch_date: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          credits_payment_max_percent?: number
          credits_per_euro?: number
          feature_booking_state?: string
          feature_courts_public_enabled?: boolean
          feature_credits_payment_enabled?: boolean
          feature_events_state?: string
          feature_friends_state?: string
          feature_league_state?: string
          feature_lobbies_state?: string
          feature_marketplace_state?: string
          feature_p2g_state?: string
          id?: string
          launch_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          credits_payment_max_percent?: number
          credits_per_euro?: number
          feature_booking_state?: string
          feature_courts_public_enabled?: boolean
          feature_credits_payment_enabled?: boolean
          feature_events_state?: string
          feature_friends_state?: string
          feature_league_state?: string
          feature_lobbies_state?: string
          feature_marketplace_state?: string
          feature_p2g_state?: string
          id?: string
          launch_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_visuals: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          key: string
          label: string
          placeholder_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          key: string
          label: string
          placeholder_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          key?: string
          label?: string
          placeholder_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      skill_credits_config: {
        Row: {
          base_multiplier: number
          created_at: string
          formula_version: number
          id: string
          is_active: boolean
          max_credits_per_match: number
          metadata: Json | null
          rounding_policy: string
          updated_at: string
        }
        Insert: {
          base_multiplier?: number
          created_at?: string
          formula_version?: number
          id?: string
          is_active?: boolean
          max_credits_per_match?: number
          metadata?: Json | null
          rounding_policy?: string
          updated_at?: string
        }
        Update: {
          base_multiplier?: number
          created_at?: string
          formula_version?: number
          id?: string
          is_active?: boolean
          max_credits_per_match?: number
          metadata?: Json | null
          rounding_policy?: string
          updated_at?: string
        }
        Relationships: []
      }
      skill_stats: {
        Row: {
          ai_rank: number | null
          last_ai_update: string | null
          skill_level: number | null
          user_id: string
        }
        Insert: {
          ai_rank?: number | null
          last_ai_update?: string | null
          skill_level?: number | null
          user_id: string
        }
        Update: {
          ai_rank?: number | null
          last_ai_update?: string | null
          skill_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      skypadel_gallery: {
        Row: {
          alt_text: string | null
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          best_streak: number
          created_at: string
          current_streak: number
          id: string
          last_bonus_milestone: number | null
          last_qualified_date: string | null
          streak_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_bonus_milestone?: number | null
          last_qualified_date?: string | null
          streak_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_bonus_milestone?: number | null
          last_qualified_date?: string | null
          streak_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voucher_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          user_id: string
          voucher_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          user_id: string
          voucher_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          user_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "voucher_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          last_game_credits: number | null
          last_game_date: string | null
          lifetime_credits: number
          play_credits: number
          reward_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_game_credits?: number | null
          last_game_date?: string | null
          lifetime_credits?: number
          play_credits?: number
          reward_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_game_credits?: number | null
          last_game_date?: string | null
          lifetime_credits?: number
          play_credits?: number
          reward_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_availability: {
        Row: {
          court_id: string | null
          end_time: string | null
          location_id: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
        }
        Insert: {
          court_id?: string | null
          end_time?: string | null
          location_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Update: {
          court_id?: string | null
          end_time?: string | null
          location_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_stats: {
        Row: {
          avg_skill: number | null
          capacity: number | null
          lobby_id: string | null
          members_count: number | null
          paid_count: number | null
          reserved_count: number | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_expired_bookings: { Args: never; Returns: number }
      cleanup_expired_notifications: { Args: never; Returns: number }
      cleanup_rate_limit_log: { Args: never; Returns: undefined }
      get_user_club_id: { Args: { p_user_id: string }; Returns: string }
      get_user_rewards_balance: { Args: { p_user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_club_member: { Args: { p_user_id: string }; Returns: boolean }
      is_lobby_host: {
        Args: { _lobby_id: string; _user_id: string }
        Returns: boolean
      }
      is_lobby_member: {
        Args: { _lobby_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "club_owner"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "pending_payment"
        | "expired"
        | "completed"
        | "refunded"
      friendship_status:
        | "pending"
        | "accepted"
        | "declined"
        | "blocked"
        | "cancelled"
      lobby_event_type:
        | "member_joined"
        | "member_paid"
        | "member_left"
        | "member_expired"
        | "lobby_full"
        | "lobby_cancelled"
        | "lobby_expired"
        | "lobby_created"
      lobby_member_status:
        | "reserved"
        | "joined"
        | "paid"
        | "cancelled"
        | "expired"
      lobby_status: "open" | "full" | "cancelled" | "expired" | "completed"
      participant_status: "pending_invite" | "accepted" | "declined" | "paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "club_owner"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "pending_payment",
        "expired",
        "completed",
        "refunded",
      ],
      friendship_status: [
        "pending",
        "accepted",
        "declined",
        "blocked",
        "cancelled",
      ],
      lobby_event_type: [
        "member_joined",
        "member_paid",
        "member_left",
        "member_expired",
        "lobby_full",
        "lobby_cancelled",
        "lobby_expired",
        "lobby_created",
      ],
      lobby_member_status: [
        "reserved",
        "joined",
        "paid",
        "cancelled",
        "expired",
      ],
      lobby_status: ["open", "full", "cancelled", "expired", "completed"],
      participant_status: ["pending_invite", "accepted", "declined", "paid"],
    },
  },
} as const
