import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  WhatsAppIcon,
  WHATSAPP_NUMBER_DISPLAY,
  useWhatsAppUrl,
} from "@/components/WhatsAppBusiness";

const Impressum = () => {
  const { t } = useTranslation("impressum");
  const whatsappUrl = useWhatsAppUrl();

  return (
    <>
      <Helmet>
        <title>{t("meta.title")}</title>
        <meta name="description" content={t("meta.description")} />
      </Helmet>

      <Navigation />

      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">

          <div className="mb-12">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">{t("header.title")}</h1>
            <p className="text-muted-foreground">{t("header.subtitle")}</p>
          </div>

          <div className="space-y-10">

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.provider")}</h2>
              <div className="space-y-1 text-foreground">
                <p className="font-semibold">PADEL2GO OpCo UG (haftungsbeschränkt)</p>
                <p>Humboldtstraße 34</p>
                <p>81543 München</p>
                <p>Deutschland</p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.managingDirectors")}</h2>
              <div className="space-y-1 text-foreground">
                <p>Florian Steinfelder</p>
                <p>David Klemm</p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.contact")}</h2>
              <div className="space-y-2 text-foreground">
                <p>
                  <span className="text-muted-foreground">{t("contact.emailLabel")}</span>{" "}
                  <a className="hover:text-lime transition-colors" href="mailto:contact@padel2go.eu">
                    contact@padel2go.eu
                  </a>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("contact.phoneLabel")}</span>{" "}
                  <a className="hover:text-lime transition-colors" href="tel:+4917632350759">
                    +49 176 32350 759
                  </a>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t("contact.whatsappLabel")}</span>{" "}
                  <a
                    className="inline-flex items-center gap-1.5 hover:text-[#1FB855] transition-colors"
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                    {WHATSAPP_NUMBER_DISPLAY}
                  </a>
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.registration")}</h2>
              <div className="space-y-2 text-foreground">
                <p>
                  <span className="text-muted-foreground">{t("registration.courtLabel")}</span>{" "}
                  {t("registration.court")}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("registration.numberLabel")}</span>{" "}
                  {t("registration.number")}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("registration.vatLabel")}</span>{" "}
                  {t("registration.vat")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.responsible")}</h2>
              <div className="space-y-1 text-foreground">
                <p className="font-semibold">Florian Steinfelder & David Klemm</p>
                <p>Humboldtstraße 34</p>
                <p>81543 München</p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.consumerDispute")}</h2>
              <p className="text-muted-foreground">{t("consumerDispute.text")}</p>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.liabilityContent")}</h2>
              <p className="text-muted-foreground">{t("liabilityContent.p1")}</p>
              <p className="text-muted-foreground mt-4">{t("liabilityContent.p2")}</p>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.liabilityLinks")}</h2>
              <p className="text-muted-foreground">{t("liabilityLinks.p1")}</p>
              <p className="text-muted-foreground mt-4">{t("liabilityLinks.p2")}</p>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("sections.copyright")}</h2>
              <p className="text-muted-foreground">{t("copyright.p1")}</p>
              <p className="text-muted-foreground mt-4">{t("copyright.p2")}</p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-border space-y-2">
            <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
            {t("legalNotice") && (
              <p className="text-xs text-muted-foreground italic">{t("legalNotice")}</p>
            )}
          </div>

        </div>
      </main>

      <Footer />
    </>
  );
};

export default Impressum;
