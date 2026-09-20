import { lazy, Suspense } from "react";

// three.js wiegt rund 835 KB und zeichnet hier nur einen Hintergrund. Statisch
// importiert lag es im kritischen Pfad von 15 Seiten. Nachgeladen erscheint
// zuerst die dunkle Flaeche, der Shader kommt danach — sichtbar ist der
// Unterschied kaum, messbar deutlich.
const NewsHeroShader = lazy(() =>
  import("@/components/news/NewsHeroShader").then((m) => ({ default: m.NewsHeroShader })),
);

/**
 * Vollflächiger Shader-Hintergrund einer Section (Gäste wie eingeloggte User):
 * animierter Farb-Shader hinter der ganzen Seite, am Viewport fixiert, mit
 * dunklem Overlay für Lesbarkeit. Bilder und Inhalte liegen unverändert darüber —
 * der Seiteninhalt muss relativ positioniert sein (relative + z-[1]).
 */
export function SectionShaderBackdrop({ color }: { color: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Suspense fallback={null}>
        <NewsHeroShader color={color} />
      </Suspense>
      <div className="absolute inset-0 bg-background/70" />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, transparent 40%, hsl(var(--background) / 0.55) 100%)" }}
      />
    </div>
  );
}
