import { useEffect, useRef, useState } from "react";

/**
 * Lichtbrechung am Rand der Glasleiste, nach dem Vorbild von iOS 26.
 *
 * Wie es funktioniert: eine Verzerrungskarte kodiert in ihrem Rot- und
 * Gruenkanal, um wie viele Pixel der Hintergrund an dieser Stelle verschoben
 * wird (128 = keine Verschiebung). Die Karte ist in der Mitte neutral und wird
 * nur zum Rand hin aktiv — so bleibt der Text in der Mitte ruhig und lesbar,
 * waehrend die Kante den Hintergrund bricht wie echtes Glas.
 *
 * Nur Chromium wertet einen SVG-Filter innerhalb von backdrop-filter aus.
 * Safari und Firefox bekommen deshalb gar nichts davon zu sehen — und keinen
 * Fehler, sondern schlicht die sauberen Blur-Ebenen aus index.css.
 */

/** Wie tief die Brechung nach innen reicht, in Pixeln. */
const EDGE_DEPTH = 16;
/** Maximale Verschiebung. Groesser = staerker gebrochen, ab etwa 20 wird es glitschig. */
const DISPLACE_SCALE = 11;
/** Versatz der drei Farbkanaele gegeneinander (chromatische Aberration). */
const CHROMA_SPREAD = 1.6;

/** Vorzeichenbehafteter Abstand zum Rand einer abgerundeten Box. Negativ = innen. */
function roundedBoxDistance(x: number, y: number, halfW: number, halfH: number, r: number) {
  const qx = Math.abs(x) - halfW + r;
  const qy = Math.abs(y) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Baut die Verzerrungskarte als PNG-Data-URI. Laeuft nur bei Groessenaenderung,
 * nie pro Bild — sonst waere das eine Rechenlast auf jedem Frame.
 */
function buildDisplacementMap(width: number, height: number, radius: number): string | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) return null;

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.min(radius, halfW, halfH);

  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - halfH;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW;
      const d = roundedBoxDistance(px, py, halfW, halfH, r);
      const depth = -d; // Abstand vom Rand nach innen
      const i = (y * w + x) * 4;

      if (depth < 0 || depth > EDGE_DEPTH) {
        // Ausserhalb oder tief im Inneren: neutral, kein Versatz.
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 255;
        continue;
      }

      // Richtung der Kante ueber den numerischen Gradienten des Abstandsfelds.
      const gx =
        roundedBoxDistance(px + 1, py, halfW, halfH, r) -
        roundedBoxDistance(px - 1, py, halfW, halfH, r);
      const gy =
        roundedBoxDistance(px, py + 1, halfW, halfH, r) -
        roundedBoxDistance(px, py - 1, halfW, halfH, r);
      const len = Math.hypot(gx, gy) || 1;

      // Weich von 1 am Rand auf 0 nach innen (smoothstep), damit keine Kante
      // in der Verzerrung selbst sichtbar wird.
      const t = 1 - depth / EDGE_DEPTH;
      const falloff = t * t * (3 - 2 * t);

      data[i] = Math.round(128 + (gx / len) * falloff * 127);
      data[i + 1] = Math.round(128 + (gy / len) * falloff * 127);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Blink-Engines werten SVG-Filter im backdrop-filter aus, WebKit und Gecko nicht. */
function isChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  // userAgentData fehlt noch in den TS-Typen, deshalb der Cast.
  const brands = (navigator as any).userAgentData?.brands as { brand: string }[] | undefined;
  if (brands?.length) return brands.some((b) => /Chromium/i.test(b.brand));
  const ua = navigator.userAgent;
  // CriOS/FxiOS/EdgiOS sind auf iOS allesamt WebKit und muessen draussen bleiben.
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return false;
  return /\b(Chrome|Chromium|Edg|OPR)\//.test(ua);
}

export function LiquidGlassFilter() {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const lastSize = useRef("");

  useEffect(() => {
    if (!isChromium()) return;
    if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return;

    const measureAndBuild = () => {
      const shell = document.querySelector<HTMLElement>(".p2g-nav-shell");
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const key = `${w}x${h}`;
      if (key === lastSize.current) return;
      lastSize.current = key;

      const radius = parseFloat(getComputedStyle(shell).borderTopLeftRadius) || 24;
      const url = buildDisplacementMap(w, h, radius);
      if (url) {
        setMapUrl(url);
        document.documentElement.classList.add("liquid-glass-ready");
      }
    };

    measureAndBuild();

    // Nur bei Groessenaenderung neu rechnen, nicht beim Scrollen.
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureAndBuild);
    };
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.documentElement.classList.remove("liquid-glass-ready");
    };
  }, []);

  if (!mapUrl) return null;

  return (
    // Nicht display:none — ein ausgeblendetes SVG wird von Chromium nicht als
    // Filterquelle ausgewertet. Stattdessen 0x0 und aus dem Fluss genommen.
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <filter
          id="p2g-liquid-glass"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feImage href={mapUrl} result="map" preserveAspectRatio="none" />

          {/* Drei Durchlaeufe mit leicht verschiedener Staerke. Aus jedem wird
              nur ein Farbkanal uebernommen — das ergibt den feinen Farbsaum an
              der Kante, den echtes Glas erzeugt. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={DISPLACE_SCALE + CHROMA_SPREAD}
            xChannelSelector="R"
            yChannelSelector="G"
            result="shiftR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={DISPLACE_SCALE}
            xChannelSelector="R"
            yChannelSelector="G"
            result="shiftG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={DISPLACE_SCALE - CHROMA_SPREAD}
            xChannelSelector="R"
            yChannelSelector="G"
            result="shiftB"
          />

          <feColorMatrix
            in="shiftR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyR"
          />
          <feColorMatrix
            in="shiftG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyG"
          />
          <feColorMatrix
            in="shiftB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="onlyB"
          />

          <feComposite in="onlyR" in2="onlyG" operator="arithmetic" k2="1" k3="1" result="rg" />
          <feComposite in="rg" in2="onlyB" operator="arithmetic" k2="1" k3="1" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Meldet, ob die Seite nennenswert gescrollt ist. Die Leiste dunkelt dann
 * nach, damit der Text ueber laufendem Inhalt sicher lesbar bleibt.
 */
export function useGlassScrolled(threshold = 12): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [threshold]);

  return scrolled;
}
