import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@4.0.0";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { DEFAULT_FROM, REPLY_TO_EMAIL, brandedEmailHtml } from "../_shared/email.ts";
import { AGB_ATTACHMENT } from "../_shared/agb-text.ts";

// Resend is initialized lazily inside the handler so we can fall back to DB config

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-BOOKING-CONFIRMATION] ${step}${detailsStr}`);
};

interface ConfirmationRequest {
  booking_id: string;
  user_id?: string;
  guest_email?: string;
  guest_name?: string;
  payment_type: "owner";
  amount_cents?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Set once we atomically claim the confirmation. If ANY step after the claim
  // throws, the outer catch releases it so a retried delivery re-sends (mirrors
  // send-marketplace-confirmation). Without this a transient blip would leave the
  // booking marked 'confirmation sent' with no email ever delivered.
  let releaseClaim: (() => Promise<void>) | null = null;

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Only allow calls from internal services (stripe-webhook, etc.) using service role key
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      logStep("Unauthorized call rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve Resend API key: env var takes precedence, DB config is fallback
    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    let appUrl = Deno.env.get("APP_URL");
    if (!resendApiKey || !appUrl) {
      const { data: ic } = await supabase.from("site_integration_configs").select("config, service").in("service", ["resend", "app"]);
      for (const row of ic ?? []) {
        const cfg = (row.config as Record<string, string>) ?? {};
        if (row.service === "resend" && !resendApiKey) resendApiKey = cfg.api_key;
        if (row.service === "app" && !appUrl) appUrl = cfg.url;
      }
    }
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(resendApiKey);

    const { booking_id, user_id, guest_email, guest_name, payment_type, amount_cents }: ConfirmationRequest = await req.json();
    logStep("Request parsed", { booking_id, user_id: user_id ?? "guest", payment_type, amount_cents });

    if (!booking_id) {
      throw new Error("booking_id is required");
    }
    if (!user_id && !guest_email) {
      throw new Error("Either user_id or guest_email is required");
    }

    // Fetch booking details with location and court
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        status,
        confirmation_sent_at,
        start_time,
        end_time,
        price_cents,
        currency,
        user_id,
        courts!inner(id, name),
        locations!inner(id, name, address, city)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Failed to fetch booking: ${bookingError?.message || "Not found"}`);
    }
    logStep("Booking fetched", { bookingId: booking.id });

    // Idempotency (mirrors send-marketplace-confirmation): only a CONFIRMED booking
    // gets a confirmation, and only the caller that flips confirmation_sent_at NULL→now
    // sends the mail. So a re-delivered Stripe webhook (or free-path + a retry) never
    // double-mails, and a failed send releases the claim so a later retry re-sends.
    if ((booking as any).status !== "confirmed") {
      logStep("Skip — booking not confirmed", { status: (booking as any).status });
      return new Response(JSON.stringify({ success: true, skipped: "not_confirmed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((booking as any).confirmation_sent_at) {
      logStep("Skip — confirmation already sent");
      return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: claimed } = await supabase
      .from("bookings")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", booking_id)
      .is("confirmation_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      logStep("Skip — confirmation already claimed");
      return new Response(JSON.stringify({ success: true, skipped: "already_claimed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    releaseClaim = async () => {
      await supabase.from("bookings").update({ confirmation_sent_at: null }).eq("id", booking_id);
    };

    // Resolve recipient email + name
    let recipientEmail: string;
    let recipientName: string;

    if (guest_email) {
      // Guest booking — use provided email/name directly
      recipientEmail = guest_email;
      recipientName = guest_name || "Gast";
      logStep("Guest recipient resolved", { email: recipientEmail });
    } else {
      // Authenticated user — fetch from auth.users + profile
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id!);
      if (userError || !userData.user?.email) {
        throw new Error(`Failed to fetch user email: ${userError?.message || "No email"}`);
      }
      recipientEmail = userData.user.email;
      logStep("Recipient email fetched", { email: recipientEmail });

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", user_id!)
        .single();

      recipientName = profile?.display_name || profile?.username || "Spieler";
    }

    // Calculate duration and format times
    const startDate = new Date(booking.start_time);
    const endDate = new Date(booking.end_time);
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    };
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    
    const formattedDate = startDate.toLocaleDateString('de-DE', dateOptions);
    const startTime = startDate.toLocaleTimeString('de-DE', timeOptions);
    const endTime = endDate.toLocaleTimeString('de-DE', timeOptions);

    // Determine paid amount
    const paidAmountCents = amount_cents ?? booking.price_cents ?? 0;

    // Receipt (sequential number + VAT split) — created by the payment webhook; may
    // not exist yet for free bookings or if this mail races the webhook.
    const { data: bookingReceipt } = await supabase
      .from("receipts")
      .select("receipt_number, tax_rate, tax_cents")
      .eq("receipt_type", "booking")
      .eq("source_id", booking_id)
      .maybeSingle();
    const taxLine = bookingReceipt && (bookingReceipt.tax_cents ?? 0) > 0
      ? `enthaltene USt (${Number(bookingReceipt.tax_rate ?? 19).toFixed(0)} %): ${((bookingReceipt.tax_cents ?? 0) / 100).toFixed(2).replace(".", ",")} €`
      : "";
    const receiptNumberLine = bookingReceipt?.receipt_number ? `Belegnr. ${bookingReceipt.receipt_number}` : "";

    const finalAmountCents = paidAmountCents ?? 0;
    const paidAmount = (finalAmountCents / 100).toFixed(2).replace('.', ',');
    const bookingRef = booking.id.substring(0, 8).toUpperCase();

    // Get location and court details - these are single objects due to !inner join
    const location = (Array.isArray(booking.locations) ? booking.locations[0] : booking.locations) as { id: string; name: string; address?: string; city?: string };
    const court = (Array.isArray(booking.courts) ? booking.courts[0] : booking.courts) as { id: string; name: string };

    // ── Calendar (.ics attachment + Add-to-Google-Calendar link) ──
    const pad = (n: number) => String(n).padStart(2, "0");
    const toICS = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const icsEscape = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const calSummary = `Padel: ${court.name} @ ${location.name}`;
    const calLocation = [location.name, location.address, location.city].filter(Boolean).join(", ");
    const calDescription = `Deine PADEL2GO Buchung – Buchungsnr. #${bookingRef}`;
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PADEL2GO//Booking//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${booking.id}@padel2go`,
      `DTSTAMP:${toICS(new Date())}`,
      `DTSTART:${toICS(startDate)}`,
      `DTEND:${toICS(endDate)}`,
      `SUMMARY:${icsEscape(calSummary)}`,
      `LOCATION:${icsEscape(calLocation)}`,
      `DESCRIPTION:${icsEscape(calDescription)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const googleCalUrl =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(calSummary)}` +
      `&dates=${toICS(startDate)}/${toICS(endDate)}` +
      `&location=${encodeURIComponent(calLocation)}` +
      `&details=${encodeURIComponent(calDescription)}`;

    // Different messaging for owner vs participant
    const isOwner = payment_type === "owner";
    const subjectLine = isOwner 
      ? "✅ Deine Buchung ist bestätigt!"
      : "✅ Deine Zahlung war erfolgreich!";
    
    const headerText = isOwner
      ? "Buchung bestätigt!"
      : "Zahlung erfolgreich!";
    
    const introText = isOwner
      ? "Deine Buchung wurde erfolgreich bezahlt und ist damit bestätigt."
      : "Deine Teilnahme am Match wurde erfolgreich bezahlt.";

    // Generate booking URL (appUrl resolved above, fallback to production domain)
    const resolvedAppUrl = appUrl || "https://www.padel2go-official.de";
    // Guests land on /booking (they can't access the dashboard); users go to their booking list
    const bookingUrl = guest_email
      ? `${resolvedAppUrl}/booking`
      : `${resolvedAppUrl}/dashboard/booking`;

    const htmlContent = brandedEmailHtml({
      title: subjectLine,
      preheader: `${formattedDate}, ${startTime} Uhr · ${court.name} @ ${location.name}`,
      emoji: "🎾",
      heading: headerText,
      intro: introText,
      greetingName: recipientName,
      rowsTitle: "Buchungsdetails",
      rows: [
        { label: "Standort", value: location.name },
        ...(location.address ? [{ label: "Adresse", value: `${location.address}${location.city ? `, ${location.city}` : ""}` }] : []),
        { label: "Datum", value: formattedDate },
        { label: "Uhrzeit", value: `${startTime} – ${endTime} Uhr (${durationMinutes} Min)` },
        { label: "Court", value: court.name },
        { label: "Buchungsnr.", value: `#${bookingRef}` },
      ],
      highlight: { label: "Bezahlt", value: `${paidAmount} €`, sub: [taxLine, receiptNumberLine] },
      ctaLabel: "Buchung ansehen",
      ctaUrl: bookingUrl,
      secondaryCtaLabel: "📅 Zum Google Kalender hinzufügen",
      secondaryCtaUrl: googleCalUrl,
      note: "Die .ics-Datei im Anhang funktioniert mit Apple Kalender & Outlook. Wir freuen uns auf dein Match! 🏆",
      legalHtml: "Kostenlose Stornierung bis Spielbeginn. Kein gesetzliches Widerrufsrecht bei termingebundenen Freizeitleistungen (§ 312g Abs. 2 Nr. 9 BGB).",
    });

    // Send email
    const emailResponse = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [recipientEmail],
      replyTo: REPLY_TO_EMAIL,
      subject: subjectLine,
      html: htmlContent,
      attachments: [
        {
          filename: "padel2go-booking.ics",
          content: encodeBase64(icsContent),
          contentType: "text/calendar",
        },
        AGB_ATTACHMENT,
      ],
    });

    if (emailResponse.error) {
      throw new Error(`Resend send failed: ${emailResponse.error.message ?? JSON.stringify(emailResponse.error)}`);
    }
    logStep("Email sent successfully", { emailId: emailResponse.data?.id });

    return new Response(JSON.stringify({ success: true, emailId: emailResponse.data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Release the idempotency claim so a retried delivery re-sends instead of the
    // booking being stuck 'confirmation sent' with no email out.
    if (releaseClaim) {
      try { await releaseClaim(); } catch (_) { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
