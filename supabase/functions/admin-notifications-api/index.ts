import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { hasAdminAccess } from "../_shared/adminAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BroadcastRequest {
  category?: "transactional" | "marketing";
  action: "send_broadcast" | "update_broadcast" | "delete_broadcast" | "cleanup_expired";
  title?: string;
  message?: string;
  target_type?: "all" | "specific";
  target_user_ids?: string[] | null;
  cta_label?: string | null;
  cta_url?: string | null;
  expires_at?: string | null;
  broadcast_id?: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = SupabaseClient<any, any, any>;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth to check admin role
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-Rolle: fuer die Rechtepruefung UND die eigentlichen Operationen.
    // Muss vor der Pruefung stehen — has_admin_page liest die Rollentabellen.
    const supabase: SupabaseClientAny = createClient(supabaseUrl, supabaseServiceKey);

    // Vollzugriff ODER eigene Rolle mit der Seite "Mitteilungen"
    if (!(await hasAdminAccess(supabase, user, "notifications"))) {
      console.error("No admin access:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: BroadcastRequest = await req.json();
    console.log("Admin notifications request:", { action: body.action });

    // Handle different actions
    switch (body.action) {
      case "send_broadcast":
        return await handleSendBroadcast(supabase, body, user.id);
      case "update_broadcast":
        return await handleUpdateBroadcast(supabase, body);
      case "delete_broadcast":
        return await handleDeleteBroadcast(supabase, body);
      case "cleanup_expired":
        return await handleCleanupExpired(supabase);
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in admin-notifications-api:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleSendBroadcast(supabase: SupabaseClientAny, body: BroadcastRequest, adminUserId: string) {
  // Validate required fields
  if (!body.title?.trim() || !body.message?.trim()) {
    return new Response(
      JSON.stringify({ error: "Title and message are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get target user IDs
  let targetUserIds: string[] = [];

  if (body.target_type === "all") {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    targetUserIds = profiles.map((p: { user_id: string }) => p.user_id);
  } else if (body.target_type === "specific" && body.target_user_ids?.length) {
    targetUserIds = body.target_user_ids;
  } else {
    return new Response(
      JSON.stringify({ error: "No target users specified" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Sending broadcast to ${targetUserIds.length} users`);

  // First, create the broadcast record
  const { data: broadcast, error: broadcastError } = await supabase
    .from("admin_broadcasts")
    .insert({
      admin_user_id: adminUserId,
      title: body.title,
      message: body.message,
      cta_label: body.cta_label || null,
      cta_url: body.cta_url || null,
      target_type: body.target_type,
      target_user_ids: body.target_type === "specific" ? body.target_user_ids : null,
      recipients_count: targetUserIds.length,
      expires_at: body.expires_at || null,
    })
    .select("id")
    .single();

  if (broadcastError) {
    console.error("Error creating broadcast:", broadcastError);
    throw broadcastError;
  }

  const broadcastId = broadcast.id;

  // Create notification entries for each user. Admin broadcasts are marketing
  // by default (REQ-D09): the notify_push trigger only pushes them to users
  // with push_marketing_opt_in; the in-app notification is always created.
  const category = body.category === "transactional" ? "transactional" : "marketing";
  const notifications = targetUserIds.map((userId) => ({
    user_id: userId,
    type: "admin_broadcast",
    category,
    title: body.title,
    message: body.message,
    cta_url: body.cta_url || null,
    actor_id: adminUserId,
    broadcast_id: broadcastId,
    expires_at: body.expires_at || null,
    metadata: {
      cta_label: body.cta_label || null,
      broadcast_type: body.target_type,
    },
  }));

  // Insert notifications in batches of 100
  const batchSize = 100;
  let insertedCount = 0;

  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(batch);

    if (insertError) {
      console.error("Error inserting notifications batch:", insertError);
      throw insertError;
    }
    insertedCount += batch.length;
  }

  console.log(`Inserted ${insertedCount} notifications for broadcast ${broadcastId}`);

  return new Response(
    JSON.stringify({
      success: true,
      broadcast_id: broadcastId,
      recipients_count: insertedCount,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleUpdateBroadcast(supabase: SupabaseClientAny, body: BroadcastRequest) {
  if (!body.broadcast_id) {
    return new Response(
      JSON.stringify({ error: "broadcast_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Updating broadcast ${body.broadcast_id}`);

  // Update the broadcast record
  // deno-lint-ignore no-explicit-any
  const updateData: Record<string, any> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.message !== undefined) updateData.message = body.message;
  if (body.cta_label !== undefined) updateData.cta_label = body.cta_label;
  if (body.cta_url !== undefined) updateData.cta_url = body.cta_url;
  if (body.expires_at !== undefined) updateData.expires_at = body.expires_at;

  const { error: broadcastError } = await supabase
    .from("admin_broadcasts")
    .update(updateData)
    .eq("id", body.broadcast_id);

  if (broadcastError) {
    console.error("Error updating broadcast:", broadcastError);
    throw broadcastError;
  }

  // Update all associated notifications
  // deno-lint-ignore no-explicit-any
  const notificationUpdate: Record<string, any> = {};
  if (body.title !== undefined) notificationUpdate.title = body.title;
  if (body.message !== undefined) notificationUpdate.message = body.message;
  if (body.cta_url !== undefined) notificationUpdate.cta_url = body.cta_url;
  if (body.expires_at !== undefined) notificationUpdate.expires_at = body.expires_at;

  if (Object.keys(notificationUpdate).length > 0 || body.cta_label !== undefined) {
    // If cta_label changed, we need to update metadata which requires fetching existing notifications
    if (body.cta_label !== undefined) {
      const { data: existingNotifications } = await supabase
        .from("notifications")
        .select("id, metadata")
        .eq("broadcast_id", body.broadcast_id);

      if (existingNotifications && existingNotifications.length > 0) {
        for (const notification of existingNotifications) {
          // deno-lint-ignore no-explicit-any
          const metadata = (notification.metadata as Record<string, any>) || {};
          metadata.cta_label = body.cta_label;
          await supabase
            .from("notifications")
            .update({ ...notificationUpdate, metadata })
            .eq("id", notification.id);
        }
      }
    } else if (Object.keys(notificationUpdate).length > 0) {
      const { error: notificationError } = await supabase
        .from("notifications")
        .update(notificationUpdate)
        .eq("broadcast_id", body.broadcast_id);

      if (notificationError) {
        console.error("Error updating notifications:", notificationError);
        throw notificationError;
      }
    }
  }

  console.log(`Updated broadcast ${body.broadcast_id}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleDeleteBroadcast(supabase: SupabaseClientAny, body: BroadcastRequest) {
  if (!body.broadcast_id) {
    return new Response(
      JSON.stringify({ error: "broadcast_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Deleting broadcast ${body.broadcast_id}`);

  // Delete the broadcast (notifications will be deleted via CASCADE)
  const { error } = await supabase
    .from("admin_broadcasts")
    .delete()
    .eq("id", body.broadcast_id);

  if (error) {
    console.error("Error deleting broadcast:", error);
    throw error;
  }

  console.log(`Deleted broadcast ${body.broadcast_id}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleCleanupExpired(supabase: SupabaseClientAny) {
  console.log("Running cleanup for expired notifications");

  const { data, error } = await supabase.rpc("cleanup_expired_notifications");

  if (error) {
    console.error("Error cleaning up expired notifications:", error);
    throw error;
  }

  console.log(`Cleanup complete, affected rows: ${data}`);

  return new Response(
    JSON.stringify({ success: true, affected_rows: data }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
