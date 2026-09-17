import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, X } from "lucide-react";
import {
  buildAlternateUrl,
  type SupportedLanguage,
} from "@/i18n";

const DISMISS_KEY = "padel2go.geoBannerDismissed";

const BANNER_COPY: Record<
  SupportedLanguage,
  { message: string; switchCta: string; stayCta: string }
> = {
  en: {
    message: "This site is also available in English.",
    switchCta: "Switch to English",
    stayCta: "Stay in German",
  },
  de: {
    message: "Diese Seite gibt es auch auf Deutsch.",
    switchCta: "Auf Deutsch wechseln",
    stayCta: "Stay in English",
  },
};

const GeoLanguageBanner = () => {
  const { i18n } = useTranslation();
  const [target, setTarget] = useState<SupportedLanguage | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

      const current = (i18n.language?.startsWith("en") ? "en" : "de") as SupportedLanguage;
      const browser = (navigator.language || "").toLowerCase();
      const browserLang: SupportedLanguage | null = browser.startsWith("en")
        ? "en"
        : browser.startsWith("de")
        ? "de"
        : null;

      if (browserLang && browserLang !== current) setTarget(browserLang);
    } catch {
      /* navigator/localStorage may be unavailable */
    }
  }, [i18n.language]);

  // Die Leiste liegt fest am oberen Rand und verdeckte bisher die Navigation
  // (auf dem Handy samt Sidebar-Schalter im Admin). Sie meldet ihre Hoehe als
  // CSS-Variable; alle festen Kopfzeilen setzen ihr top darauf.
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty("--p2g-banner-h");
      return;
    }
    const apply = () => root.style.setProperty("--p2g-banner-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--p2g-banner-h");
    };
  }, [target]);

  if (!target) return null;

  const copy = BANNER_COPY[target];

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setTarget(null);
  };

  const switchLanguage = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    const url = buildAlternateUrl(target);
    if (url.startsWith("http")) {
      window.location.assign(url);
    } else {
      void i18n.changeLanguage(target);
      setTarget(null);
    }
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Language suggestion"
      className="fixed top-0 left-0 right-0 z-[60] bg-primary text-primary-foreground shadow-sm"
    >
      {/* Auf dem Handy eine einzige Zeile: der Hinweis nahm vorher ein Sechstel
          des Bildschirms ein und verdeckte die Kopfzeile darunter. */}
      <div className="container mx-auto flex items-center gap-2 px-3 py-1.5 text-[13px] sm:justify-center sm:gap-4 sm:px-4 sm:py-2 sm:text-sm">
        <Globe className="h-4 w-4 flex-none" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium sm:flex-none sm:truncate-none sm:whitespace-normal">
          {copy.message}
        </span>
        <div className="flex flex-none items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={switchLanguage}
            className="rounded-full bg-primary-foreground/15 px-2.5 py-1.5 font-semibold transition-colors hover:bg-primary-foreground/25 sm:px-3 sm:py-1"
          >
            {copy.switchCta}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="hidden rounded-full px-3 py-1 transition-colors hover:bg-primary-foreground/10 sm:inline-flex"
          >
            {copy.stayCta}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-primary-foreground/10 sm:h-auto sm:w-auto sm:p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeoLanguageBanner;
