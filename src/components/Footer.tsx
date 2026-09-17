import logo from "@/assets/padel2go-logo.png";
import { MapPin, Mail, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import BrandName from "@/components/BrandName";
import LanguageSwitch from "@/components/LanguageSwitch";
import {
  WhatsAppIcon,
  WHATSAPP_NUMBER_DISPLAY,
  useWhatsAppUrl,
} from "@/components/WhatsAppBusiness";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation("common");
  const whatsappUrl = useWhatsAppUrl();

  const legalLinks = [
    { label: t("footer.links.imprint"), href: "/impressum" },
    { label: t("footer.links.privacy"), href: "/datenschutz" },
    { label: t("footer.links.terms"), href: "/agb" },
    { label: t("footer.links.withdrawal"), href: "/widerruf" },
    { label: t("footer.links.shipping"), href: "/versand" },
  ];

  return (
    <footer className="relative z-[1] bg-card border-t border-border">
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          {/* Brand + contact */}
          <div className="max-w-sm">
            <img src={logo} alt="PADEL2GO" className="h-8 mb-4" />
            <p className="text-sm text-muted-foreground mb-5">
              {t("footer.tagline")}
            </p>
            <div className="space-y-2">
              <a
                className="flex min-h-[40px] items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
                href="mailto:contact@padel2go.eu"
              >
                <Mail className="w-4 h-4" />
                contact@padel2go.eu
              </a>
              <a
                className="flex min-h-[40px] items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
                href="tel:+4917632350759"
              >
                <Phone className="w-4 h-4" />
                +49 176 32350759
              </a>
              <a
                className="flex min-h-[40px] items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#1FB855] md:min-h-0"
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp Business"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                <span>
                  {WHATSAPP_NUMBER_DISPLAY}
                  <span className="ml-1 text-[#1FB855] font-medium">
                    · {t("footer.whatsappBadge")}
                  </span>
                </span>
              </a>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                {t("footer.country")}
              </div>
            </div>
          </div>

          {/* Legal */}
          <nav className="md:text-right">
            <h4 className="font-semibold mb-4">{t("footer.sections.legal")}</h4>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <NavLink
                    to={link.href}
                    className="inline-flex min-h-[40px] items-center text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {currentYear} <BrandName inline />. {t("footer.copyrightSuffix")}
          </p>
          <div className="flex items-center gap-4">
            <LanguageSwitch variant="footer" />
            <span className="text-sm text-muted-foreground">{t("footer.madeWith")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
