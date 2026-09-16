import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

const Datenschutz = () => {
  const { t } = useTranslation("datenschutz");

  const rightsList = t("rights.list", { returnObjects: true }) as Array<{
    term: string;
    text: string;
  }>;
  const hostingList = t("hosting.list", { returnObjects: true }) as string[];
  const securityList = t("security.list", { returnObjects: true }) as string[];

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
              <h2 className="text-xl font-bold mb-4 text-primary">{t("controller.heading")}</h2>
              <div className="space-y-1 text-foreground text-sm leading-relaxed">
                <p className="font-medium">PADEL2GO UG (haftungsbeschränkt)</p>
                <p>Am Neudeck 12</p>
                <p>81541 München</p>
                <p>Deutschland</p>
                <p className="mt-3">
                  {t("controller.emailLabel")}{" "}
                  <a href="mailto:contact@padel2go.eu" className="text-primary underline hover:no-underline">
                    contact@padel2go.eu
                  </a>
                </p>
                <p>{t("controller.phoneLine")}</p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("overview.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("overview.p1")}</p>
                <p>
                  <span className="font-medium">{t("overview.typesLabel")}</span> {t("overview.typesText")}
                </p>
                <p>
                  <span className="font-medium">{t("overview.subjectsLabel")}</span> {t("overview.subjectsText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("hosting.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("hosting.p1")}</p>
                <p>{t("hosting.p2")}</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {hostingList.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p>
                  <span className="font-medium">{t("hosting.legalLabel")}</span> {t("hosting.legalText")}
                </p>
                <p>
                  {t("hosting.privacyLinkLabel")}{" "}
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
                    supabase.com/privacy
                  </a>
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("payment.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("payment.p1")}</p>
                <p>{t("payment.p2")}</p>
                <p>
                  <span className="font-medium">{t("payment.legalLabel")}</span> {t("payment.legalText")}
                </p>
                <p>
                  {t("payment.privacyLinkLabel")}{" "}
                  <a href="https://stripe.com/de/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
                    stripe.com/de/privacy
                  </a>
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("shop.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("shop.p1")}</p>
                <p>{t("shop.p2")}</p>
                <p>{t("shop.p3")}</p>
                <p>
                  <span className="font-medium">{t("shop.legalLabel")}</span> {t("shop.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("email.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("email.p1")}</p>
                <p>
                  <span className="font-medium">{t("email.purposeLabel")}</span> {t("email.purposeText")}
                </p>
                <p>
                  <span className="font-medium">{t("email.legalLabel")}</span> {t("email.legalText")}
                </p>
                <p>
                  {t("email.privacyLinkLabel")}{" "}
                  <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
                    resend.com/legal/privacy-policy
                  </a>
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("push.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("push.p1")}</p>
                <p>{t("push.p2")}</p>
                <p>
                  <span className="font-medium">{t("push.legalLabel")}</span> {t("push.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("community.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("community.p1")}</p>
                <p>{t("community.p2")}</p>
                <p>
                  <span className="font-medium">{t("community.legalLabel")}</span> {t("community.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("cameras.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("cameras.p1")}</p>
                <p>
                  <span className="font-medium">{t("cameras.legalLabel")}</span> {t("cameras.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("thirdcountry.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("thirdcountry.p1")}</p>
                <p>
                  <span className="font-medium">{t("thirdcountry.legalLabel")}</span> {t("thirdcountry.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("cookies.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("cookies.p1")}</p>
                <p>
                  <span className="font-medium">{t("cookies.sessionLabel")}</span> {t("cookies.sessionText")}
                </p>
                <p>{t("cookies.p3")}</p>
                <p>
                  <span className="font-medium">{t("cookies.legalLabel")}</span> {t("cookies.legalText")}
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("retention.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("retention.p1")}</p>
                <p>{t("retention.p2")}</p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("rights.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("rights.intro")}</p>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                  {rightsList.map((item) => (
                    <li key={item.term}>
                      <span className="text-foreground font-medium">{item.term}</span> {item.text}
                    </li>
                  ))}
                </ul>
                <p>
                  {t("rights.contactBefore")}{" "}
                  <a href="mailto:contact@padel2go.eu" className="text-primary underline hover:no-underline">
                    contact@padel2go.eu
                  </a>
                </p>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("security.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("security.p1")}</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {securityList.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </section>

            <section className="bg-card/50 border border-border rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-bold mb-4 text-primary">{t("changes.heading")}</h2>
              <div className="space-y-3 text-foreground text-sm leading-relaxed">
                <p>{t("changes.p1")}</p>
              </div>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-border space-y-2">
            <p className="text-sm text-muted-foreground">{t("footer")}</p>
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

export default Datenschutz;
