/**
 * Square-crop + downscale an image File into a sharp upload-ready JPEG Blob.
 *
 * Why: phone cameras and copy-pasted screenshots can produce non-square images
 * of arbitrary resolution. Uploading them as-is means the largest display
 * (e.g. dashboard hero avatar @ ~3x DPR) either has to upscale a tiny source
 * (blurry) or download a multi-megabyte file just to render at 96px.
 *
 * Output: square `outputSize`×`outputSize`, center-cropped, JPEG quality 0.92.
 * Defaults to 512px which is enough for every avatar slot in the app (≤ 128px
 * logical × 3x DPR = 384px actual) with headroom.
 */
export async function resizeAvatarToSquare(
  file: File,
  outputSize = 512,
  quality = 0.92,
): Promise<Blob> {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Use the browser's best downscale quality.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(img, sx, sy, side, side, 0, 0, outputSize, outputSize);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Downscale an image File to a max edge length and re-encode for upload.
 *
 * Why: the media bucket filled up with 11–42 MB PNGs from AI-generated covers, and the raw
 * storage endpoint serves them with `no-cache` — every page view downloaded them again. A
 * 2000px JPEG at quality 0.82 is under 400 KB and indistinguishable at every size we render.
 * Images at or below `maxEdge` are still re-encoded — a small PNG is usually still a large
 * JPEG-equivalent, and PNG is the wrong format for photographic content.
 *
 * Keeps the aspect ratio (covers, product shots and teasers are not square). Sources with
 * transparency stay PNG — a logo re-encoded as JPEG would get a black box behind it.
 */
export async function resizeImageForUpload(
  file: File,
  maxEdge = 2000,
  quality = 0.82,
): Promise<Blob> {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const factor = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * factor);
  canvas.height = Math.round(img.height * factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const keepAlpha = file.type !== "image/jpeg" && hasTransparency(ctx, canvas);

  // Transparenz zwingt frueher zu PNG, und ein PNG mit Fotoinhalt wiegt bei
  // 2000px schnell das Zehnfache eines JPEG. WebP kann beides: Alphakanal und
  // verlustbehaftete Kompression. PNG bleibt nur der Notnagel, falls der
  // Browser kein WebP schreibt — dann ist ein grosses Bild besser als keines.
  if (keepAlpha) {
    const webp = await toBlob(canvas, "image/webp", quality);
    if (webp) return webp;
    const png = await toBlob(canvas, "image/png");
    if (png) return png;
    throw new Error("Canvas toBlob failed");
  }

  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (jpeg) return jpeg;
  throw new Error("Canvas toBlob failed");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    // toBlob liefert bei einem nicht unterstuetzten Typ still null, statt zu werfen.
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

function hasTransparency(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}
