import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { DEFAULT_FROM, INTERNAL_INBOX, brandedEmailHtml, blockMessage } from "../_shared/email.ts";

// Resend is initialized lazily inside the handler so we can fall back to DB config

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

interface ContactEmailRequest {
  name: string;
  email: string;
  reason: string;
  message: string;
  organization?: string;
}

const reasonLabels: Record<string, string> = {
  spieler: "Frage als Spieler",
  verein: "Anfrage als Verein",
  partner: "Partnerschaftsanfrage",
  presse: "Presseanfrage",
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 3;

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  console.log("send-contact-email function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    console.log("Client IP:", clientIP);

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Resolve Resend API key: env var takes precedence, DB config is fallback
    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      const { data: ic } = await supabaseAdmin.from("site_integration_configs").select("config").eq("service", "resend").single();
      resendApiKey = (ic?.config as Record<string, string>)?.api_key;
    }
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(resendApiKey);

    // Check rate limit
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    
    const { count, error: countError } = await supabaseAdmin
      .from('rate_limit_log')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', clientIP)
      .eq('action', 'contact_form')
      .gte('created_at', windowStart);

    if (countError) {
      console.error("Rate limit check error:", countError);
      // Continue without rate limiting if check fails
    } else if (count !== null && count >= MAX_REQUESTS_PER_WINDOW) {
      console.log(`Rate limit exceeded for IP: ${clientIP}, count: ${count}`);
      return new Response(
        JSON.stringify({ error: "Zu viele Anfragen. Bitte versuche es später erneut." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { name, email, reason, message, organization }: ContactEmailRequest = await req.json();
    
    console.log("Received contact request:", { name, reason });

    if (!name || !email || !message) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Name, E-Mail und Nachricht sind erforderlich" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Basic input validation
    if (name.length > 100 || email.length > 255 || message.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Eingabe zu lang" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Ungültige E-Mail-Adresse" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const reasonLabel = reasonLabels[reason] || reason || "Allgemeine Anfrage";

    // Log the request for rate limiting (before sending email)
    const { error: logError } = await supabaseAdmin
      .from('rate_limit_log')
      .insert({
        ip_address: clientIP,
        action: 'contact_form',
      });

    if (logError) {
      console.error("Failed to log rate limit entry:", logError);
      // Continue even if logging fails
    }

    // Send the enquiry to the internal inbox; reply_to = the submitter so replies reach them.
    const emailResponse = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [INTERNAL_INBOX],
      reply_to: email,
      subject: `Kontaktanfrage: ${reasonLabel} - ${name}`,
      html: brandedEmailHtml({
        internal: true,
        title: `Kontaktanfrage: ${reasonLabel}`,
        preheader: `${name} · ${reasonLabel}`,
        emoji: "✉️",
        heading: "Neue Kontaktanfrage",
        intro: "Über das Kontaktformular auf padel2go-official.de eingegangen.",
        rows: [
          { label: "Anfrageart", value: reasonLabel },
          { label: "Name", value: name },
          { label: "E-Mail", value: email },
          ...(organization ? [{ label: "Organisation", value: organization }] : []),
        ],
        bodyHtml: blockMessage(message, "Nachricht"),
        ctaLabel: "Antworten",
        ctaUrl: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Re: ${reasonLabel}`)}`,
        note: "Antworten auf diese Mail gehen direkt an die absendende Person (Reply-To).",
      }),
    });

    // Resend's SDK does NOT throw on API errors — it returns { data, error }. Surface it
    // instead of silently reporting success with no message ever delivered.
    if (emailResponse.error) {
      console.error("Resend returned an error:", emailResponse.error);
      return new Response(JSON.stringify({ error: "E-Mail konnte nicht gesendet werden", detail: emailResponse.error }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, id: emailResponse.data?.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Fehler beim Senden der E-Mail" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
