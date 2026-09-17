import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** „Max Muster“ → „MM“, „max“ → „MA“, leer → „?“ */
export function initialsOf(name?: string | null): string {
  const clean = (name ?? "").replace(/^@/, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : clean.slice(0, 2);
  return letters.toUpperCase();
}

/** Stabile, kräftige Verlaufsfarbe pro Name — gleiche Person, gleiche Farbe. */
export function avatarGradient(seed?: string | null): string {
  let h = 0;
  for (const ch of seed ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 92% 58%), hsl(${(hue + 48) % 360} 90% 44%))`;
}

interface UserAvatarProps {
  src?: string | null;
  /** Anzeigename oder Username — Quelle für Initialen und Farbe. */
  name?: string | null;
  className?: string;
  alt?: string;
}

/** Profilbild mit Initialen als Standard: bunter Verlauf statt grauem Platzhalter. */
export function UserAvatar({ src, name, className, alt }: UserAvatarProps) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      {src && <AvatarImage src={src} alt={alt ?? name ?? ""} className="object-cover" />}
      <AvatarFallback
        className="font-display font-extrabold tracking-tight text-[#0A0A0A]"
        style={{ backgroundImage: avatarGradient(name) }}
      >
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
