import { supabase } from "@/integrations/supabase/client";
import { resizeImageForUpload } from "@/lib/resizeImage";

/** 30 Tage. Ohne cacheControl liefert der Storage-Endpunkt `no-cache` aus. */
const CACHE_CONTROL = "2592000";

/** Nicht durch den Canvas: SVG verliert die Skalierbarkeit, GIF die Animation. */
const PASS_THROUGH = /^image\/(svg\+xml|gif)$/;

type UploadOptions = {
  bucket?: string;
  upsert?: boolean;
  /** Längste Kante des Derivats. Default 2000px — reicht für jede Fläche, die wir rendern. */
  maxEdge?: number;
  quality?: number;
};

/**
 * Lädt eine Datei verkleinert und cachebar in den `media`-Bucket und gibt die öffentliche
 * URL zurück. Bilder gehen durch `resizeImageForUpload()`, alles andere (Videos, SVG, GIF,
 * PDFs) unverändert durch — die Endung im Pfad folgt dem, was wirklich hochgeladen wird.
 *
 * `pathWithoutExt` ist der Zielpfad ohne Endung, z. B. `news/<uuid>`.
 */
export async function uploadMediaFile(
  file: File,
  pathWithoutExt: string,
  opts: UploadOptions = {},
): Promise<string> {
  const bucket = opts.bucket ?? "media";
  const resize = file.type.startsWith("image/") && !PASS_THROUGH.test(file.type);

  // Verkleinern darf nie der Grund sein, dass ein Upload scheitert: HEIC vom iPhone kann
  // der Canvas außerhalb von Safari nicht dekodieren — dann eben das Original.
  const body = resize ? await resizeOrKeep(file, opts) : file;
  const contentType = body.type || file.type || undefined;
  const ext = extensionFor(contentType, file.name);
  const path = `${pathWithoutExt}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    upsert: opts.upsert ?? false,
    contentType,
    cacheControl: CACHE_CONTROL,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Groesse, ab der ein Bild nicht mehr durchgeht. Ein auf 2000px verkleinertes
 * Bild liegt weit darunter; wer hier anschlaegt, laedt ein Original hoch, das
 * sich nicht verkleinern liess.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function resizeOrKeep(file: File, opts: UploadOptions): Promise<Blob> {
  try {
    return await resizeImageForUpload(file, opts.maxEdge, opts.quality);
  } catch (error) {
    // Bisher ging hier stillschweigend das Original hinaus. Der Bildwandler von
    // Supabase lehnt grosse Quellen mit 400 ab, die Anzeige faellt aufs Original
    // zurueck — und jeder Besucher laedt dann zweistellige Megabyte. Einmal
    // beim Hochladen scheitern ist besser als das dauerhaft auszuliefern.
    console.warn("Bild konnte nicht verkleinert werden:", error);
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `Das Bild ließ sich nicht verkleinern und ist mit ${(file.size / 1048576).toFixed(1)} MB ` +
        "zu groß zum Ausliefern. Bitte das Bild vorher auf maximal 2000 Pixel Kantenlänge " +
        "verkleinern und erneut hochladen.",
      );
    }
    return file;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function extensionFor(contentType: string | undefined, fileName: string): string {
  const known = contentType ? EXT_BY_TYPE[contentType] : undefined;
  if (known) return known;
  return (fileName.split(".").pop() || "bin").toLowerCase();
}
