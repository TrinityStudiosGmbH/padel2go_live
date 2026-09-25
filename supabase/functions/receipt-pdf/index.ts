import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { buildPdf, type Receipt, type Biller } from "../_shared/receiptPdf.ts";

/**
 * Die Rechnung als PDF.
 *
 * Erzeugt wird sie bei jedem Abruf neu aus dem Beleg, nicht gespeichert. Der
 * Beleg ist unveraenderlich, also faellt jedes Mal dasselbe Dokument heraus —
 * das ist die Eigenschaft, auf die es ankommt, und sie kommt ohne Dateiablage
 * aus. Die Firmenangaben liegen in billing_profile und sind die einzige
 * Ausnahme: aendert sich die Anschrift, tragen alte Rechnungen die neue. Fuer
 * eine UG mit einem Sitz ist das vertretbar; waere es das nicht, muesste der
 * Absender mit auf den Beleg eingefroren werden.
 *
 * Zwei Wege hinein:
 *   - Angemeldet: Authorization-Header, der Beleg muss dem Nutzer gehoeren.
 *   - Gast: access_token aus dem Link in der Bestaetigungsmail.
 */

const allowedOrigins = [
  "https://www.padel2go-official.com", "https://padel2go-official.com",
  "https://www.padel2go-official.de", "https://padel2go-official.de",
  "https://padel2go.lovable.app", "https://padel2go.de",
  "http://localhost:5173", "http://localhost:8080",
];

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin":
    origin && (allowedOrigins.includes(origin) || origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com") || origin.endsWith(".vercel.app"))
      ? origin
      : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
});

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

  const jsonHeaders = { ...cors(origin), "Content-Type": "application/json" };

  try {
    const url = new URL(req.url);
    let receiptId = url.searchParams.get("receipt_id");
    let token = url.searchParams.get("token");
    // Bequemer fuer die Oberflaeche: sie kennt die Bestellung, nicht den Beleg.
    let sourceId = url.searchParams.get("source_id");
    let receiptType = url.searchParams.get("receipt_type");
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as {
        receipt_id?: string; token?: string; source_id?: string; receipt_type?: string;
      };
      receiptId = body.receipt_id ?? receiptId;
      token = body.token ?? token;
      sourceId = body.source_id ?? sourceId;
      receiptType = body.receipt_type ?? receiptType;
    }

    const KNOWN_TYPES = ["marketplace_order", "marketplace_refund", "booking", "booking_refund", "lobby_share", "lobby_share_refund", "event_ticket", "event_ticket_refund"];
    if (receiptType && !KNOWN_TYPES.includes(receiptType)) {
      return new Response(JSON.stringify({ error: "Unbekannte Belegart" }), { status: 400, headers: jsonHeaders });
    }

    if (!receiptId && !token && !sourceId) {
      return new Response(JSON.stringify({ error: "receipt_id, source_id oder token fehlt" }), { status: 400, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Token gewinnt: der Link aus der Mail soll ohne Anmeldung funktionieren.
    let receipt: Receipt | null = null;
    if (token) {
      const { data } = await supabaseAdmin.from("receipts").select("*").eq("access_token", token).maybeSingle();
      receipt = (data as Receipt) ?? null;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Nicht angemeldet" }), { status: 401, headers: jsonHeaders });
      }
      const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
      const user = userData?.user;
      if (!user) {
        return new Response(JSON.stringify({ error: "Nicht angemeldet" }), { status: 401, headers: jsonHeaders });
      }

      // Admins duerfen jeden Beleg laden. Ohne das kaeme die Verwaltung nicht an
      // die Rechnung einer Bestellung — und muesste dem Kunden bei Rueckfragen
      // sagen, dass sie sein Dokument nicht sehen kann.
      let isAdmin = user.email === "fsteinfelder@padel2go.eu";
      if (!isAdmin) {
        const { data: role } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        isAdmin = !!role;
      }
      let q = supabaseAdmin.from("receipts").select("*");
      if (receiptId) q = q.eq("id", receiptId);
      else {
        q = q.eq("source_id", sourceId!);
        // Ohne Angabe die Rechnung, nicht die Korrektur: der Knopf an der
        // Bestellung meint immer das Hauptdokument.
        q = q.eq("receipt_type", receiptType ?? (sourceId ? "marketplace_order" : "booking"));
      }
      const { data } = await q.maybeSingle();
      const candidate = (data as Receipt) ?? null;
      // Fremde Belege sehen aus wie nicht vorhandene: kein Rueckschluss darauf,
      // welche Belegnummern es gibt. Fuer Admins gilt das nicht.
      receipt = candidate && (isAdmin || candidate.user_id === user.id) ? candidate : null;
    }

    if (!receipt) {
      return new Response(JSON.stringify({ error: "Rechnung nicht gefunden" }), { status: 404, headers: jsonHeaders });
    }

    const { data: billerRow } = await supabaseAdmin
      .from("billing_profile").select("*").eq("id", "global").maybeSingle();

    const biller = (billerRow ?? {}) as Biller;
    if (!biller.company_name) {
      return new Response(
        JSON.stringify({ error: "Rechnungsangaben fehlen (Admin → Einstellungen → Rechnungsangaben)" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const bytes = await buildPdf(receipt, biller);
    const filename = `${receipt.receipt_number}.pdf`;

    // pdf-lib liefert Uint8Array<ArrayBufferLike>; die Deno-Typen erwarten einen
    // konkreten ArrayBuffer. Einmal umkopieren statt casten.
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);

    return new Response(buf, {
      headers: {
        ...cors(origin),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[receipt-pdf]", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
