import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[P2G-POINTS-API] ${step}`, details ? JSON.stringify(details) : "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "summary";

    logStep("Processing request", { action });

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // PUBLIC ENDPOINT: /catalog - Get all active reward definitions (no auth required)
    // Accepts both GET and POST for compatibility with supabase.functions.invoke()
    if (action === "catalog") {
      const { data: definitions, error } = await adminClient
        .from("reward_definitions")
        .select("key, title, description, category, points_rule, awarding_mode, approval_required, display_rule_text, caps")
        .eq("is_active", true)
        .order("category", { ascending: true });

      if (error) {
        logStep("Catalog query error", { error: error.message });
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Format for frontend display
      const catalog = definitions?.map((def) => {
        const pointsRule = def.points_rule as { type: string; value: number };
        const caps = def.caps as { daily?: number; monthly?: number; total?: number } | null;

        let pointsDisplay = "";
        if (pointsRule.type === "fixed") {
          pointsDisplay = `+${pointsRule.value} Credits`;
        } else if (pointsRule.type === "percentage") {
          pointsDisplay = `${pointsRule.value}% des Buchungswerts`;
        }

        let capsDisplay = null;
        if (caps) {
          const parts = [];
          if (caps.daily) parts.push(`${caps.daily}x/Tag`);
          if (caps.monthly) parts.push(`${caps.monthly}x/Monat`);
          if (caps.total) parts.push(`${caps.total}x gesamt`);
          if (parts.length > 0) capsDisplay = parts.join(", ");
        }

        return {
          key: def.key,
          title: def.title,
          description: def.description,
          category: def.category,
          points_display: pointsDisplay,
          points_value: pointsRule.value,
          points_type: pointsRule.type,
          is_auto: def.awarding_mode === "AUTO_CLAIM",
          needs_approval: def.approval_required,
          how_to_earn: def.display_rule_text,
          caps_display: capsDisplay,
        };
      }) || [];

      // Group by category
      const grouped = catalog.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      }, {} as Record<string, typeof catalog>);

      return new Response(
        JSON.stringify({ catalog, grouped }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All other endpoints require authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      logStep("Auth error", { error: authError?.message });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated user", { userId: user.id });

    // GET /summary - Get total points, balances, counts
    if (action === "summary" && req.method === "GET") {
      // Get wallet data including last_game info
      const { data: wallet } = await adminClient
        .from("wallets")
        .select("reward_credits, play_credits, lifetime_credits, last_game_credits, last_game_date")
        .eq("user_id", user.id)
        .maybeSingle();

      // Get skill_level from skill_stats
      const { data: skillStats } = await adminClient
        .from("skill_stats")
        .select("skill_level")
        .eq("user_id", user.id)
        .maybeSingle();

      // Fallback: Calculate skill_level from match_analyses if skill_stats is empty
      let skillLevel = skillStats?.skill_level || 0;
      if (!skillLevel || skillLevel === 0) {
        const { data: recentMatches } = await adminClient
          .from("match_analyses")
          .select("skill_level_snapshot")
          .eq("user_id", user.id)
          .eq("status", "COMPLETED")
          .order("analyzed_at", { ascending: false })
          .limit(5);
        
        if (recentMatches && recentMatches.length > 0) {
          const avgSkillLevel = recentMatches.reduce((sum, m) => sum + (m.skill_level_snapshot || 0), 0) / recentMatches.length;
          skillLevel = Math.round(avgSkillLevel * 10) / 10;
          logStep("Calculated skill_level from match_analyses", { userId: user.id, skillLevel, matchCount: recentMatches.length });
        }
      }

      // Get skill balance from points_ledger with credit_type SKILL
      const { data: skillLedger } = await adminClient
        .from("points_ledger")
        .select("delta_points")
        .eq("user_id", user.id)
        .eq("credit_type", "SKILL");

      const skillBalance = skillLedger?.reduce((sum, entry) => sum + (entry.delta_points || 0), 0) || 0;
      
      // Explicit credit breakdown
      const playCredits = wallet?.play_credits || 0;
      const bookingCredits = wallet?.reward_credits || 0;
      const redeemableBalance = playCredits + bookingCredits;

      // Get claimable and pending reward counts
      const { data: claimable } = await adminClient
        .from("reward_instances")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "AVAILABLE");

      const { data: pending } = await adminClient
        .from("reward_instances")
        .select("id")
        .eq("user_id", user.id)
        .in("status", ["PENDING", "PENDING_APPROVAL"]);

      // Get last skill event
      const { data: lastSkillEvent } = await adminClient
        .from("match_analyses")
        .select("match_id, credits_awarded, analyzed_at")
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          total_points: redeemableBalance + skillBalance,
          reward_balance: redeemableBalance,
          skill_balance: skillBalance,
          lifetime_credits: wallet?.lifetime_credits || 0,
          // NEW: Explicit credit breakdown for dashboard
          play_credits: playCredits,
          booking_credits: bookingCredits,
          redeemable_balance: redeemableBalance,
          // Skill level with fallback calculation
          skill_level: skillLevel,
          last_game_credits: wallet?.last_game_credits || null,
          last_game_date: wallet?.last_game_date || null,
          claimable_reward_count: claimable?.length || 0,
          pending_reward_count: pending?.length || 0,
          last_skill_event: lastSkillEvent
            ? {
                match_id: lastSkillEvent.match_id,
                delta: lastSkillEvent.credits_awarded,
                analyzed_at: lastSkillEvent.analyzed_at,
              }
            : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /rewards - Get reward instances grouped by status
    if (action === "rewards" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      // Get claimable rewards
      const { data: claimableData } = await adminClient
        .from("reward_instances")
        .select("*, reward_definitions(key, title, description, category, awarding_mode, approval_required)")
        .eq("user_id", user.id)
        .eq("status", "AVAILABLE")
        .order("created_at", { ascending: false });

      // Get pending rewards (PENDING or PENDING_APPROVAL)
      const { data: pendingData } = await adminClient
        .from("reward_instances")
        .select("*, reward_definitions(key, title, description, category, awarding_mode, approval_required)")
        .eq("user_id", user.id)
        .in("status", ["PENDING", "PENDING_APPROVAL"])
        .order("created_at", { ascending: false });

      // Get history (claimed, reversed, expired, rejected)
      const { data: historyData } = await adminClient
        .from("reward_instances")
        .select("*, reward_definitions(key, title, description, category, awarding_mode, approval_required)")
        .eq("user_id", user.id)
        .in("status", ["CLAIMED", "REVERSED", "EXPIRED", "REJECTED"])
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Get reward balance
      const { data: wallet } = await adminClient
        .from("wallets")
        .select("reward_credits, play_credits")
        .eq("user_id", user.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          reward_balance: (wallet?.reward_credits || 0) + (wallet?.play_credits || 0),
          claimable: claimableData || [],
          pending: pendingData || [],
          history: historyData || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /skills - Get skill credits history
    if (action === "skills" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      // Get skill balance from ledger
      const { data: skillLedger } = await adminClient
        .from("points_ledger")
        .select("delta_points")
        .eq("user_id", user.id)
        .eq("credit_type", "SKILL");

      const skillBalance = skillLedger?.reduce((sum, entry) => sum + (entry.delta_points || 0), 0) || 0;

      // Get last game analysis
      const { data: lastGame } = await adminClient
        .from("match_analyses")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get match history
      const { data: matchHistory } = await adminClient
        .from("match_analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Get skill config
      const { data: config } = await adminClient
        .from("skill_credits_config")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      return new Response(
        JSON.stringify({
          skill_balance: skillBalance,
          last_game: lastGame
            ? {
                match_id: lastGame.match_id,
                ai_score: lastGame.ai_score,
                manual_score: lastGame.manual_score,
                skill_level: lastGame.skill_level_snapshot,
                delta: lastGame.credits_awarded,
                analyzed_at: lastGame.analyzed_at,
                status: lastGame.status,
              }
            : null,
          history: matchHistory || [],
          config: config || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /ledger - Get full points ledger
    if (action === "ledger" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const creditType = url.searchParams.get("credit_type"); // REWARD or SKILL

      let query = adminClient
        .from("points_ledger")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (creditType) {
        query = query.eq("credit_type", creditType);
      }

      const { data: entries, error } = await query;

      if (error) {
        logStep("Ledger query error", { error: error.message });
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ entries: entries || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /skill-credit - Award skill credits (for match analysis results)
    // ADMIN ONLY: prevents arbitrary users from minting credits with invented match ids
    if (action === "skill-credit" && req.method === "POST") {
      const { data: adminRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      const isSuperadmin = user.email === "fsteinfelder@padel2go.eu";

      if (!adminRole && !isSuperadmin) {
        logStep("Skill credit denied - admin role required", { userId: user.id });
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { match_id, ai_score, manual_score } = await req.json();

      if (!match_id) {
        return new Response(JSON.stringify({ error: "match_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const score = manual_score ?? ai_score;
      if (score === undefined || score === null) {
        return new Response(JSON.stringify({ error: "ai_score or manual_score required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user's current skill level
      const { data: skillStats } = await adminClient
        .from("skill_stats")
        .select("skill_level")
        .eq("user_id", user.id)
        .maybeSingle();

      const skillLevel = skillStats?.skill_level || 0;

      // Get config
      const { data: config } = await adminClient
        .from("skill_credits_config")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      const baseMultiplier = config?.base_multiplier || 1.0;
      const maxCredits = config?.max_credits_per_match || 500;
      const roundingPolicy = config?.rounding_policy || "floor";
      const formulaVersion = config?.formula_version || 1;

      // Calculate credits: skill_level * score * multiplier
      let rawCredits = skillLevel * score * baseMultiplier;
      
      // Apply rounding
      let credits: number;
      switch (roundingPolicy) {
        case "ceil":
          credits = Math.ceil(rawCredits);
          break;
        case "round":
          credits = Math.round(rawCredits);
          break;
        default:
          credits = Math.floor(rawCredits);
      }

      // Apply max cap
      credits = Math.min(credits, maxCredits);

      // Check for existing analysis (idempotency)
      const { data: existingAnalysis } = await adminClient
        .from("match_analyses")
        .select("id")
        .eq("match_id", match_id)
        .eq("user_id", user.id)
        .eq("formula_version", formulaVersion)
        .maybeSingle();

      if (existingAnalysis) {
        return new Response(JSON.stringify({ error: "Match already analyzed with this formula version" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create match analysis record
      const { data: analysis, error: analysisError } = await adminClient
        .from("match_analyses")
        .insert({
          match_id,
          user_id: user.id,
          ai_score,
          manual_score,
          skill_level_snapshot: skillLevel,
          formula_version: formulaVersion,
          credits_awarded: credits,
          status: "COMPLETED",
          analyzed_at: new Date().toISOString(),
          metadata: { base_multiplier: baseMultiplier, rounding_policy: roundingPolicy },
        })
        .select()
        .single();

      if (analysisError) {
        logStep("Analysis insert error", { error: analysisError.message });
        return new Response(JSON.stringify({ error: analysisError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current balance
      const { data: currentLedger } = await adminClient
        .from("points_ledger")
        .select("delta_points")
        .eq("user_id", user.id)
        .eq("credit_type", "SKILL");

      const currentBalance = currentLedger?.reduce((sum, e) => sum + (e.delta_points || 0), 0) || 0;

      // Create ledger entry
      await adminClient.from("points_ledger").insert({
        user_id: user.id,
        credit_type: "SKILL",
        delta_points: credits,
        balance_after: currentBalance + credits,
        entry_type: "AUTO_CREDIT",
        description: `Skill credits for match ${match_id}`,
        source_type: "match_analysis",
        source_id: analysis.id,
      });

      // Update wallet play_credits
      const { data: wallet } = await adminClient
        .from("wallets")
        .select("play_credits, lifetime_credits")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wallet) {
        await adminClient
          .from("wallets")
          .update({
            play_credits: (wallet.play_credits || 0) + credits,
            lifetime_credits: (wallet.lifetime_credits || 0) + credits,
          })
          .eq("user_id", user.id);
      }

      // Create notification
      await adminClient.from("notifications").insert({
        user_id: user.id,
        type: "SKILL_CREDITED",
        title: "Skill-Credits erhalten!",
        message: `Du hast ${credits} Skill-Credits für dein Spiel erhalten.`,
        metadata: { match_id, credits, analysis_id: analysis.id },
        cta_url: "/dashboard/p2g-points",
      });

      logStep("Skill credits awarded", { userId: user.id, matchId: match_id, credits });

      return new Response(
        JSON.stringify({
          success: true,
          credits_awarded: credits,
          analysis,
          new_skill_balance: currentBalance + credits,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /streaks - Get user's streak data
    if (action === "streaks" && req.method === "GET") {
      const { data: streaks } = await adminClient
        .from("user_streaks")
        .select("*")
        .eq("user_id", user.id);

      // Calculate progress to next milestone
      const weeklyStreak = streaks?.find(s => s.streak_type === "WEEKLY_BOOKING");
      const currentStreak = weeklyStreak?.current_streak || 0;
      const bestStreak = weeklyStreak?.best_streak || 0;
      const lastQualifiedWeek = weeklyStreak?.last_qualified_week || null;

      // Determine next milestone
      let nextMilestone = 3;
      if (currentStreak >= 3) nextMilestone = 5;
      if (currentStreak >= 5) nextMilestone = 10;
      if (currentStreak >= 10) nextMilestone = 20;

      // Check if current week already qualified
      const now = new Date();
      const getISOWeek = (date: Date): string => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      };
      const currentISOWeek = getISOWeek(now);
      const qualifiedThisWeek = lastQualifiedWeek === currentISOWeek;

      return new Response(
        JSON.stringify({
          weekly_booking: {
            current_streak: currentStreak,
            best_streak: bestStreak,
            last_qualified_week: lastQualifiedWeek,
            qualified_this_week: qualifiedThisWeek,
            next_milestone: nextMilestone,
            progress_to_next: Math.min(100, (currentStreak / nextMilestone) * 100),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /feed - Get unified activity feed with filters
    if (action === "feed" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const filter = url.searchParams.get("filter") || "all"; // all, booking, play, redemption

      logStep("Feed request", { limit, offset, filter });

      // Build query based on filter
      let query = adminClient
        .from("points_ledger")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (filter === "booking") {
        query = query.eq("credit_type", "REWARD");
      } else if (filter === "play") {
        query = query.eq("credit_type", "SKILL");
      } else if (filter === "redemption") {
        query = query.eq("entry_type", "REDEMPTION");
      }

      // Get total count
      const { count } = await adminClient
        .from("points_ledger")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get paginated entries
      const { data: entries, error: feedError } = await query.range(offset, offset + limit - 1);

      if (feedError) {
        logStep("Feed query error", { error: feedError.message });
        return new Response(JSON.stringify({ error: feedError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Format entries for frontend
      const formattedEntries = (entries || []).map((entry) => {
        let icon = "gift";
        let label = "Reward";
        
        if (entry.credit_type === "SKILL") {
          icon = "zap";
          label = "Play";
        } else if (entry.entry_type === "REDEMPTION") {
          icon = "shopping-bag";
          label = "Einlösung";
        } else if (entry.source_type === "booking") {
          icon = "calendar";
          label = "Buchung";
        } else if (entry.source_type === "referral") {
          icon = "users";
          label = "Empfehlung";
        }

        return {
          id: entry.id,
          delta: entry.delta_points,
          credit_type: entry.credit_type,
          entry_type: entry.entry_type,
          source_type: entry.source_type,
          source_id: entry.source_id,
          description: entry.description || `${entry.delta_points > 0 ? "+" : ""}${entry.delta_points} Credits`,
          created_at: entry.created_at,
          icon,
          label,
        };
      });

      return new Response(
        JSON.stringify({
          entries: formattedEntries,
          total: count || 0,
          has_more: (offset + limit) < (count || 0),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /last-game - Get last game analysis details
    if (action === "last-game" && req.method === "GET") {
      // Get user's skill level (read-only)
      const { data: skillStats } = await adminClient
        .from("skill_stats")
        .select("skill_level")
        .eq("user_id", user.id)
        .maybeSingle();

      // Get last match analysis
      const { data: lastGame } = await adminClient
        .from("match_analyses")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastGame) {
        return new Response(
          JSON.stringify({
            has_game: false,
            last_game: null,
            skill_level: skillStats?.skill_level || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          has_game: true,
          last_game: {
            match_id: lastGame.match_id,
            match_score: lastGame.ai_score || lastGame.manual_score || 0,
            skill_level: lastGame.skill_level_snapshot,
            play_points_delta: lastGame.credits_awarded,
            analyzed_at: lastGame.analyzed_at,
            status: lastGame.status,
          },
          skill_level: skillStats?.skill_level || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // NEW ENDPOINTS: Phase 1.2 P2G-Points Refactoring
    // ============================================================

    // POST /claim-daily - Daily Login Claim
    if (action === "claim-daily" && req.method === "POST") {
      logStep("Daily claim request", { userId: user.id });

      // Get current date (server-side, Europe/Berlin date)
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

      // Check if already claimed today
      const { data: existingClaim } = await adminClient
        .from("daily_claims")
        .select("id")
        .eq("user_id", user.id)
        .eq("claim_date", today)
        .maybeSingle();

      if (existingClaim) {
        logStep("Daily claim already exists", { userId: user.id, date: today });
        return new Response(
          JSON.stringify({ 
            error: "already_claimed", 
            message: "Du hast heute bereits deinen Daily Bonus abgeholt.",
            claim_date: today 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get credits amount from reward_definitions or use default
      const { data: rewardDef } = await adminClient
        .from("reward_definitions")
        .select("points_rule")
        .eq("key", "DAILY_LOGIN")
        .eq("is_active", true)
        .maybeSingle();

      const pointsRule = rewardDef?.points_rule as { type: string; value: number } | null;
      const creditsAmount = pointsRule?.value || 5; // Default 5 credits

      // Insert daily claim
      const { error: claimError } = await adminClient
        .from("daily_claims")
        .insert({
          user_id: user.id,
          claim_date: today,
          credits_awarded: creditsAmount,
        });

      if (claimError) {
        logStep("Daily claim insert error", { error: claimError.message });
        return new Response(
          JSON.stringify({ error: claimError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get current reward balance for ledger entry
      const { data: currentLedger } = await adminClient
        .from("points_ledger")
        .select("delta_points")
        .eq("user_id", user.id)
        .eq("credit_type", "REWARD");

      const currentBalance = currentLedger?.reduce((sum, e) => sum + (e.delta_points || 0), 0) || 0;

      // Create ledger entry
      await adminClient.from("points_ledger").insert({
        user_id: user.id,
        credit_type: "REWARD",
        delta_points: creditsAmount,
        balance_after: currentBalance + creditsAmount,
        entry_type: "AUTO_CREDIT",
        description: "Daily Login Bonus",
        source_type: "DAILY_LOGIN",
        source_id: today,
      });

      // Update wallet reward_credits
      const { data: wallet } = await adminClient
        .from("wallets")
        .select("reward_credits, lifetime_credits")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wallet) {
        await adminClient
          .from("wallets")
          .update({
            reward_credits: (wallet.reward_credits || 0) + creditsAmount,
            lifetime_credits: (wallet.lifetime_credits || 0) + creditsAmount,
          })
          .eq("user_id", user.id);
      }

      // Create notification
      await adminClient.from("notifications").insert({
        user_id: user.id,
        type: "DAILY_CLAIM",
        title: "Daily Bonus erhalten!",
        message: `+${creditsAmount} Credits für deinen täglichen Login!`,
        metadata: { credits: creditsAmount, claim_date: today },
        cta_url: "/dashboard/marketplace",
      });

      logStep("Daily claim successful", { userId: user.id, credits: creditsAmount, date: today });

      return new Response(
        JSON.stringify({
          success: true,
          credits_awarded: creditsAmount,
          claim_date: today,
          new_balance: currentBalance + creditsAmount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /skill-last5 - Get last 5 matches with skill level details
    if (action === "skill-last5" && req.method === "GET") {
      logStep("Skill last 5 request", { userId: user.id });

      const { data: last5Matches, error: matchError } = await adminClient
        .from("match_analyses")
        .select("id, match_id, skill_level_snapshot, ai_score, manual_score, credits_awarded, analyzed_at, result, opponent_user_id")
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .order("analyzed_at", { ascending: false })
        .limit(5);

      if (matchError) {
        logStep("Skill last 5 query error", { error: matchError.message });
        return new Response(
          JSON.stringify({ error: matchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const matches = last5Matches || [];
      
      // Calculate average skill level
      const avgSkillLevel = matches.length > 0
        ? matches.reduce((sum, m) => sum + (m.skill_level_snapshot || 0), 0) / matches.length
        : 0;

      // Format response
      const formattedMatches = matches.map((m) => ({
        id: m.id,
        match_id: m.match_id,
        date: m.analyzed_at,
        skill_level: m.skill_level_snapshot,
        match_score: m.ai_score || m.manual_score || 0,
        play_credits_earned: m.credits_awarded,
        result: m.result || null,
        opponent_user_id: m.opponent_user_id || null,
      }));

      return new Response(
        JSON.stringify({
          matches: formattedMatches,
          count: matches.length,
          avg_skill_level: Math.round(avgSkillLevel * 10) / 10,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /credit-breakdown - Get full credit breakdown by source type
    if (action === "credit-breakdown" && req.method === "GET") {
      logStep("Credit breakdown request", { userId: user.id });

      // Get all ledger entries grouped by source_type
      const { data: ledgerEntries, error: ledgerError } = await adminClient
        .from("points_ledger")
        .select("source_type, delta_points, credit_type")
        .eq("user_id", user.id);

      if (ledgerError) {
        logStep("Credit breakdown query error", { error: ledgerError.message });
        return new Response(
          JSON.stringify({ error: ledgerError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate totals by source type
      let playCreditsTotal = 0;
      let bookingCreditsTotal = 0;
      let dailyCreditsTotal = 0;
      let streakCreditsTotal = 0;
      let referralCreditsTotal = 0;
      let redemptionsTotal = 0;

      for (const entry of ledgerEntries || []) {
        const amount = entry.delta_points || 0;
        const sourceType = entry.source_type || "";

        // Play credits = SKILL type entries (match analysis)
        if (entry.credit_type === "SKILL" || sourceType === "match_analysis" || sourceType === "PLAY_MATCH") {
          playCreditsTotal += amount;
        }
        // Booking payback
        else if (sourceType === "booking" || sourceType === "BOOKING_PAYBACK" || sourceType === "BOOKING_PAID") {
          bookingCreditsTotal += amount;
        }
        // Daily login
        else if (sourceType === "DAILY_LOGIN") {
          dailyCreditsTotal += amount;
        }
        // Streak bonus
        else if (sourceType === "WEEKLY_STREAK" || sourceType.includes("streak")) {
          streakCreditsTotal += amount;
        }
        // Referral
        else if (sourceType === "referral" || sourceType === "REFERRAL" || sourceType === "REFERRAL_SIGNUP") {
          referralCreditsTotal += amount;
        }
        // Redemptions (negative amounts)
        else if (sourceType === "REDEMPTION" || sourceType === "marketplace_redemption") {
          redemptionsTotal += amount; // Already negative
        }
      }

      // Calculate totals
      const totalEarned = playCreditsTotal + bookingCreditsTotal + dailyCreditsTotal + streakCreditsTotal + referralCreditsTotal;
      const totalBalance = totalEarned + redemptionsTotal; // redemptionsTotal is negative
      const redeemableBalance = Math.max(0, totalBalance);

      return new Response(
        JSON.stringify({
          play_credits_total: playCreditsTotal,
          booking_credits_total: bookingCreditsTotal,
          daily_credits_total: dailyCreditsTotal,
          streak_credits_total: streakCreditsTotal,
          referral_credits_total: referralCreditsTotal,
          redemptions_total: Math.abs(redemptionsTotal),
          total_earned: totalEarned,
          total_balance: totalBalance,
          redeemable_balance: redeemableBalance,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /daily-claim-status - Check if user can claim today
    if (action === "daily-claim-status" && req.method === "GET") {
      const berlinDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
      const today = berlinDate(new Date());
      const yesterday = berlinDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const { data: existingClaim } = await adminClient
        .from("daily_claims")
        .select("id, claim_date, credits_awarded, created_at")
        .eq("user_id", user.id)
        .eq("claim_date", today)
        .maybeSingle();

      // Get total daily claims count
      const { count: totalClaims } = await adminClient
        .from("daily_claims")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get streak info
      const { data: recentClaims } = await adminClient
        .from("daily_claims")
        .select("claim_date")
        .eq("user_id", user.id)
        .order("claim_date", { ascending: false })
        .limit(30);

      // Calculate current streak
      let currentStreak = 0;
      if (recentClaims && recentClaims.length > 0) {
        const dates = recentClaims.map(c => new Date(c.claim_date));
        const todayDate = new Date(today);

        for (let i = 0; i < dates.length; i++) {
          const expectedDate = new Date(todayDate);
          expectedDate.setDate(todayDate.getDate() - i);

          const claimDateStr = dates[i].toISOString().split("T")[0];
          const expectedDateStr = expectedDate.toISOString().split("T")[0];

          if (claimDateStr === expectedDateStr || (i === 0 && existingClaim)) {
            currentStreak++;
          } else if (i === 0 && !existingClaim) {
            // Today not claimed yet, check if yesterday was claimed
            if (claimDateStr === yesterday) {
              currentStreak = 1; // Yesterday (dates[0]) claimed, streak continues if claimed today
              // Continue counting from the day BEFORE yesterday (dates[0] already counted above)
              for (let j = 1; j < dates.length; j++) {
                const checkDate = new Date(todayDate);
                checkDate.setDate(todayDate.getDate() - 1 - j);
                const checkDateStr = checkDate.toISOString().split("T")[0];
                const actualDateStr = dates[j].toISOString().split("T")[0];
                if (checkDateStr === actualDateStr) {
                  currentStreak++;
                } else {
                  break;
                }
              }
            }
            break;
          } else {
            break;
          }
        }
      }

      return new Response(
        JSON.stringify({
          already_claimed: !!existingClaim,
          claim_date: today,
          last_claim: existingClaim ? {
            date: existingClaim.claim_date,
            credits: existingClaim.credits_awarded,
            claimed_at: existingClaim.created_at,
          } : null,
          total_claims: totalClaims || 0,
          current_streak: currentStreak,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /rankings - Get league rankings for various categories
    // SECURITY: Limits data exposure by only fetching necessary records
    if (action === "rankings" && req.method === "GET") {
      logStep("Fetching rankings for user", { userId: user.id });
      
      const RANKING_LIMIT = 10; // Max users per ranking category
      
      // Get current user's profile for age group filtering
      const { data: currentProfile } = await adminClient
        .from("profiles")
        .select("user_id, display_name, age")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const currentUserAge = currentProfile?.age || null;
      
      // Punktestand des Nutzers fuer den Gesamtrang
      const { data: currentWallet } = await adminClient
        .from("wallets")
        .select("play_credits")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const currentPlayCredits = currentWallet?.play_credits || 0;
      
      // SECURITY FIX: Only fetch top N wallets for global ranking, not all users
      const { data: topWallets, error: walletsError } = await adminClient
        .from("wallets")
        .select("user_id, play_credits")
        .order("play_credits", { ascending: false })
        .limit(RANKING_LIMIT);
      
      if (walletsError) {
        logStep("Wallets query error", { error: walletsError.message });
        return new Response(JSON.stringify({ error: walletsError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Get global rank by counting users with more play_credits
      const { count: usersAhead } = await adminClient
        .from("wallets")
        .select("user_id", { count: "exact", head: true })
        .gt("play_credits", currentPlayCredits);
      
      const globalRank = (usersAhead || 0) + 1;
      
      // Collect unique user IDs we need profiles for (only users in rankings)
      const neededUserIds = new Set<string>();
      topWallets?.forEach(w => neededUserIds.add(w.user_id));
      neededUserIds.add(user.id); // Always include current user
      
      // SECURITY FIX: Only fetch profiles for users in rankings, not all users
      // Only fetch display_name, not username or age (privacy)
      const { data: neededProfiles } = await adminClient
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", Array.from(neededUserIds));
      
      const profileMap = new Map(neededProfiles?.map(p => [p.user_id, p]) || []);
      
      // SECURITY FIX: Build ranking entry without exposing sensitive data
      const buildRankingEntry = (wallet: { user_id: string; play_credits: number }, rank: number) => {
        const profile = profileMap.get(wallet.user_id);
        const isCurrentUser = wallet.user_id === user.id;
        return {
          rank,
          display_name: profile?.display_name || "Padel Player",
          play_credits: wallet.play_credits,
          is_current_user: isCurrentUser,
        };
      };
      
      // Top Germany (limited to RANKING_LIMIT)
      const topGermany = (topWallets || [])
        .map((w, idx) => buildRankingEntry(w, idx + 1));
      
      // Age group ranking - only if user has age set
      // SECURITY: Use server-side filtering, don't expose other users' ages
      let topInAgeGroup: ReturnType<typeof buildRankingEntry>[] = [];
      if (currentUserAge) {
        // Fetch profiles with age in range, then join with wallets
        const { data: ageGroupProfiles } = await adminClient
          .from("profiles")
          .select("user_id")
          .gte("age", currentUserAge - 5)
          .lte("age", currentUserAge + 5)
          .not("age", "is", null);
        
        if (ageGroupProfiles && ageGroupProfiles.length > 0) {
          const ageGroupUserIds = ageGroupProfiles.map(p => p.user_id);
          
          const { data: ageGroupWallets } = await adminClient
            .from("wallets")
            .select("user_id, play_credits")
            .in("user_id", ageGroupUserIds)
            .order("play_credits", { ascending: false })
            .limit(RANKING_LIMIT);
          
          // Fetch display names for age group users
          if (ageGroupWallets && ageGroupWallets.length > 0) {
            const ageGroupWalletUserIds = ageGroupWallets.map(w => w.user_id);
            const { data: ageGroupDisplayNames } = await adminClient
              .from("profiles")
              .select("user_id, display_name")
              .in("user_id", ageGroupWalletUserIds);
            
            const ageGroupProfileMap = new Map(ageGroupDisplayNames?.map(p => [p.user_id, p]) || []);
            
            topInAgeGroup = ageGroupWallets.map((w, idx) => {
              const profile = ageGroupProfileMap.get(w.user_id);
              return {
                rank: idx + 1,
                display_name: profile?.display_name || "Padel Player",
                play_credits: w.play_credits,
                is_current_user: w.user_id === user.id,
              };
            });
          }
        }
      }
      
      logStep("Rankings built", {
        topGermanyCount: topGermany.length,
        topInAgeGroupCount: topInAgeGroup.length,
        globalRank,
      });
      
      return new Response(
        JSON.stringify({
          // SECURITY: Don't expose current user's exact age, just whether age group is available
          has_age_group: currentUserAge !== null,
          global_rank: globalRank,
          top_germany: topGermany,
          top_in_age_group: topInAgeGroup,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /wl-stats - Get Win/Loss statistics
    if (action === "wl-stats" && req.method === "GET") {
      logStep("Getting W/L stats for user", { userId: user.id });
      
      // Get all completed matches with results
      const { data: matches, error: matchesError } = await adminClient
        .from("match_analyses")
        .select("id, result, analyzed_at")
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .order("analyzed_at", { ascending: false });
      
      if (matchesError) {
        logStep("Error fetching matches", { error: matchesError.message });
        return new Response(JSON.stringify({ error: matchesError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Calculate stats
      const totalMatches = matches?.length || 0;
      const wins = matches?.filter(m => m.result === "W").length || 0;
      const losses = matches?.filter(m => m.result === "L").length || 0;
      const draws = matches?.filter(m => m.result === "D").length || 0;
      const unrecorded = matches?.filter(m => !m.result).length || 0;
      
      // Calculate win rate (avoid division by zero)
      const recordedMatches = wins + losses + draws;
      const winRate = recordedMatches > 0 ? Math.round((wins / recordedMatches) * 100) : null;
      
      // Get recent form (last 5 matches with results)
      const recentForm = matches
        ?.filter(m => m.result)
        .slice(0, 5)
        .map(m => m.result) || [];
      
      // Calculate current streak
      let currentStreak = { type: null as string | null, count: 0 };
      if (recentForm.length > 0) {
        const firstResult = recentForm[0];
        currentStreak.type = firstResult;
        for (const result of recentForm) {
          if (result === firstResult) {
            currentStreak.count++;
          } else {
            break;
          }
        }
      }
      
      logStep("W/L stats calculated", { totalMatches, wins, losses, draws, winRate });
      
      return new Response(
        JSON.stringify({
          total_matches: totalMatches,
          wins,
          losses,
          draws,
          unrecorded,
          win_rate: winRate,
          recent_form: recentForm,
          current_streak: currentStreak,
          has_data: recordedMatches > 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logStep("Error", { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
