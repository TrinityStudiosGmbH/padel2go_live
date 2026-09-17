// Schliesst das Profil-Onboarding ab: prueft die Pflichtfelder, setzt
// profile_completed_at genau einmal und loest den Reward PROFILE_COMPLETED aus
// (rewards-trigger akzeptiert nur den Service-Role-Key, daher server-seitig).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("username, display_name, age, profile_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, 500);
    if (!profile) return json({ error: "Profil nicht gefunden" }, 404);

    const missing = (["username", "display_name", "age"] as const).filter((k) => !profile[k]);
    if (missing.length) return json({ error: `Pflichtfelder fehlen: ${missing.join(", ")}` }, 400);

    if (profile.profile_completed_at) {
      return json({ success: true, completed_at: profile.profile_completed_at, rewarded: false });
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("profiles")
      .update({ profile_completed_at: completedAt })
      .eq("user_id", user.id)
      .is("profile_completed_at", null);
    if (updateError) return json({ error: updateError.message }, 500);

    let rewarded = false;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/rewards-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ event: "profileCompleted", userId: user.id }),
      });
      rewarded = res.ok;
      if (!res.ok) console.error("[complete-profile] rewards-trigger", res.status, await res.text());
    } catch (e) {
      console.error("[complete-profile] rewards-trigger failed", e);
    }

    return json({ success: true, completed_at: completedAt, rewarded });
  } catch (e) {
    console.error("[complete-profile]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
