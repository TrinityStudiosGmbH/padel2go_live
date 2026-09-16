import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const allowedOrigins = [
  "https://www.padel2go-official.com","https://padel2go-official.com",
  "https://www.padel2go-official.de","https://padel2go-official.de",
  "https://padel2go.lovable.app","https://padel2go.de",
  "http://localhost:5173","http://localhost:8080",
];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (allowedOrigins.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com") || origin.endsWith(".vercel.app")) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin",
});

// Minimal branded page for the browser-GET path (a human clicking the List-Unsubscribe link).
const page = (ok: boolean) => `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${ok ? "Abgemeldet" : "Link ungültig"}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0a0a0a;color:#FAFAFA;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;">
  <div style="max-width:420px;padding:32px;">
    <img src="https://www.padel2go-official.de/email/logo-written.png" alt="PADEL2GO" width="200" style="display:block;width:200px;height:auto;margin:0 auto 20px;">
    ${ok
      ? `<h1 style="color:#C7F011;font-size:22px;margin:0 0 8px;">Du wurdest abgemeldet</h1><p style="color:#8a8a8a;">Schade, dass du gehst! Du erhältst keine Newsletter mehr von uns.</p>`
      : `<h1 style="font-size:22px;margin:0 0 8px;">Link ungültig</h1><p style="color:#8a8a8a;">Dieser Abmeldelink ist ungültig oder abgelaufen.</p>`}
  </div>
</body></html>`;

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  // GET = a human opened the List-Unsubscribe URL in a browser → return an HTML page.
  // POST = the mail client's RFC 8058 one-click (token in query) OR the SPA page (token in JSON).
  const isBrowserGet = req.method === "GET";
  const html = (ok: boolean, status: number) => new Response(page(ok), { status, headers: { ...cors(origin), "Content-Type": "text/html; charset=utf-8" } });
  const respond = (ok: boolean, status: number) =>
    isBrowserGet ? html(ok, status)
      : new Response(JSON.stringify(ok ? { success: true } : { error: "Ungültiger Link" }), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    let token: string | null = new URL(req.url).searchParams.get("token");
    if (!token && req.method === "POST") token = (await req.json().catch(() => ({})))?.token ?? null;
    if (!token) return respond(false, 400);
    const { data: row } = await admin.from("newsletter_subscribers")
      .select("id, unsubscribed_at").eq("unsubscribe_token", token).maybeSingle();
    if (!row) return respond(false, 404);
    if (!row.unsubscribed_at) {
      await admin.from("newsletter_subscribers").update({ unsubscribed_at: new Date().toISOString() }).eq("id", row.id);
    }
    return respond(true, 200); // idempotent
  } catch (e) {
    return isBrowserGet ? html(false, 500)
      : new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors(origin), "Content-Type": "application/json" } });
  }
});
