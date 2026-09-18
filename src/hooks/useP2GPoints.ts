import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { RewardInstance, P2GRewardsResponse } from "@/types/rewards";

// Re-export for backwards compatibility
export type { RewardInstance } from "@/types/rewards";

export interface P2GSummary {
  total_points: number;
  reward_balance: number;
  skill_balance: number;
  lifetime_credits: number;
  // Explicit credit breakdown
  play_credits: number;
  booking_credits: number;
  redeemable_balance: number;
  // Skill level (0-10, average of last 5 matches)
  skill_level: number;
  claimable_reward_count: number;
  pending_reward_count: number;
  last_game_credits: number | null;
  last_game_date: string | null;
  last_skill_event: {
    match_id: string;
    delta: number;
    analyzed_at: string;
  } | null;
}

export interface MatchAnalysis {
  id: string;
  match_id: string;
  user_id: string;
  ai_score: number | null;
  manual_score: number | null;
  skill_level_snapshot: number;
  formula_version: number;
  credits_awarded: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "INVALIDATED";
  analyzed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  result: "W" | "L" | "D" | null;
  opponent_user_id: string | null;
}

export interface SkillsResponse {
  skill_balance: number;
  last_game: {
    match_id: string;
    ai_score: number | null;
    manual_score: number | null;
    skill_level: number;
    delta: number;
    analyzed_at: string | null;
    status: string;
  } | null;
  history: MatchAnalysis[];
  config: {
    formula_version: number;
    base_multiplier: number;
    max_credits_per_match: number;
    rounding_policy: string;
  } | null;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  credit_type: "REWARD" | "SKILL";
  delta_points: number;
  balance_after: number;
  entry_type: string;
  description: string | null;
  source_type: string | null;
  source_id: string | null;
  reward_instance_id: string | null;
  created_at: string;
}

export interface WeeklyStreakData {
  current_streak: number;
  best_streak: number;
  last_qualified_week: string | null;
  qualified_this_week: boolean;
  next_milestone: number;
  progress_to_next: number;
}

export interface StreaksResponse {
  weekly_booking: WeeklyStreakData;
}

export interface FeedEntry {
  id: string;
  delta: number;
  credit_type: string;
  entry_type: string;
  source_type: string | null;
  source_id: string | null;
  description: string;
  created_at: string;
  icon: string;
  label: string;
}

export interface FeedResponse {
  entries: FeedEntry[];
  total: number;
  has_more: boolean;
}

export interface LastGameResponse {
  has_game: boolean;
  last_game: {
    match_id: string;
    match_score: number;
    skill_level: number;
    play_points_delta: number;
    analyzed_at: string;
    status: string;
  } | null;
  skill_level: number;
}

export interface RankingEntry {
  rank: number;
  display_name: string;
  play_credits: number;
  is_current_user: boolean;
}

export interface RankingsResponse {
  has_age_group: boolean;
  global_rank: number | null;
  top_germany: RankingEntry[];
  top_in_age_group: RankingEntry[];
}


export interface SkillLast5Match {
  match_id: string;
  date: string;
  skill_level: number;
  match_score: number;
  play_credits_earned: number;
}

export interface SkillLast5Response {
  matches: SkillLast5Match[];
  avg_skill_level: number;
  count: number;
}

export interface CreditBreakdown {
  play_credits_total: number;
  booking_credits_total: number;
  daily_credits_total: number;
  streak_credits_total: number;
  referral_credits_total: number;
  redemptions_total: number;
  total_earned: number;
  total_balance: number;
  redeemable_balance: number;
}

export interface DailyClaimStatus {
  already_claimed: boolean;
  last_claim: {
    date: string;
    credits: number;
    claimed_at: string;
  } | null;
  total_claims: number;
  current_streak: number;
  // Derived client-side from already_claimed (kept for existing consumers)
  claimed_today: boolean;
}

export interface WLStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  unrecorded: number;
  win_rate: number | null;
  recent_form: string[];
  current_streak: { type: string | null; count: number };
  has_data: boolean;
}

