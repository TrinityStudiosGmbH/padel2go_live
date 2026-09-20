import { useSiteVisual } from "@/hooks/useSiteVisuals";
import { cn } from "@/lib/utils";
import { StorageImage } from "@/components/StorageImage";

interface Props {
  videoKey: string;
  imageKey: string;
  alt: string;
  fallbackSrc?: string;
  className?: string;
}

const isRealUrl = (u?: string | null) =>
  !!u && u.trim() !== "" && !u.endsWith("placeholder.svg");

const youtubeId = (url: string): string | null => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
const vimeoId = (url: string): string | null => {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
};

/**
 * Full-bleed hero background that plays an admin-managed VIDEO when one is set
 * (direct .mp4/.webm, YouTube or Vimeo URL), otherwise falls back to the
 * admin-managed still image, then to `fallbackSrc`. Both URLs live in
 * site_visuals.image_url (video keys just contain ".video").
 * `className` should position/size the element (e.g. absolute inset-0 object-cover).
 */
export function HeroBackgroundVisual({ videoKey, imageKey, alt, fallbackSrc, className }: Props) {
  const { data: video, isLoading: videoLoading } = useSiteVisual(videoKey);
  const { data: image, isLoading: imageLoading } = useSiteVisual(imageKey);

  const videoUrl = isRealUrl(video?.image_url) ? video!.image_url! : null;
  const stored = isRealUrl(image?.image_url) ? image!.image_url! : null;

  // Solange die Abfrage laeuft, NICHT auf den Fallback ausweichen: der ist ein
  // gebuendeltes Bild (bei „Fuer Spieler" 2,99 MB) und wuerde bei jedem Aufruf
  // geladen, nur um Sekundenbruchteile spaeter durch das gepflegte Bild
  // ersetzt zu werden. Erst wenn feststeht, dass keines hinterlegt ist.
  const imageUrl = stored ?? (videoLoading || imageLoading ? null : fallbackSrc);

  if (videoUrl) {
    const yt = youtubeId(videoUrl);
    const vm = vimeoId(videoUrl);

    if (yt || vm) {
      const src = yt
        ? `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&disablekb=1`
        : `https://player.vimeo.com/video/${vm}?autoplay=1&muted=1&loop=1&background=1&controls=0`;
      return (
        <div className={cn("overflow-hidden", className)}>
          {/* 16:9 iframe scaled to cover the viewport-sized hero (no letterboxing). */}
          <iframe
            src={src}
            title={alt}
            allow="autoplay; encrypted-media; picture-in-picture"
            frameBorder={0}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] h-[56.25vw] min-w-full min-h-full pointer-events-none"
          />
        </div>
      );
    }

    // Direct video file (or unknown format — best-effort <video>).
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={imageUrl ?? undefined}
        className={cn("object-cover", className)}
      >
        <source src={videoUrl} />
      </video>
    );
  }

  if (imageUrl) {
    return <StorageImage src={imageUrl} renderWidth={1600} alt={alt} className={cn("object-cover", className)} />;
  }
  return <div className={cn("bg-black", className)} />;
}
