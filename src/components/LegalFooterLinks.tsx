import { NavLink } from "@/components/NavLink";
import { useTranslation } from "react-i18next";

/** Slim legal-links row for layouts without the full public Footer (Impressumspflicht). */
const LegalFooterLinks = () => {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-5 text-xs text-muted-foreground/70">
      {/* Mindestens 44 px Trefferhoehe je Link — vorher 16 px und auf dem Handy
          kaum zu treffen. */}
      <NavLink to="/impressum" className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground">{t("footer.links.imprint")}</NavLink>
      <span aria-hidden="true" className="text-muted-foreground/40">·</span>
      <NavLink to="/datenschutz" className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground">{t("footer.links.privacy")}</NavLink>
      <span aria-hidden="true" className="text-muted-foreground/40">·</span>
      <NavLink to="/agb" className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground">{t("footer.links.terms")}</NavLink>
    </div>
  );
};

export default LegalFooterLinks;
