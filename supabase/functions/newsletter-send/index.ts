import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@4.0.0";
import { resolveResendKey, DEFAULT_FROM, REPLY_TO_EMAIL } from "../_shared/email.ts";
import { renderNewsletterHtml } from "../_shared/newsletter.ts";
import { hasAdminAccess } from "../_shared/adminAccess.ts";

const APP = "https://www.padel2go-official.de";
const BATCH = 100;
const SEND_DELAY_MS = 350; // throttle to stay under Resend's rate limit
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPERADMIN = "fsteinfelder@padel2go.eu";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  const H = { ...corsHeaders, "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(url, serviceKey);

    // Auth: service-role bearer (self-continue) OR an admin JWT (initial trigger).
    // Guard against an unset service key turning `Bearer ` (empty token) into "internal".
    const authHeader = req.headers.get("Authorization") ?? "";
    const isInternal = serviceKey.length > 0 && authHeader === `Bearer ${serviceKey}`;
    if (!isInternal) {
      const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
      const { data: u } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
      const user = u?.user;
      if (!user) return new Response(JSON.stringify({ error: "Nicht autorisiert" }), { status: 401, headers: H });
      if (!(await hasAdminAccess(admin, user, "newsletter"))) {
        return new Response(JSON.stringify({ error: "Keine Admin-Berechtigung" }), { status: 403, headers: H });
      }
    }

    const { campaign_id, test_to, _continue } = await req.json().catch(() => ({}));
    if (!campaign_id) return new Response(JSON.stringify({ error: "campaign_id fehlt" }), { status: 400, headers: H });

    const { data: campaign } = await admin.from("newsletter_campaigns")
      .select("id, subject, preheader, blocks, status").eq("id", campaign_id).maybeSingle();
    if (!campaign) return new Response(JSON.stringify({ error: "Kampagne nicht gefunden" }), { status: 404, headers: H });

    const resendKey = await resolveResendKey(admin);
    if (!resendKey) return new Response(JSON.stringify({ error: "RESEND_API_KEY fehlt" }), { status: 500, headers: H });
    const resend = new Resend(resendKey);

    // TEST MODE — one email, no subscriber writes.
    if (test_to) {
      const html = renderNewsletterHtml(campaign, { unsubscribeUrl: `${APP}/newsletter/abmelden?token=preview` });
      const r = await resend.emails.send({ from: DEFAULT_FROM, to: [test_to], replyTo: REPLY_TO_EMAIL, subject: `[TEST] ${campaign.subject}`, html });
      if (r.error) return new Response(JSON.stringify({ error: r.error.message ?? "Resend-Fehler" }), { status: 502, headers: H });
      return new Response(JSON.stringify({ success: true, test: true, id: r.data?.id }), { headers: H });
    }

    // LAUNCH MODE. The initial (admin) call sets up; self-continue calls skip setup.
    if (!_continue) {
      if (campaign.status === "sent") return new Response(JSON.stringify({ error: "Kampagne wurde bereits gesendet" }), { status: 409, headers: H });
      // Atomic single-winner flip prevents a double-click from starting two senders.
      const { data: flipped } = await admin.from("newsletter_campaigns")
        .update({ status: "sending" }).eq("id", campaign_id).neq("status", "sending").select("id");
      if (!flipped || flipped.length === 0) return new Response(JSON.stringify({ error: "Versand läuft bereits" }), { status: 409, headers: H });
      const { count } = await admin.from("newsletter_subscribers").select("*", { count: "exact", head: true })
        .not("confirmed_at", "is", null).is("unsubscribed_at", null);
      await admin.from("newsletter_campaigns").update({ recipient_count: count ?? 0 }).eq("id", campaign_id);
    }

    const deadline = Date.now() + 100_000; // soft time budget; self-continue past it
    let processedThisRun = 0;
    while (Date.now() < deadline) {
      // Atomically select + claim the next batch (one RPC; no separate unchecked claim step).
      const { data: batch, error: claimError } = await admin.rpc("newsletter_claim_batch", { p_campaign_id: campaign_id, p_limit: BATCH });
      if (claimError) {
        // Never spin blindly on a DB error — surface it and stop so it's observable.
        await admin.from("newsletter_campaigns").update({ status: "failed" }).eq("id", campaign_id);
        return new Response(JSON.stringify({ error: `claim failed: ${claimError.message}` }), { status: 500, headers: H });
      }
      if (!batch || batch.length === 0) {
        await admin.rpc("newsletter_finalize", { p_campaign_id: campaign_id });
        return new Response(JSON.stringify({ success: true, done: true, processedThisRun }), { headers: H });
      }

      const sentIds: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      for (const r of batch as Array<{ subscriber_id: string; email: string; unsubscribe_token: string }>) {
        // In-body link → the branded SPA page (nice for humans). Header → the edge function,
        // which handles the RFC 8058 one-click POST server-side (the SPA route can't).
        const unsubscribeUrl = `${APP}/newsletter/abmelden?token=${r.unsubscribe_token}`;
        const oneClickUrl = `${url}/functions/v1/newsletter-unsubscribe?token=${r.unsubscribe_token}`;
        try {
          const resp = await resend.emails.send({
            from: DEFAULT_FROM, to: [r.email], replyTo: REPLY_TO_EMAIL, subject: campaign.subject,
            html: renderNewsletterHtml(campaign, { unsubscribeUrl }),
            headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          if (resp.error) throw new Error(resp.error.message ?? "Resend-Fehler");
          sentIds.push(r.subscriber_id);
        } catch (e) {
          // A failed send stays retryable: newsletter_claim_batch re-arms it (attempts+1) until 3.
          failed.push({ id: r.subscriber_id, error: (e as Error).message });
        }
        await sleep(SEND_DELAY_MS);
      }

      // Batched status writes: the common (all-sent) path is a single round-trip.
      if (sentIds.length) {
        await admin.from("newsletter_sends").update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("campaign_id", campaign_id).in("subscriber_id", sentIds);
      }
      for (const f of failed) {
        await admin.from("newsletter_sends").update({ status: "failed", error: f.error })
          .eq("campaign_id", campaign_id).eq("subscriber_id", f.id);
      }
      await admin.rpc("newsletter_progress", { p_campaign_id: campaign_id });
      processedThisRun += batch.length;
    }

    // Budget hit with work remaining → fire a self-continue that survives the response.
    const cont = fetch(`${url}/functions/v1/newsletter-send`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ campaign_id, _continue: true }),
    });
    // @ts-ignore Supabase edge runtime background task
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(cont); else await cont;
    return new Response(JSON.stringify({ success: true, continued: true, processedThisRun }), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: H });
  }
});
