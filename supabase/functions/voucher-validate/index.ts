import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Prueft einen Gutscheincode, ohne ihn zu verbrauchen.
 *
 * Offen fuer Gaeste: wer ohne Konto bucht oder bestellt, soll seinen Code
 * genauso einloesen koennen. Vorher verlangte diese Funktion eine Anmeldung
 * und war fuer Gaeste damit unbenutzbar.
 *
 * Offen heisst durchprobierbar, deshalb eine Bremse ueber rate_limit_log
 * (dasselbe Muster wie bei Gastbuchungen): gezaehlt werden nur FEHLSCHLAEGE,
 * ein gueltiger Code kostet kein Kontingent. Sonst wuerde jemand, der drei
 * Bestellungen mit demselben Code macht, sich selbst aussperren.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Passt der Geltungsbereich des Codes zum Vorgang? */
const scopeMatches = (scope: string, wanted: string): boolean =>
  scope === "both" || scope === wanted;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json().catch(() => ({}))) as { code?: string; context?: string };
    const code = body.code;
    // Ohne Angabe die Buchung — so verhalten sich Altaufrufer unveraendert.
    const context = body.context === "marketplace" ? "marketplace" : "booking";

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return json({ valid: false, reason: "Kein Code angegeben" });
    }

    // Cloudflare setzt cf-connecting-ip serverseitig (nicht vom Client faelschbar).
    const clientIP =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
      "unknown";

    const FAILED_LIMIT = 15;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: failures } = await supabaseAdmin
      .from("rate_limit_log")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", clientIP)
      .eq("action", "voucher_validate_failed")
      .gte("created_at", windowStart);

    if (failures !== null && failures >= FAILED_LIMIT) {
      return json({ valid: false, reason: "Zu viele Versuche. Bitte später erneut." }, 429);
    }

    // Ein Fehlschlag kostet Kontingent, ein Treffer nicht.
    const countFailure = () =>
      supabaseAdmin
        .from("rate_limit_log")
        .insert({ ip_address: clientIP, action: "voucher_validate_failed" })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error("rate_limit_log insert failed", error);
        });

    const normalizedCode = code.trim().toUpperCase();

    const { data: voucher, error: voucherError } = await supabaseAdmin
      .from("voucher_codes")
      .select("*")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (voucherError || !voucher) {
      await countFailure();
      return json({ valid: false, reason: "Ungültiger Code" });
    }

    if (!voucher.is_active) {
      await countFailure();
      return json({ valid: false, reason: "Dieser Code ist nicht mehr aktiv" });
    }

    const now = new Date();
    if (new Date(voucher.valid_from) > now) {
      await countFailure();
      return json({ valid: false, reason: "Dieser Code ist noch nicht gültig" });
    }
    if (voucher.valid_until && new Date(voucher.valid_until) < now) {
      await countFailure();
      return json({ valid: false, reason: "Dieser Code ist abgelaufen" });
    }
    if (voucher.max_uses !== null && voucher.current_uses >= voucher.max_uses) {
      await countFailure();
      return json({ valid: false, reason: "Dieser Code wurde bereits vollständig eingelöst" });
    }

    // Geltungsbereich. Der Code existiert, ist aber hier nicht gemeint —
    // das gehoert klar gesagt, sonst sucht der Kunde den Fehler bei sich.
    const scope: string = voucher.scope ?? "booking";
    if (!scopeMatches(scope, context)) {
      return json({
        valid: false,
        reason: context === "marketplace"
          ? "Dieser Code gilt nur für Platzbuchungen"
          : "Dieser Code gilt nur für den Marketplace",
      });
    }

    // Lesbare Beschriftung fuer die Kasse.
    let discount_label = "Kostenlos";
    const dt: string = voucher.discount_type ?? "free";
    const dv: number = voucher.discount_value ?? 0;
    if (dt === "percentage" && dv < 100) {
      discount_label = `${dv} % Rabatt`;
    } else if (dt === "fixed" && dv > 0) {
      discount_label = `${(dv / 100).toFixed(2).replace(".", ",")} € Rabatt`;
    }

    return json({
      valid: true,
      voucher_id: voucher.id,
      description: voucher.description,
      discount_type: dt,
      discount_value: dv,
      discount_label,
      scope,
    });
  } catch (err) {
    console.error("voucher-validate error:", err);
    return json({ valid: false, reason: "Serverfehler" }, 500);
  }
});
