import { useSiteVisual } from "@/hooks/useSiteVisuals";
import { StorageImage } from "@/components/StorageImage";
import { cn } from "@/lib/utils";

interface SiteVisualProps {
  visualKey: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackSrc?: string;
  /** Zielbreite des Storage-Derivats — Anzeigebreite × 2 (Retina). */
  renderWidth?: number;
  /**
   * Abdunkelung ueber dem Bild, damit Text darauf lesbar bleibt. Wird NUR
   * gerendert, wenn es tatsaechlich ein Bild gibt: ohne Bild wuerde der Schleier
   * sonst die Kachel darunter grundlos verdunkeln.
   */
  overlayClassName?: string;
}

export function SiteVisual({
  visualKey,
  alt,
  className,
  fallbackClassName,
  fallbackSrc,
  renderWidth = 1200,
  overlayClassName,
}: SiteVisualProps) {
  const { data: visual, isLoading } = useSiteVisual(visualKey);

  const imageUrl = visual?.image_url || visual?.placeholder_url || fallbackSrc;

  // Waehrend die Abfrage laeuft: NICHTS laden.
  //
  // Vorher stand hier der Fallback. Der ist ein gebuendeltes Bild aus
  // src/assets — bei der Events-Kachel 1,8 MB. Der Browser lud es also bei
  // JEDEM Seitenaufruf herunter und ersetzte es eine Sekunde spaeter durch die
  // 170 KB grosse Fassung aus dem Storage. Auf der Startseite waren das allein
  // 2,9 MB pro Besuch, die sofort weggeworfen wurden.
  //
  // Der Fallback greift weiterhin — aber erst, wenn feststeht, dass es kein
  // gepflegtes Bild gibt (unten).
  if (isLoading) {
    return <div className={cn("bg-transparent", className, fallbackClassName)} />;
  }

  // No image available: show fallback if provided, otherwise transparent container
  if (!imageUrl) {
    if (fallbackSrc) {
      return (
        <img
          src={fallbackSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn("object-cover", className)}
        />
      );
    }
    return (
      <div className={cn("bg-transparent", className, fallbackClassName)} />
    );
  }

  if (!overlayClassName) {
    return (
      <StorageImage
        src={imageUrl}
        renderWidth={renderWidth}
        alt={alt}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <>
      <StorageImage
        src={imageUrl}
        renderWidth={renderWidth}
        alt={alt}
        className={cn("object-cover", className)}
      />
      <div aria-hidden className={cn("absolute inset-0", overlayClassName)} />
    </>
  );
}
