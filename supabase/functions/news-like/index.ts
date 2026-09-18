import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const allowedOrigins = [
  "https://www.padel2go-official.com", "https://padel2go-official.com",
  "https://www.padel2go-official.de", "https://padel2go-official.de",
  "https://padel2go.lovable.app", "https://padel2go.de",
  "http://localhost:5173", "http://localhost:8080",
];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (allowedOrigins.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com") || origin.endsWith(".vercel.app")) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req.headers.get("origin")) });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const body = await req.json().catch(() => ({}));
    const { article_id, peek } = body as { article_id?: string; peek?: boolean };

    // Eingeloggt → Identität über den JWT; anonym → gehashte IP (pseudonymisiert, kein Klartext in der DB).
    let userId: string | null = null;
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await sha256Hex(`p2g-news-like-v1:${ip}`);

    // Nur nachsehen, nichts ändern: liefert alle Artikel, die diese Identität
    // bereits geliked hat. Gäste erfahren so ihren echten Zustand — ohne das
    // sahen sie nach einem Gerätewechsel „nicht geliked" und ihr erster Klick
    // hat den vorhandenen Like wieder entfernt.
    if (peek) {
      const q = userId
        ? admin.from("news_likes").select("article_id").eq("user_id", userId)
        : admin.from("news_likes").select("article_id").eq("ip_hash", ipHash).is("user_id", null);
      const { data, error } = await q;
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      return new Response(
        JSON.stringify({ liked_ids: (data ?? []).map((r: { article_id: string }) => r.article_id) }),
        { headers },
      );
    }

    if (!article_id || typeof article_id !== "string")
      return new Response(JSON.stringify({ error: "article_id fehlt" }), { status: 400, headers });

    const { data: article } = await admin
      .from("articles").select("id").eq("id", article_id).eq("is_published", true).maybeSingle();
    if (!article) return new Response(JSON.stringify({ error: "Artikel nicht gefunden" }), { status: 404, headers });

    const match = userId
      ? admin.from("news_likes").select("id").eq("article_id", article_id).eq("user_id", userId)
      : admin.from("news_likes").select("id").eq("article_id", article_id).eq("ip_hash", ipHash).is("user_id", null);
    const { data: existing } = await match.maybeSingle();

    let liked: boolean;
    if (existing) {
      await admin.from("news_likes").delete().eq("id", existing.id);
      liked = false;
    } else {
      const { error } = await admin.from("news_likes").insert(
        userId ? { article_id, user_id: userId } : { article_id, ip_hash: ipHash },
      );
      // Unique-Konflikt (Doppelklick/Race) → Like existiert bereits
      liked = !error || error.code !== "23505" ? !error : true;
    }

    const { data: updated } = await admin.from("articles").select("like_count").eq("id", article_id).single();
    return new Response(JSON.stringify({ liked, like_count: updated?.like_count ?? 0 }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers });
  }
});
