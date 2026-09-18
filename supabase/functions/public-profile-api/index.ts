import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, username, userId } = body;

    // Attempt auth when an Authorization header is present. The 'profile'
    // action is public (/u/:username works without login — response only
    // contains public fields); all other actions require a valid user.
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const authHeader = req.headers.get("Authorization");

    let user = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data, error: authError } = await authClient.auth.getUser(token);
      if (!authError && data?.user) {
        user = data.user;
      }
    }

    if (action !== "profile" && !user) {
      return new Response(
        JSON.stringify({ error: authHeader ? "Invalid authentication" : "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "profile" && username) {
      console.log(`[public-profile-api] Fetching profile for username: ${username}`);

      // Get profile by username
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, created_at, games_played_self")
        .eq("username", username)
        .single();

      // PGRST116 = no rows found → 404; anything else is a real DB error → 500
      if (profileError && profileError.code !== "PGRST116") {
        console.error("[public-profile-api] Profile query error:", profileError);
        return new Response(
          JSON.stringify({ error: "Failed to load profile" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!profile) {
        console.log(`[public-profile-api] Profile not found for username: ${username}`);
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get wallet data
      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("play_credits, lifetime_credits")
        .eq("user_id", profile.user_id)
        .single();

      // Get skill stats
      const { data: skillStats } = await supabaseAdmin
        .from("skill_stats")
        .select("skill_level")
        .eq("user_id", profile.user_id)
        .single();

      // Get match history (last 10 matches)
      const { data: matches } = await supabaseAdmin
        .from("match_analyses")
        .select("result, credits_awarded, analyzed_at")
        .eq("user_id", profile.user_id)
        .eq("status", "analyzed")
        .order("analyzed_at", { ascending: false })
        .limit(10);

      // Accumulated booked hours — sum of (end - start) over all confirmed
      // bookings whose start_time is in the past. Cancelled / future / pending
      // are excluded so the number reflects court time the user actually used.
      const nowIso = new Date().toISOString();
      const { data: pastBookings } = await supabaseAdmin
        .from("bookings")
        .select("start_time, end_time")
        .eq("user_id", profile.user_id)
        .eq("status", "confirmed")
        .lte("start_time", nowIso);

      const bookedHours = (pastBookings ?? []).reduce((sum: number, b: any) => {
        const ms = new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
        return sum + Math.max(0, ms / 3_600_000);
      }, 0);

      // Calculate W/L stats
      const wins = matches?.filter(m => m.result === "W").length || 0;
      const losses = matches?.filter(m => m.result === "L").length || 0;
      const draws = matches?.filter(m => m.result === "D").length || 0;
      const last5 = matches?.slice(0, 5).map(m => m.result) || [];

      const playCredits = wallet?.play_credits || 0;

      const responseData = {
        user_id: profile.user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        play_credits: playCredits,
        lifetime_credits: wallet?.lifetime_credits || 0,
        skill_level: skillStats?.skill_level || 0,
        games_played: profile.games_played_self || 0,
        booked_hours: Math.round(bookedHours * 10) / 10,
        booked_count: pastBookings?.length || 0,
        member_since: profile.created_at,
        match_history: {
          wins,
          losses,
          draws,
          total: wins + losses + draws,
          last5,
        },
      };

      console.log(`[public-profile-api] Successfully fetched profile for ${username}`);
      return new Response(
        JSON.stringify(responseData),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "match-history" && userId) {
      // A user may only fetch their OWN extended match history — the rows include
      // per-match analytics metadata (serve/stroke/movement) and opponent ids, so
      // accepting an arbitrary body userId here would be an IDOR. (user is always
      // set for non-'profile' actions per the auth gate above.)
      if (!user || userId !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[public-profile-api] Fetching match history for userId: ${userId}`);

      // Get extended match history
      const { data: matches, error: matchError } = await supabaseAdmin
        .from("match_analyses")
        .select("id, result, credits_awarded, skill_level_snapshot, analyzed_at, metadata")
        .eq("user_id", userId)
        .eq("status", "analyzed")
        .order("analyzed_at", { ascending: false })
        .limit(20);

      if (matchError) {
        console.error("[public-profile-api] Match history error:", matchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch match history" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const wins = matches?.filter(m => m.result === "W").length || 0;
      const losses = matches?.filter(m => m.result === "L").length || 0;
      const draws = matches?.filter(m => m.result === "D").length || 0;

      return new Response(
        JSON.stringify({
          matches: matches || [],
          stats: { wins, losses, draws, total: wins + losses + draws },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[public-profile-api] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