export function useP2GPoints() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch summary
  const summaryQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gSummary],
    queryFn: async (): Promise<P2GSummary> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/summary", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch rewards
  const rewardsQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gRewards],
    queryFn: async (): Promise<P2GRewardsResponse> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/rewards", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch skills
  const skillsQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gSkills],
    queryFn: async (): Promise<SkillsResponse> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/skills", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch streaks
  const streaksQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gStreaks],
    queryFn: async (): Promise<StreaksResponse> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/streaks", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch last game
  const lastGameQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gLastGame],
    queryFn: async (): Promise<LastGameResponse> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/last-game", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch rankings
  const rankingsQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gRankings],
    queryFn: async (): Promise<RankingsResponse> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/rankings", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch last 5 matches with skill details
  const skillLast5Query = useQuery({
    queryKey: [QUERY_KEYS.p2gSkillLast5],
    queryFn: async (): Promise<SkillLast5Response> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/skill-last5", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch credit breakdown
  const creditBreakdownQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gCreditBreakdown],
    queryFn: async (): Promise<CreditBreakdown> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/credit-breakdown", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch daily claim status
  const dailyClaimStatusQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gDailyClaimStatus],
    queryFn: async (): Promise<DailyClaimStatus> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/daily-claim-status", {
        method: "GET",
      });
      if (error) throw error;
      return { ...data, claimed_today: !!data?.already_claimed };
    },
    enabled: !!user,
  });

  // Fetch W/L stats
  const wlStatsQuery = useQuery({
    queryKey: [QUERY_KEYS.p2gWLStats],
    queryFn: async (): Promise<WLStats> => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/wl-stats", {
        method: "GET",
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch feed with filter
  const useFeed = (filter: "all" | "booking" | "play" | "redemption" = "all", limit = 20) => {
    return useQuery({
      queryKey: [QUERY_KEYS.p2gFeed, filter, limit],
      queryFn: async (): Promise<FeedResponse> => {
        const { data, error } = await supabase.functions.invoke(`p2g-points-api/feed?filter=${filter}&limit=${limit}`, {
          method: "GET",
        });
        if (error) throw error;
        return data;
      },
      enabled: !!user,
    });
  };

  // Fetch ledger
  const useLedger = (creditType?: "REWARD" | "SKILL") => {
    return useQuery({
      queryKey: [QUERY_KEYS.p2gLedger, creditType],
      queryFn: async (): Promise<{ entries: LedgerEntry[] }> => {
        const params = creditType ? `?credit_type=${creditType}` : "";
        const { data, error } = await supabase.functions.invoke(`p2g-points-api/ledger${params}`, {
          method: "GET",
        });
        if (error) throw error;
        return data;
      },
      enabled: !!user,
    });
  };

  // Claim daily login mutation
  const claimDailyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("p2g-points-api/claim-daily", {
        method: "POST",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gDailyClaimStatus] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gSummary] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2gCreditBreakdown] });
    },
  });

  // Invalidate all queries
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.p2g] });
  };

  return {
    // Summary
    summary: summaryQuery.data,
    isSummaryLoading: summaryQuery.isLoading,
    
    // Rewards
    rewards: rewardsQuery.data,
    claimable: rewardsQuery.data?.claimable || [],
    pending: rewardsQuery.data?.pending || [],
    rewardHistory: rewardsQuery.data?.history || [],
    isRewardsLoading: rewardsQuery.isLoading,
    
    // Skills
    skills: skillsQuery.data,
    skillBalance: skillsQuery.data?.skill_balance || 0,
    lastGame: skillsQuery.data?.last_game,
    matchHistory: skillsQuery.data?.history || [],
    skillConfig: skillsQuery.data?.config,
    isSkillsLoading: skillsQuery.isLoading,
    
    // Streaks
    streaks: streaksQuery.data,
    weeklyStreak: streaksQuery.data?.weekly_booking || null,
    isStreaksLoading: streaksQuery.isLoading,
    
    // Ledger
    useLedger,
    
    // Feed
    useFeed,
    
    // Last Game
    lastGameData: lastGameQuery.data,
    isLastGameLoading: lastGameQuery.isLoading,
    
    // Rankings
    rankings: rankingsQuery.data,
    isRankingsLoading: rankingsQuery.isLoading,
    
    // Skill Last 5
    skillLast5: skillLast5Query.data,
    isSkillLast5Loading: skillLast5Query.isLoading,
    
    // Credit Breakdown
    creditBreakdown: creditBreakdownQuery.data,
    isCreditBreakdownLoading: creditBreakdownQuery.isLoading,
    
    // Daily Claim Status
    dailyClaimStatus: dailyClaimStatusQuery.data,
    isDailyClaimStatusLoading: dailyClaimStatusQuery.isLoading,
    
    // W/L Stats
    wlStats: wlStatsQuery.data,
    isWLStatsLoading: wlStatsQuery.isLoading,
    
    // Mutations
    claimDaily: claimDailyMutation.mutateAsync,
    isClaimingDaily: claimDailyMutation.isPending,
    
    // Utilities
    invalidateAll,
    isLoading: summaryQuery.isLoading || rewardsQuery.isLoading || skillsQuery.isLoading,
  };
}
