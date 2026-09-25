import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const allowedOrigins = [
  "https://www.padel2go-official.com",
  "https://padel2go-official.com",
  "https://www.padel2go-official.de",
  "https://padel2go-official.de",
  "https://padel2go.lovable.app",
  "https://padel2go.de",
  "http://localhost:5173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = !!origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.vercel.app')
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LOBBY-API] ${step}${detailsStr}`);
};

// Reservation TTL in minutes

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    logStep("Action received", { action });

    // Actions that require auth
    const authActions = [
      'create_lobby', 'join_lobby', 'leave_lobby', 'cancel_lobby',
      'get_my_lobbies', 'admin_cancel_lobbies_for_court',
      'invite_to_lobby', 'respond_invite', 'cancel_invite',
      'list_my_invites', 'list_lobby_invites',
      'get_lobby', 'list_lobbies',
    ];
    
    let user = null;
    if (authActions.includes(action)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authorization required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = userData.user;
      logStep("User authenticated", { userId: user.id });
    }

    // Ist die Funktion unter Sichtbarkeit versteckt, bleibt auch die Schnittstelle
    // zu — sonst liesse sich ueber die API weiter beitreten und bezahlen, waehrend
    // die Oberflaeche "Bald verfuegbar" zeigt. Aufraeumen und Ansehen bleiben moeglich.
    const geldAktionen = ["create_lobby", "join_lobby", "invite_to_lobby", "respond_invite"];
    if (geldAktionen.includes(action)) {
      const { data: sichtbarkeit } = await supabaseAdmin
        .from("site_settings")
        .select("feature_lobbies_state")
        .eq("id", "global")
        .maybeSingle();
      if ((sichtbarkeit as { feature_lobbies_state?: string } | null)?.feature_lobbies_state === "hidden") {
        return new Response(JSON.stringify({ error: "Lobbies sind derzeit nicht verfügbar." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    switch (action) {
      // ============================================
      // CREATE LOBBY
      // ============================================
      case "create_lobby": {
        const { 
          booking_id, location_id, court_id, start_time, end_time,
          capacity = 4, skill_min, skill_max, price_total_cents, 
          is_private = false, description 
        } = body;

        // Validate required fields — use == null so 0 stays a valid price.
        const missing: string[] = [];
        if (!location_id) missing.push("location_id");
        if (!court_id) missing.push("court_id");
        if (!start_time) missing.push("start_time");
        if (!end_time) missing.push("end_time");
        if (price_total_cents == null) missing.push("price_total_cents");
        if (missing.length > 0) {
          logStep("Missing required fields", { missing, received: { booking_id, location_id, court_id, start_time, end_time, price_total_cents, capacity, skill_min, skill_max, is_private } });
          return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get user's skill level for default range
        const { data: userSkill } = await supabaseAdmin
          .from("skill_stats")
          .select("skill_level")
          .eq("user_id", user!.id)
          .single();

        // Skill ratings are disabled pre-launch (no AI cameras yet) — default
        // every new lobby to an open 1–10 range so anybody can join, ignoring
        // whatever (probably zero) the host's skill_stats says.
        const userLevel = userSkill?.skill_level || 0;
        const finalSkillMin = skill_min ?? 1;
        const finalSkillMax = skill_max ?? 10;
        void userLevel; // kept for when the skill system is re-enabled

        const pricePerPlayer = Math.ceil(price_total_cents / capacity);

        // Create lobby
        const { data: lobby, error: lobbyError } = await supabaseAdmin
          .from("lobbies")
          .insert({
            host_user_id: user!.id,
            booking_id,
            location_id,
            court_id,
            start_time,
            end_time,
            capacity,
            skill_min: finalSkillMin,
            skill_max: finalSkillMax,
            price_total_cents,
            price_per_player_cents: pricePerPlayer,
            is_private,
            description,
          })
          .select()
          .single();

        if (lobbyError) {
          logStep("Failed to create lobby", { error: lobbyError.message });
          return new Response(JSON.stringify({ error: lobbyError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Add host as paid member (they already paid for the booking)
        await supabaseAdmin.from("lobby_members").insert({
          lobby_id: lobby.id,
          user_id: user!.id,
          status: "paid",
          paid_at: new Date().toISOString(),
        });

        // Create lobby_created event
        await supabaseAdmin.from("lobby_events").insert({
          lobby_id: lobby.id,
          actor_id: user!.id,
          event_type: "lobby_created",
          metadata: { capacity, skill_range: `${finalSkillMin}-${finalSkillMax}` },
        });

        logStep("Lobby created", { lobbyId: lobby.id });

        return new Response(JSON.stringify({ lobby }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // LIST LOBBIES
      // ============================================
      case "list_lobbies": {
        const {
          location_id, date_from, date_to, skill_min, skill_max,
          only_available = true, limit = 50
        } = body;

        logStep("list_lobbies filters", { location_id, date_from, date_to, skill_min, skill_max, only_available, limit });

        // Drop the embedded profiles join (PostgREST can't always resolve the
        // missing FK on lobby_members.user_id → profiles.user_id). We fetch
        // profiles separately below.
        let query = supabaseAdmin
          .from("lobbies")
          .select(`
            *,
            locations (name, slug, city),
            courts (name),
            lobby_members (id, user_id, status)
          `)
          .eq("status", "open")
          .eq("is_private", false)
          .order("start_time", { ascending: true })
          .limit(limit);

        if (location_id) {
          query = query.eq("location_id", location_id);
        }

        if (date_from) {
          query = query.gte("start_time", date_from);
        }

        if (date_to) {
          query = query.lte("start_time", date_to);
        }

        if (skill_min) {
          query = query.gte("skill_max", skill_min);
        }

        if (skill_max) {
          query = query.lte("skill_min", skill_max);
        }

        const { data: lobbies, error: lobbiesError } = await query;

        if (lobbiesError) {
          logStep("list_lobbies query error", { error: lobbiesError.message });
          return new Response(JSON.stringify({ error: lobbiesError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        logStep("list_lobbies result count", {
          count: lobbies?.length ?? 0,
          ids: (lobbies ?? []).map((l: any) => ({ id: l.id, start_time: l.start_time, is_private: l.is_private, status: l.status })),
        });

        // Collect all member user_ids for one-shot profile + skill lookup
        const allUserIds = Array.from(
          new Set(
            (lobbies ?? []).flatMap((l: any) =>
              (l.lobby_members ?? []).map((m: any) => m.user_id),
            ),
          ),
        );

        let profileMap = new Map<string, any>();
        let skillMap = new Map<string, number>();
        if (allUserIds.length > 0) {
          const [profilesRes, skillRes] = await Promise.all([
            supabaseAdmin.from("profiles")
              .select("user_id, display_name, avatar_url, username")
              .in("user_id", allUserIds),
            supabaseAdmin.from("skill_stats")
              .select("user_id, skill_level")
              .in("user_id", allUserIds),
          ]);
          profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
          skillMap = new Map((skillRes.data ?? []).map((s: any) => [s.user_id, s.skill_level]));
        }

        // Calculate member counts, avg skill, and shape `members` like get_lobby
        const lobbiesWithStats = (lobbies || []).map((lobby: any) => {
          const rawMembers = lobby.lobby_members ?? [];
          const activeMembers = rawMembers.filter(
            (m: any) => ["paid", "joined", "reserved"].includes(m.status),
          );
          const paidMembers = activeMembers.filter((m: any) => m.status === "paid");

          const members = activeMembers.map((m: any) => ({
            ...m,
            profiles: profileMap.get(m.user_id) ?? null,
            skill_level: skillMap.get(m.user_id) ?? 0,
          }));

          // avg only meaningful for members with a real (>0) skill rating —
          // unrated members get 0 from the map and would skew the average down
          // to look like everyone is a beginner.
          const ratedPaid = paidMembers.filter((m: any) => (skillMap.get(m.user_id) ?? 0) > 0);
          const avgSkill = ratedPaid.length > 0
            ? Math.round(
                ratedPaid.reduce(
                  (sum: number, m: any) => sum + (skillMap.get(m.user_id) ?? 0),
                  0,
                ) / ratedPaid.length * 10,
              ) / 10
            : null;

          return {
            ...lobby,
            members,
            members_count: activeMembers.length,
            paid_count: paidMembers.length,
            spots_available: lobby.capacity - activeMembers.length,
            avg_skill: avgSkill,
          };
        });

        const filtered = only_available
          ? lobbiesWithStats.filter((l: any) => l.spots_available > 0)
          : lobbiesWithStats;

        return new Response(JSON.stringify({ lobbies: filtered }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // GET LOBBY DETAILS
      // ============================================
      case "get_lobby": {
        const { lobby_id } = body;

        if (!lobby_id) {
          return new Response(JSON.stringify({ error: "lobby_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: lobby, error: lobbyError } = await supabaseAdmin
          .from("lobbies")
          .select(`
            *,
            locations (name, slug, city, address),
            courts (name)
          `)
          .eq("id", lobby_id)
          .single();

        if (lobbyError || !lobby) {
          return new Response(JSON.stringify({ error: "Lobby not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Private lobbies: only host, active members or invitees may see details
        if (lobby.is_private) {
          let allowed = lobby.host_user_id === user!.id;
          if (!allowed) {
            const { data: membership } = await supabaseAdmin
              .from("lobby_members")
              .select("id")
              .eq("lobby_id", lobby_id)
              .eq("user_id", user!.id)
              .in("status", ["paid", "joined", "reserved"])
              .maybeSingle();
            allowed = !!membership;
          }
          if (!allowed) {
            const { data: invite } = await supabaseAdmin
              .from("lobby_invites")
              .select("id")
              .eq("lobby_id", lobby_id)
              .eq("invitee_id", user!.id)
              .maybeSingle();
            allowed = !!invite;
          }
          if (!allowed) {
            return new Response(JSON.stringify({ error: "Kein Zugriff auf diese Lobby" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Fetch members WITHOUT the embedded profile join — lobby_members.user_id
        // has no foreign key, so PostgREST can't always resolve `profiles:user_id`
        // and the whole query silently returns null members. We fetch profiles
        // separately and merge in JS — works regardless of FK metadata.
        const { data: members, error: membersError } = await supabaseAdmin
          .from("lobby_members")
          .select("id, user_id, status, paid_at, reserved_until, created_at")
          .eq("lobby_id", lobby_id)
          .in("status", ["paid", "joined", "reserved"]);

        if (membersError) {
          logStep("get_lobby members query failed", { error: membersError.message });
        }

        const userIds = (members ?? []).map((m: any) => m.user_id);

        const [profilesRes, skillRes] = await Promise.all([
          userIds.length > 0
            ? supabaseAdmin.from("profiles")
                .select("user_id, display_name, avatar_url, username")
                .in("user_id", userIds)
            : Promise.resolve({ data: [], error: null }),
          userIds.length > 0
            ? supabaseAdmin.from("skill_stats")
                .select("user_id, skill_level")
                .in("user_id", userIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const profileMap = new Map(
          (profilesRes.data ?? []).map((p: any) => [p.user_id, p]),
        );
        const skillMap = new Map(
          (skillRes.data ?? []).map((s: any) => [s.user_id, s.skill_level]),
        );

        const membersWithSkill = (members ?? []).map((m: any) => ({
          ...m,
          profiles: profileMap.get(m.user_id) ?? null,
          skill_level: skillMap.get(m.user_id) ?? 0,
        }));

        logStep("get_lobby members", { count: membersWithSkill.length, ids: membersWithSkill.map((m: any) => ({ id: m.id, status: m.status })) });

        // Calculate avg skill — only over members with a real rating (>0).
        const paidMembers = membersWithSkill.filter((m: any) => m.status === 'paid');
        const ratedPaid = paidMembers.filter((m: any) => (m.skill_level ?? 0) > 0);
        const avgSkill = ratedPaid.length > 0
          ? Math.round(ratedPaid.reduce((sum: number, m: any) => sum + m.skill_level, 0) / ratedPaid.length * 10) / 10
          : null;

        return new Response(JSON.stringify({ 
          lobby: {
            ...lobby,
            members: membersWithSkill,
            members_count: membersWithSkill.length,
            paid_count: paidMembers.length,
            avg_skill: avgSkill,
            spots_available: lobby.capacity - membersWithSkill.length,
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // JOIN LOBBY (free — host pays the whole court)
      // ============================================
      case "join_lobby": {
        const { lobby_id } = body;

        if (!lobby_id) {
          return new Response(JSON.stringify({ error: "lobby_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: lobby, error: lobbyError } = await supabaseAdmin
          .from("lobbies")
          .select("*")
          .eq("id", lobby_id)
          .eq("status", "open")
          .single();

        if (lobbyError || !lobby) {
          return new Response(JSON.stringify({ error: "Lobby nicht gefunden oder nicht mehr offen" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: existingMember } = await supabaseAdmin
          .from("lobby_members")
          .select("id, status")
          .eq("lobby_id", lobby_id)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (existingMember && ["paid", "joined", "reserved"].includes(existingMember.status)) {
          return new Response(JSON.stringify({ error: "Du bist bereits Teil dieser Lobby" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Skill range check
        const { data: userSkill } = await supabaseAdmin
          .from("skill_stats")
          .select("skill_level")
          .eq("user_id", user!.id)
          .maybeSingle();

        const userLevel = userSkill?.skill_level || 5;
        if (userLevel < lobby.skill_min || userLevel > lobby.skill_max) {
          return new Response(JSON.stringify({
            error: `Dein Skill-Level (${userLevel}) liegt nicht im gewünschten Bereich (${lobby.skill_min}–${lobby.skill_max})`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Capacity check
        const { data: activeMembers } = await supabaseAdmin
          .from("lobby_members")
          .select("id")
          .eq("lobby_id", lobby_id)
          .in("status", ["paid", "joined", "reserved"]);

        if ((activeMembers?.length || 0) >= lobby.capacity) {
          return new Response(JSON.stringify({ error: "Lobby ist voll" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Insert / update straight to joined — no payment, no reservation
        let memberId: string;
        if (existingMember) {
          await supabaseAdmin
            .from("lobby_members")
            .update({ status: "joined", reserved_until: null })
            .eq("id", existingMember.id);
          memberId = existingMember.id;
        } else {
          const { data: newMember, error: memberError } = await supabaseAdmin
            .from("lobby_members")
            .insert({ lobby_id, user_id: user!.id, status: "joined" })
            .select()
            .single();
          if (memberError) {
            return new Response(JSON.stringify({ error: memberError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          memberId = newMember.id;
        }

        // Re-count active members AFTER the write to catch concurrent joins
        const { count: recount } = await supabaseAdmin
          .from("lobby_members")
          .select("id", { count: "exact", head: true })
          .eq("lobby_id", lobby_id)
          .in("status", ["paid", "joined", "reserved"]);

        if ((recount ?? 0) > lobby.capacity) {
          // Over capacity — someone else got the last seat first, roll back this join
          if (existingMember) {
            await supabaseAdmin
              .from("lobby_members")
              .update({ status: existingMember.status })
              .eq("id", existingMember.id);
          } else {
            await supabaseAdmin.from("lobby_members").delete().eq("id", memberId);
          }
          return new Response(JSON.stringify({ error: "Lobby ist voll" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Auto-flip lobby to "full" if capacity reached after this join
        if ((recount ?? 0) >= lobby.capacity) {
          await supabaseAdmin.from("lobbies").update({ status: "full" }).eq("id", lobby_id);
        }

        // Audit event
        await supabaseAdmin.from("lobby_events").insert({
          lobby_id,
          actor_id: user!.id,
          event_type: "member_joined",
          metadata: { member_id: memberId },
        });

        // Notify host + other active members
        const { data: otherMembers } = await supabaseAdmin
          .from("lobby_members")
          .select("user_id")
          .eq("lobby_id", lobby_id)
          .in("status", ["paid", "joined"])
          .neq("user_id", user!.id);

        const { data: userProfile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("user_id", user!.id)
          .maybeSingle();

        const notifyUserIds = [
          lobby.host_user_id,
          ...(otherMembers || []).map((m: any) => m.user_id),
        ].filter((id, i, arr) => id !== user!.id && arr.indexOf(id) === i);

        for (const notifyId of notifyUserIds) {
          await supabaseAdmin.from("notifications").insert({
            user_id: notifyId,
            type: "lobby_member_joined",
            title: "Neuer Spieler beigetreten",
            message: `${userProfile?.display_name || "Ein Spieler"} ist deiner Lobby beigetreten.`,
            entity_type: "lobby",
            entity_id: lobby_id,
            cta_url: `/lobbies/${lobby_id}`,
          });
        }

        logStep("Member joined (free)", { lobbyId: lobby_id, memberId });

        return new Response(JSON.stringify({ ok: true, member_id: memberId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // LEAVE LOBBY
      // ============================================
      case "leave_lobby": {
        const { lobby_id } = body;

        const { data: member } = await supabaseAdmin
          .from("lobby_members")
          .select("id, status")
          .eq("lobby_id", lobby_id)
          .eq("user_id", user!.id)
          .single();

        if (!member) {
          return new Response(JSON.stringify({ error: "Not a member" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (member.status === "paid") {
          return new Response(JSON.stringify({ error: "Cannot leave after paying. Contact support for refund." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("lobby_members")
          .update({ status: "cancelled" })
          .eq("id", member.id);

        await supabaseAdmin.from("lobby_events").insert({
          lobby_id,
          actor_id: user!.id,
          event_type: "member_left",
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // CANCEL LOBBY (Host only)
      // ============================================
      case "cancel_lobby": {
        const { lobby_id } = body;

        const { data: lobby } = await supabaseAdmin
          .from("lobbies")
          .select("id, host_user_id")
          .eq("id", lobby_id)
          .single();

        if (!lobby || lobby.host_user_id !== user!.id) {
          return new Response(JSON.stringify({ error: "Not authorized" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("lobbies")
          .update({ status: "cancelled" })
          .eq("id", lobby_id);

        // Notify all members
        const { data: members } = await supabaseAdmin
          .from("lobby_members")
          .select("user_id")
          .eq("lobby_id", lobby_id)
          .neq("user_id", user!.id);

        for (const member of members || []) {
          await supabaseAdmin.from("notifications").insert({
            user_id: member.user_id,
            type: "lobby_cancelled",
            title: "Lobby abgesagt",
            message: "Eine Lobby, der du beigetreten bist, wurde abgesagt.",
            entity_type: "lobby",
            entity_id: lobby_id,
          });
        }

        await supabaseAdmin.from("lobby_events").insert({
          lobby_id,
          actor_id: user!.id,
          event_type: "lobby_cancelled",
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // ADMIN: CANCEL ALL LOBBIES FOR A COURT
      // ============================================
      case "admin_cancel_lobbies_for_court": {
        const { court_id } = body;

        if (!court_id) {
          return new Response(JSON.stringify({ error: "court_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if user is admin (user_roles row OR superadmin email bypass)
        const { data: adminRole } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user!.id)
          .eq("role", "admin")
          .maybeSingle();

        const isSuperadmin = user!.email === "fsteinfelder@padel2go.eu";

        if (!adminRole && !isSuperadmin) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find active lobbies on this court
        const { data: lobbies, error: lobbiesError } = await supabaseAdmin
          .from("lobbies")
          .select("id, host_user_id")
          .eq("court_id", court_id)
          .in("status", ["open", "full"]);

        if (lobbiesError) {
          return new Response(JSON.stringify({ error: lobbiesError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let cancelledCount = 0;

        for (const lobby of lobbies || []) {
          // Cancel lobby
          await supabaseAdmin
            .from("lobbies")
            .update({ status: "cancelled" })
            .eq("id", lobby.id);

          // Cancel all members (keep history, but mark as cancelled)
          await supabaseAdmin
            .from("lobby_members")
            .update({ status: "cancelled" })
            .eq("lobby_id", lobby.id);

          // Notify members + host
          const { data: members } = await supabaseAdmin
            .from("lobby_members")
            .select("user_id")
            .eq("lobby_id", lobby.id);

          const notifyUserIds = Array.from(
            new Set([lobby.host_user_id, ...(members || []).map((m: any) => m.user_id)])
          );

          for (const userId of notifyUserIds) {
            await supabaseAdmin.from("notifications").insert({
              user_id: userId,
              type: "lobby_cancelled",
              title: "Lobby abgesagt",
              message: "Diese Lobby wurde wegen Court-Deaktivierung automatisch abgesagt.",
              entity_type: "lobby",
              entity_id: lobby.id,
              cta_url: `/lobbies/${lobby.id}`,
            });
          }

          await supabaseAdmin.from("lobby_events").insert({
            lobby_id: lobby.id,
            actor_id: user!.id,
            event_type: "lobby_cancelled_admin",
            metadata: { reason: "court_deactivated" },
          });

          cancelledCount++;
        }

        return new Response(JSON.stringify({ success: true, cancelledCount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // GET MY LOBBIES
      // ============================================
      case "get_my_lobbies": {
        // Lobbies where user is host
        const { data: hostedLobbies } = await supabaseAdmin
          .from("lobbies")
          .select(`
            *,
            locations (name, slug),
            courts (name),
            lobby_members (id, user_id, status)
          `)
          .eq("host_user_id", user!.id)
          .in("status", ["open", "full"])
          .order("start_time", { ascending: true });

        // Lobbies where user is member
        const { data: memberLobbies } = await supabaseAdmin
          .from("lobby_members")
          .select(`
            lobby_id,
            status,
            lobbies (
              *,
              locations (name, slug),
              courts (name),
              lobby_members (id, user_id, status)
            )
          `)
          .eq("user_id", user!.id)
          .in("status", ["paid", "joined", "reserved"]);

        const joinedRaw = (memberLobbies ?? [])
          .map((m: any) => m.lobbies ? { ...m.lobbies, my_status: m.status } : null)
          .filter(Boolean);
        const hostedRaw = hostedLobbies ?? [];

        // Decorate both lists with members[] (incl. profiles + skill) and counts
        // so LobbyCard can render avatars and Teilnehmer X/Y correctly.
        const allUserIds = Array.from(new Set(
          [...hostedRaw, ...joinedRaw].flatMap((l: any) =>
            (l.lobby_members ?? []).map((m: any) => m.user_id),
          ),
        ));

        let profileMap = new Map<string, any>();
        let skillMap = new Map<string, number>();
        if (allUserIds.length > 0) {
          const [profilesRes, skillRes] = await Promise.all([
            supabaseAdmin.from("profiles")
              .select("user_id, display_name, avatar_url, username")
              .in("user_id", allUserIds),
            supabaseAdmin.from("skill_stats")
              .select("user_id, skill_level")
              .in("user_id", allUserIds),
          ]);
          profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
          skillMap = new Map((skillRes.data ?? []).map((s: any) => [s.user_id, s.skill_level]));
        }

        const decorate = (lobby: any) => {
          const raw = lobby.lobby_members ?? [];
          const active = raw.filter((m: any) => ["paid", "joined", "reserved"].includes(m.status));
          const members = active.map((m: any) => ({
            ...m,
            profiles: profileMap.get(m.user_id) ?? null,
            skill_level: skillMap.get(m.user_id) ?? 0,
          }));
          return {
            ...lobby,
            members,
            members_count: active.length,
            paid_count: active.filter((m: any) => m.status === "paid").length,
            spots_available: lobby.capacity - active.length,
          };
        };

        return new Response(JSON.stringify({
          hosted: hostedRaw.map(decorate),
          joined: joinedRaw.map(decorate),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // INVITE FRIEND TO LOBBY
      // ============================================
      case "invite_to_lobby": {
        const { lobby_id, invitee_ids } = body;
        logStep("invite_to_lobby start", { lobby_id, invitee_ids, inviter_id: user!.id });
        if (!lobby_id || !Array.isArray(invitee_ids) || invitee_ids.length === 0) {
          logStep("invite_to_lobby missing fields", { lobby_id, invitee_ids });
          return new Response(JSON.stringify({ error: "lobby_id and invitee_ids required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Caller must be the host OR an active lobby member
        const { data: lobby } = await supabaseAdmin
          .from("lobbies")
          .select("host_user_id, status, locations(name), start_time")
          .eq("id", lobby_id)
          .single();

        if (!lobby) {
          return new Response(JSON.stringify({ error: "Lobby nicht gefunden" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let allowed = lobby.host_user_id === user!.id;
        if (!allowed) {
          const { data: membership } = await supabaseAdmin
            .from("lobby_members")
            .select("id")
            .eq("lobby_id", lobby_id)
            .eq("user_id", user!.id)
            .in("status", ["paid", "joined", "reserved"])
            .maybeSingle();
          allowed = !!membership;
        }
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Nur Teilnehmer können einladen" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (lobby.status !== "open") {
          return new Response(JSON.stringify({ error: "Lobby ist nicht mehr offen" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const inserted: any[] = [];
        const skipped: string[] = [];

        for (const inviteeId of invitee_ids) {
          // The (lobby_id, invitee_id) UNIQUE constraint means we can never have
          // two rows for the same pair. So: check if an old invite exists, and
          // either skip (still pending / accepted) or RESET it back to pending
          // (declined / cancelled / expired). Otherwise INSERT a fresh row.
          const { data: existing } = await supabaseAdmin
            .from("lobby_invites")
            .select("id, status")
            .eq("lobby_id", lobby_id)
            .eq("invitee_id", inviteeId)
            .maybeSingle();

          let inv: any = null;

          if (existing) {
            if (existing.status === "pending" || existing.status === "accepted") {
              logStep("Invite already active", { inviteeId, status: existing.status });
              skipped.push(inviteeId);
              continue;
            }
            // Reset stale invite back to pending
            const { data: reset, error: resetErr } = await supabaseAdmin
              .from("lobby_invites")
              .update({
                status: "pending",
                inviter_id: user!.id,
                responded_at: null,
                created_at: new Date().toISOString(),
              })
              .eq("id", existing.id)
              .select()
              .single();
            if (resetErr) {
              logStep("Failed to reset stale invite", { inviteeId, error: resetErr.message });
              skipped.push(inviteeId);
              continue;
            }
            inv = reset;
          } else {
            const { data: created, error: invErr } = await supabaseAdmin
              .from("lobby_invites")
              .insert({
                lobby_id,
                inviter_id: user!.id,
                invitee_id: inviteeId,
              })
              .select()
              .single();
            if (invErr) {
              logStep("Failed to insert invite", { inviteeId, error: invErr.message, code: (invErr as any).code });
              skipped.push(inviteeId);
              continue;
            }
            inv = created;
          }

          inserted.push(inv);

          const locationName = (lobby as any).locations?.name || "Lobby";
          const startStr = new Date(lobby.start_time).toLocaleString("de-DE", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          });

          // Notification (existing)
          await supabaseAdmin.from("notifications").insert({
            user_id: inviteeId,
            type: "lobby_invite",
            title: "Lobby-Einladung",
            message: `Du wurdest zu einer Lobby bei ${locationName} am ${startStr} eingeladen.`,
            entity_type: "lobby",
            entity_id: lobby_id,
            cta_url: `/lobbies/${lobby_id}`,
          }).then(() => {}, () => {});

          // Chat message — renders in the 1:1 thread with Accept/Decline buttons
          await supabaseAdmin.from("chat_messages").insert({
            sender_id: user!.id,
            recipient_id: inviteeId,
            content: `Einladung zu einer Lobby bei ${locationName} am ${startStr}`,
            kind: "lobby_invite",
            metadata: {
              lobby_id,
              invite_id: inv.id,
              location_name: locationName,
              start_time: lobby.start_time,
            },
          }).then(() => {}, (err: unknown) => {
            logStep("Chat invite insert failed", { inviteeId, err: String(err) });
          });
        }

        logStep("invite_to_lobby done", { invited: inserted.length, skipped });
        return new Response(JSON.stringify({ invited: inserted.length, skipped }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // RESPOND TO INVITE  (invitee accept/decline)
      // ============================================
      case "respond_invite": {
        const { invite_id, response } = body;
        if (!invite_id || !["accepted", "declined"].includes(response)) {
          return new Response(JSON.stringify({ error: "invite_id + response (accepted|declined)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: invite } = await supabaseAdmin
          .from("lobby_invites")
          .select("*")
          .eq("id", invite_id)
          .single();

        if (!invite || invite.invitee_id !== user!.id) {
          return new Response(JSON.stringify({ error: "Einladung nicht gefunden" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (invite.status !== "pending") {
          return new Response(JSON.stringify({ error: "Einladung wurde bereits beantwortet" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Accept → actually add the invitee to lobby_members, flip lobby to
        // 'full' if at capacity, and notify the host that someone joined.
        if (response === "accepted") {
          // Skip if already a member (re-accept after manual rejoin etc.)
          const { data: existingMember } = await supabaseAdmin
            .from("lobby_members")
            .select("id, status")
            .eq("lobby_id", invite.lobby_id)
            .eq("user_id", user!.id)
            .maybeSingle();

          const alreadyActive = !!existingMember &&
            ["paid", "joined", "reserved"].includes(existingMember.status);

          // Lobby must still be open with a free seat before we add anyone
          const { data: lobbyRow } = await supabaseAdmin
            .from("lobbies")
            .select("capacity, status, host_user_id, locations(name)")
            .eq("id", invite.lobby_id)
            .single();

          if (!alreadyActive) {
            const { count: activeCount } = await supabaseAdmin
              .from("lobby_members")
              .select("id", { count: "exact", head: true })
              .eq("lobby_id", invite.lobby_id)
              .in("status", ["paid", "joined", "reserved"]);

            if (!lobbyRow || lobbyRow.status !== "open" || (activeCount ?? 0) >= lobbyRow.capacity) {
              return new Response(JSON.stringify({ error: "Lobby ist voll oder nicht mehr offen" }), {
                status: 409,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          await supabaseAdmin
            .from("lobby_invites")
            .update({ status: response, responded_at: new Date().toISOString() })
            .eq("id", invite_id);

          if (!existingMember) {
            await supabaseAdmin.from("lobby_members").insert({
              lobby_id: invite.lobby_id,
              user_id: user!.id,
              status: "joined",
            });
          } else if (!alreadyActive) {
            await supabaseAdmin.from("lobby_members")
              .update({ status: "joined" })
              .eq("id", existingMember.id);
          }

          // Capacity check — flip lobby to 'full' if all seats taken
          if (lobbyRow && lobbyRow.status === "open") {
            const { count } = await supabaseAdmin
              .from("lobby_members")
              .select("id", { count: "exact", head: true })
              .eq("lobby_id", invite.lobby_id)
              .in("status", ["paid", "joined", "reserved"]);
            if ((count ?? 0) >= lobbyRow.capacity) {
              await supabaseAdmin
                .from("lobbies")
                .update({ status: "full" })
                .eq("id", invite.lobby_id);
            }

            // Notify the host
            const { data: joinerProfile } = await supabaseAdmin
              .from("profiles")
              .select("display_name, username")
              .eq("user_id", user!.id)
              .maybeSingle();
            const joinerName = joinerProfile?.display_name || joinerProfile?.username || "Ein Spieler";
            const locationName = (lobbyRow as any).locations?.name || "deiner Lobby";
            await supabaseAdmin.from("notifications").insert({
              user_id: lobbyRow.host_user_id,
              type: "lobby_invite",
              title: "Lobby-Einladung angenommen",
              message: `${joinerName} ist deiner Lobby bei ${locationName} beigetreten.`,
              entity_type: "lobby",
              entity_id: invite.lobby_id,
              cta_url: `/lobbies/${invite.lobby_id}`,
            }).then(() => {}, () => {});
          }
        } else {
          await supabaseAdmin
            .from("lobby_invites")
            .update({ status: response, responded_at: new Date().toISOString() })
            .eq("id", invite_id);
        }

        return new Response(JSON.stringify({ ok: true, lobby_id: invite.lobby_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // CANCEL INVITE  (host pulls back a pending invite)
      // ============================================
      case "cancel_invite": {
        const { invite_id } = body;
        const { data: invite } = await supabaseAdmin
          .from("lobby_invites")
          .select("*")
          .eq("id", invite_id)
          .single();

        if (!invite || invite.inviter_id !== user!.id) {
          return new Response(JSON.stringify({ error: "Einladung nicht gefunden" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("lobby_invites")
          .update({ status: "cancelled", responded_at: new Date().toISOString() })
          .eq("id", invite_id);

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // LIST MY PENDING INVITES (invitee view)
      // ============================================
      case "list_my_invites": {
        const { data, error } = await supabaseAdmin
          .from("lobby_invites")
          .select(`
            id, status, created_at, lobby_id, inviter_id,
            lobbies (
              id, start_time, end_time, status, capacity, skill_min, skill_max,
              price_per_player_cents, currency, is_private,
              locations (name, city),
              courts (name)
            )
          `)
          .eq("invitee_id", user!.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve inviter profiles
        const inviterIds = Array.from(new Set((data ?? []).map((d: any) => d.inviter_id)));
        let inviterMap = new Map<string, any>();
        if (inviterIds.length > 0) {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("user_id, display_name, username, avatar_url")
            .in("user_id", inviterIds);
          inviterMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
        }

        const invites = (data ?? []).map((d: any) => ({
          ...d,
          inviter: inviterMap.get(d.inviter_id) ?? null,
        }));

        return new Response(JSON.stringify({ invites }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // LIST INVITES FOR A SPECIFIC LOBBY (host view)
      // ============================================
      case "list_lobby_invites": {
        const { lobby_id } = body;
        const { data: lob } = await supabaseAdmin
          .from("lobbies")
          .select("host_user_id")
          .eq("id", lobby_id)
          .single();
        if (!lob) {
          return new Response(JSON.stringify({ error: "Lobby nicht gefunden" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Host or any active member may see the invite list
        let canSee = lob.host_user_id === user!.id;
        if (!canSee) {
          const { data: membership } = await supabaseAdmin
            .from("lobby_members")
            .select("id")
            .eq("lobby_id", lobby_id)
            .eq("user_id", user!.id)
            .in("status", ["paid", "joined", "reserved"])
            .maybeSingle();
          canSee = !!membership;
        }
        if (!canSee) {
          return new Response(JSON.stringify({ error: "Nur Teilnehmer dürfen das sehen" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data } = await supabaseAdmin
          .from("lobby_invites")
          .select("id, status, created_at, responded_at, invitee_id")
          .eq("lobby_id", lobby_id)
          .order("created_at", { ascending: false });

        const inviteeIds = (data ?? []).map((r: any) => r.invitee_id);
        let profileMap = new Map<string, any>();
        if (inviteeIds.length > 0) {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("user_id, display_name, username, avatar_url")
            .in("user_id", inviteeIds);
          profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
        }

        const invites = (data ?? []).map((r: any) => ({
          ...r,
          invitee: profileMap.get(r.invitee_id) ?? null,
        }));

        return new Response(JSON.stringify({ invites }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // CLEANUP EXPIRED (Cron) — only past-end-time lobbies now;
      // reservations no longer exist since lobby joins are free.
      // ============================================
      case "cleanup_expired": {
        // Expire old lobbies (past end_time)
        await supabaseAdmin
          .from("lobbies")
          .update({ status: "expired" })
          .eq("status", "open")
          .lt("end_time", new Date().toISOString());

        return new Response(JSON.stringify({ expired_lobbies: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
