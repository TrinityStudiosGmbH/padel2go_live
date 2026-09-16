import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const WHATSAPP_NUMBER_RAW = "4915201812563";
export const WHATSAPP_NUMBER_DISPLAY = "+49 152 01812563";

const DEFAULT_MESSAGES: Record<string, string> = {
  de: "Hallo PADEL2GO-Team, ich würde gerne mehr erfahren und einen Termin vereinbaren.",
  en: "Hi PADEL2GO team, I'd like to learn more and arrange a call.",
};

export const buildWhatsAppUrl = (lang?: string, customMessage?: string): string => {
  const message =
    customMessage ??
    DEFAULT_MESSAGES[lang ?? ""] ??
    DEFAULT_MESSAGES.de;
  return `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(message)}`;
};

/**
 * Default WhatsApp URL using the German message. Kept as an exported constant
 * for places that need the URL at module scope (no React context available).
 * Prefer `useWhatsAppUrl()` inside components so the message follows the
 * current i18n language.
 */
export const WHATSAPP_URL = buildWhatsAppUrl("de");

export const useWhatsAppUrl = (customMessage?: string): string => {
  const { i18n } = useTranslation();
  return useMemo(
    () => buildWhatsAppUrl(i18n.language, customMessage),
    [i18n.language, customMessage],
  );
};

export const WhatsAppIcon = ({
  className = "w-5 h-5",
}: {
  className?: string;
}) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

interface WhatsAppGroupButtonProps {
  href: string;
  label: string;
  /** Icon-only (z. B. Kachel-Footer); das Label landet im aria-label/title. */
  compact?: boolean;
  className?: string;
}

/** Link zur standortspezifischen WhatsApp-Gruppe — Pill mit Text oder kompaktes Icon-Quadrat. */
export const WhatsAppGroupButton = ({ href, label, compact = false, className = "" }: WhatsAppGroupButtonProps) => {
  const base =
    "inline-flex items-center justify-center border border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] transition-colors hover:bg-[#25D366]/20 hover:border-[#25D366]/70";
  const shape = compact ? "h-8 w-8 rounded-[10px]" : "gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`${base} ${shape} ${className}`}
    >
      <WhatsAppIcon className={compact ? "w-4 h-4" : "w-3.5 h-3.5"} />
      {!compact && label}
    </a>
  );
};
