// supabase/functions/translate-content/index.ts
//
// Auto-translates admin-managed German content to English via DeepL and
// writes the result back into the matching *_en columns, respecting
// *_en_locked manual overrides.
//
// Reads the DeepL API key from Deno.env.get("DEEPL_API_KEY") first, then
// falls back to site_integration_configs.deepl.config.api_key. Detects
// DeepL Free vs Pro automatically by the ":fx" key suffix.
//
// Two usage modes:
//
//  POST { table, id, fields: ["title", "description"] }
//    → looks up the row, translates the listed DE fields, persists the
//      EN values (skipping any that are *_en_locked = true), returns the
//      updated row.
//
//  POST { text: "Hallo" }
//    → returns { translated: "Hello" } without touching the DB. Useful
//      for one-off translations from the admin UI (e.g. preview).
//
// Tables this function knows about live in TRANSLATABLE_TABLES below.
// Adding a new translatable column = extend that map.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripUnsafeHtml } from "../_shared/stripUnsafeHtml.ts";
import { hasAdminAccess } from "../_shared/adminAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FieldName = string;

const TRANSLATABLE_TABLES: Record<string, FieldName[]> = {
  partner_tiles: ["description"],
  location_teasers: ["title", "description", "city", "expected_date"],
  skypadel_gallery: ["alt_text"],
  qr_sections: ["title", "description"],
  articles: ["title", "excerpt", "body_html", "title_highlight", "lead"],
  events: ["title", "description", "price_label", "highlights"],
  marketplace_items: ["name", "subtitle", "description", "long_description", "meta_title", "meta_description"],
  marketplace_categories: ["name"],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const resolveDeeplKey = async (client: SupabaseClient): Promise<string | null> => {
  const envKey = Deno.env.get("DEEPL_API_KEY");
  if (envKey && envKey.trim().length > 0) return envKey.trim();

  const { data, error } = await client
    .from("site_integration_configs")
    .select("config")
    .eq("service", "deepl")
    .maybeSingle();
  if (error) return null;
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const key = (cfg.api_key ?? cfg.apiKey ?? "") as string;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
};

const deeplEndpoint = (key: string): string =>
  key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";

const translateBatch = async (
  texts: string[],
  apiKey: string,
  isHtml = false,
): Promise<string[]> => {
  if (texts.length === 0) return [];
  const endpoint = deeplEndpoint(apiKey);
  const body = new URLSearchParams();
  for (const text of texts) body.append("text", text);
  body.append("source_lang", "DE");
  body.append("target_lang", "EN-US");
  body.append("preserve_formatting", "1");
  body.append("formality", "default");
  // HTML content (e.g. articles.body_html): let DeepL parse the markup so tags survive
  // and only text nodes are translated. Without this DeepL escapes/splits the HTML.
  if (isHtml) {
    body.append("tag_handling", "html");
    body.append("split_sentences", "nonewlines");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`DeepL ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { translations?: Array<{ text: string }> };
  return (data.translations ?? []).map((t) => t.text);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Supabase service credentials missing in env" });
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authenticate caller + require admin role (same gate as generate-article)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) return json(401, { error: "Unauthorized" });

  // Geteiltes Werkzeug: wird aus mehreren Redaktionsseiten heraus aufgerufen.
  const TRANSLATE_PAGES = [
    "news", "events", "marketplace", "location-teasers",
    "partner-tiles", "skypadel-gallery", "qr-panel",
  ];
  if (!(await hasAdminAccess(client, user, TRANSLATE_PAGES))) {
    return json(403, { error: "Admin access required" });
  }

  const apiKey = await resolveDeeplKey(client);
  if (!apiKey) {
    return json(503, {
      error:
        "DeepL API key not configured. Set DEEPL_API_KEY env var or store it in site_integration_configs.deepl.config.api_key",
    });
  }

  // Mode 1: ad-hoc text translation
  if (typeof body.text === "string") {
    try {
      const [translated] = await translateBatch([body.text], apiKey);
      return json(200, { translated: translated ?? "" });
    } catch (err) {
      return json(502, { error: (err as Error).message });
    }
  }

  // Mode 2: row translation + persistence
  const table = body.table as string | undefined;
  const id = body.id as string | undefined;
  const fields = body.fields as string[] | undefined;

  if (!table || !id || !Array.isArray(fields) || fields.length === 0) {
    return json(400, {
      error: "Required fields: { table, id, fields: string[] } OR { text }",
    });
  }

  const allowedFields = TRANSLATABLE_TABLES[table];
  if (!allowedFields) {
    return json(400, { error: `Table not registered for translation: ${table}` });
  }
  const invalid = fields.filter((f) => !allowedFields.includes(f));
  if (invalid.length) {
    return json(400, {
      error: `Fields not allowed for ${table}: ${invalid.join(", ")}`,
    });
  }

  // Pull the source row with all DE values + lock flags
  const lockColumns = fields.map((f) => `${f}_en_locked`);
  const enColumns = fields.map((f) => `${f}_en`);
  const selectCols = ["id", ...fields, ...enColumns, ...lockColumns].join(", ");

  const { data: row, error: fetchErr } = await client
    .from(table)
    .select(selectCols)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return json(500, { error: `DB read failed: ${fetchErr.message}` });
  if (!row) return json(404, { error: `Row not found: ${table}/${id}` });

  // Decide which fields actually need translation right now. A field is either a plain-text
  // string, an HTML string (body_html — DeepL needs tag_handling=html) or a text[] array
  // (events.highlights — translated element-wise). Locked or empty fields are skipped.
  type Work =
    | { field: string; kind: "text"; text: string }
    | { field: string; kind: "html"; text: string }
    | { field: string; kind: "array"; arr: string[] };
  const work: Work[] = [];
  for (const field of fields) {
    const isLocked = Boolean((row as unknown as Record<string, unknown>)[`${field}_en_locked`]);
    if (isLocked) continue;
    const source = (row as unknown as Record<string, unknown>)[field];
    if (Array.isArray(source)) {
      const arr = source.filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      );
      if (arr.length === 0) continue;
      work.push({ field, kind: "array", arr });
    } else if (typeof source === "string" && source.trim().length > 0) {
      const kind = field === "body_html" || field.endsWith("_html") ? "html" : "text";
      work.push({ field, kind, text: source });
    }
  }

  if (work.length === 0) {
    return json(200, { row, updatedFields: [], skipped: fields });
  }

  const updatePayload: Record<string, string | string[] | null> = {};
  try {
    // Plain-text fields go in one batch call.
    const textItems = work.filter(
      (w): w is Extract<Work, { kind: "text" }> => w.kind === "text",
    );
    if (textItems.length > 0) {
      const out = await translateBatch(textItems.map((w) => w.text), apiKey, false);
      textItems.forEach((w, i) => {
        updatePayload[`${w.field}_en`] = out[i] ?? null;
      });
    }
    // HTML fields — one call each (DeepL applies a single tag_handling mode per request).
    // DeepL erhält Tags/Attribute unverändert (tag_handling=html) → vor dem DB-Write
    // gefährliche Konstrukte entfernen (Sicherheitsaudit 2026-07-31, Fund 2).
    for (const w of work) {
      if (w.kind !== "html") continue;
      const [out] = await translateBatch([w.text], apiKey, true);
      updatePayload[`${w.field}_en`] = out ? stripUnsafeHtml(out) : null;
    }
    // Array fields (text[]) — translate each element, persist back as an array.
    for (const w of work) {
      if (w.kind !== "array") continue;
      updatePayload[`${w.field}_en`] = await translateBatch(w.arr, apiKey, false);
    }
  } catch (err) {
    return json(502, { error: (err as Error).message });
  }

  const { data: updated, error: updateErr } = await client
    .from(table)
    .update(updatePayload)
    .eq("id", id)
    .select(selectCols)
    .maybeSingle();

  if (updateErr) return json(500, { error: `DB write failed: ${updateErr.message}` });

  return json(200, {
    row: updated,
    updatedFields: work.map((w) => w.field),
    skipped: fields.filter((f) => !work.find((x) => x.field === f)),
  });
});
