import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation, Trans } from "react-i18next";
import { localized } from "@/lib/localized";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";
import { SiteVisual } from "@/components/SiteVisual";
import { Button } from "@/components/ui/button";
import SyntheticHero from "@/components/ui/synthetic-hero";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import { NavLink } from "@/components/NavLink";
import BrandName from "@/components/BrandName";
import { LocationTeasersSection } from "@/components/LocationTeasersSection";
import { ArticleFeed } from "@/components/news/ArticleFeed";
import {
  ArrowRight,
  Building2,
  Calendar,
  MapPin,
  Coins,
  ShoppingBag,
  Banknote,
  Zap,
  Handshake,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLaunchDate } from "@/hooks/useLaunchDate";
import { usePartnerTiles } from "@/hooks/usePartnerTiles";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Navigate } from "react-router-dom";
import skypadelOutdoor from "@/assets/courts/skypadel-outdoor.jpg";
import eventsHero from "@/assets/events-hero.jpg";

// ── Reveal wrapper (fade + rise on scroll) ────────────────────────────────────
const revealProps = (delay = 0) => ({
  initial: { opacity: 0, y: 28, filter: "blur(4px)" as const },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" as const },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
});

// ── Partner-Showcase (admin-verwaltet via partner_tiles / AdminPartnerTiles) ──
const PartnerShowcase = () => {
  const { t, i18n } = useTranslation("index");
  const { data: partners } = usePartnerTiles();
  const active = (partners ?? []).filter((p) => p.is_active !== false);
  if (active.length === 0) return null;
  return (
    <section id="partner" className="py-16 md:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-5">
        <motion.div {...revealProps()} className="flex flex-col items-center gap-4 text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary">
            <Handshake className="w-3.5 h-3.5" />
            {t("partnerShowcase.badge")}
          </span>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={{ lineHeight: 1.1 }}>
            <Trans i18nKey="index:partnerShowcase.title" components={[<span className="text-gradient-lime" />]} />
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            <Trans i18nKey="index:partnerShowcase.subtitle" components={[<BrandName />]} />
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {active.map((p, i) => {
            const inner = (
              <div className="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-gradient-card border border-border/60 hover:border-primary/30 transition-colors duration-300 h-full text-center">
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} className="h-12 max-w-[150px] object-contain" />
                ) : (
                  <span className="font-display font-bold text-lg text-foreground">{p.name}</span>
                )}
                {p.logo_url && <span className="font-display font-semibold text-sm text-foreground">{p.name}</span>}
                {p.description && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{localized(p, "description", i18n.language)}</p>}
                {p.website_url && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-auto pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t("partnerShowcase.website")} <ArrowRight className="w-3 h-3" />
                  </span>
                )}
              </div>
            );
            return p.website_url ? (
              <motion.a key={p.id} {...revealProps(Math.min(i * 0.05, 0.3))} href={p.website_url} target="_blank" rel="noopener noreferrer">
                {inner}
              </motion.a>
            ) : (
              <motion.div key={p.id} {...revealProps(Math.min(i * 0.05, 0.3))}>{inner}</motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const Index = () => {
  const sectionColor = useSectionTheme("home");
  const { user, isLoading } = useAuth();
  const { t } = useTranslation("index");
  const { launchDate, hasLaunched } = useLaunchDate();

  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <Helmet>
        <title>{t("meta.title")}</title>
        <meta name="description" content={t("meta.description")} />
      </Helmet>

      <Navigation />

      <main className="relative min-h-screen bg-background" style={sectionThemeVars(sectionColor)}>
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">

        {/* ── HERO ──────────────────────────────────────────────── */}
        <SyntheticHero
          showShader={false}
          title={t("hero.title")}
          description={
            <>
              {t("hero.descriptionLine1")}
              <br />
              {t("hero.descriptionLine2")}
            </>
          }
          badgeLabel={t("hero.badgeLabel")}
          badgeText={format(launchDate, "d. MMMM yyyy", { locale: de })}
          showCountdown={!hasLaunched}
          countdownTargetDate={launchDate}
          showLogo={true}
        >
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mt-8">
            <Button size="xl" variant="hero" className="w-full sm:w-auto min-h-[48px]" asChild>
              <NavLink to="/booking">
                <Calendar className="w-5 h-5 mr-2" />
                {t("hero.ctaPrimary")}
              </NavLink>
            </Button>
            <Button size="xl" variant="heroOutline" className="w-full sm:w-auto min-h-[48px]" asChild>
              <NavLink to="/fuer-vereine">
                <Building2 className="w-5 h-5 mr-2" />
                {t("hero.ctaSecondary")}
              </NavLink>
            </Button>
          </div>
        </SyntheticHero>

        {/* ── LOCATION ROLLOUT (backend: location_teasers) ──────── */}
        <LocationTeasersSection />

        {/* ── NEWS / ARTICLES (backend: articles) ───────────────── */}
        <ArticleFeed />

        <SectionDivider variant="glow" />

        {/* ── EIN NETWORK. ALLE VORTEILE. (Bento) ───────────────── */}
        <section id="plattform" className="py-16 md:py-24 relative overflow-hidden">
          <div className="mx-auto max-w-[1200px] px-5">
            <motion.div {...revealProps()} className="flex flex-col items-center gap-4 text-center max-w-2xl mx-auto mb-14">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary">
                <Zap className="w-3.5 h-3.5" />
                {t("network.badge")}
              </span>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={{ lineHeight: 1.1 }}>
                {t("network.titlePart1")} <span className="text-gradient-lime">{t("network.titlePart2")}</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl">{t("network.subtitle")}</p>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Courts — image tile */}
              <motion.div {...revealProps()} className="lg:col-span-7 relative min-h-[400px] rounded-2xl overflow-hidden border border-border/60">
                <div className="absolute inset-0">
                  <SiteVisual visualKey="home.network.courts" alt={t("network.courtsTitle")} className="w-full h-full" fallbackSrc={skypadelOutdoor} />
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(200deg,hsl(0_0%_0%/0.1),hsl(0_0%_0%/0.9)_78%)]" />
                <span className="absolute top-[18px] left-[18px] font-stat text-[11px] uppercase tracking-[0.14em] text-foreground bg-background/60 backdrop-blur-md border border-white/20 rounded-full px-3.5 py-1.5">
                  {t("network.courtsBadge")}
                </span>
                <div className="relative h-full flex flex-col justify-end gap-2.5 p-7">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-stat text-xs uppercase tracking-[0.12em] text-primary">{t("network.courtsEyebrow")}</span>
                  </div>
                  <h3 className="font-display text-2xl md:text-4xl font-bold text-foreground" style={{ lineHeight: 1.08 }}>
                    {t("network.courtsTitle")}
                  </h3>
                  <p className="text-[15.5px] text-foreground/80 max-w-md">{t("network.courtsDescription")}</p>
                </div>
              </motion.div>

              {/* Payback +250 */}
              <motion.div {...revealProps(0.1)} className="lg:col-span-5 relative overflow-hidden min-h-[400px] flex flex-col justify-between gap-7 p-7 rounded-2xl bg-gradient-card border border-border/60 hover:border-primary/30 transition-colors duration-300">
                {/* Hintergrundbild, im Admin unter Visuals pflegbar. Ohne Bild
                    bleibt die Kachel wie bisher: SiteVisual rendert dann nichts. */}
                <div className="absolute inset-0">
                  <SiteVisual
                    visualKey="home.network.payback"
                    alt={t("network.paybackTitle")}
                    className="w-full h-full"
                    overlayClassName="bg-[linear-gradient(200deg,hsl(0_0%_0%/0.35),hsl(0_0%_0%/0.9)_78%)]"
                  />
                </div>
                <div className="pointer-events-none absolute -right-24 -top-24 w-64 h-64 rounded-full bg-[radial-gradient(circle,hsl(71_91%_51%/0.14),transparent_70%)]" />
                <div className="relative w-[54px] h-[54px] rounded-[14px] border border-primary/35 flex items-center justify-center bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] animate-float">
                  <Coins className="w-6 h-6 text-primary" />
                </div>
                <div className="relative flex flex-col gap-3">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-stat font-bold text-6xl md:text-7xl text-primary leading-none" style={{ textShadow: "0 0 40px hsl(71 91% 51% / 0.35)" }}>
                      {t("network.paybackPoints")}
                    </span>
                    <span className="font-stat text-sm tracking-[0.12em] text-muted-foreground">{t("network.paybackPointsLabel")}</span>
                  </div>
                  <h3 className="font-display text-xl md:text-2xl font-bold text-foreground" style={{ lineHeight: 1.15 }}>
                    {t("network.paybackTitle")}
                  </h3>
                  <p className="text-[15px] text-muted-foreground">{t("network.paybackDescription")}</p>
                </div>
              </motion.div>

              {/* Marketplace */}
              <motion.div {...revealProps(0.15)} className="lg:col-span-5 relative overflow-hidden min-h-[360px] flex flex-col justify-between gap-7 p-7 rounded-2xl bg-gradient-card border border-border/60 hover:border-primary/30 transition-colors duration-300">
                <div className="absolute inset-0">
                  <SiteVisual
                    visualKey="home.network.market"
                    alt={t("network.marketTitle")}
                    className="w-full h-full"
                    overlayClassName="bg-[linear-gradient(200deg,hsl(0_0%_0%/0.35),hsl(0_0%_0%/0.9)_78%)]"
                  />
                </div>
                <div className="relative w-[54px] h-[54px] rounded-[14px] border border-primary/35 flex items-center justify-center bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] animate-float" style={{ animationDelay: "0.5s" }}>
                  <ShoppingBag className="w-6 h-6 text-primary" />
                </div>
                <div className="relative flex flex-col gap-3.5">
                  <h3 className="font-display text-xl md:text-2xl font-bold text-foreground" style={{ lineHeight: 1.15 }}>
                    {t("network.marketTitle")}
                  </h3>
                  <div className="flex flex-wrap gap-2.5">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/80 bg-white/5 border border-border rounded-full px-4 py-2">
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                      {t("network.marketTagMoney")}
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 border border-primary/35 rounded-full px-4 py-2">
                      <Zap className="w-4 h-4" />
                      {t("network.marketTagPoints")}
                    </span>
                  </div>
                  <p className="text-[15px] text-muted-foreground">{t("network.marketDescription")}</p>
                </div>
              </motion.div>

              {/* Events — image tile */}
              <motion.div {...revealProps(0.2)} className="lg:col-span-7 relative min-h-[360px] rounded-2xl overflow-hidden border border-border/60">
                <div className="absolute inset-0">
                  <SiteVisual visualKey="home.network.events" alt={t("network.eventsTitle")} className="w-full h-full" fallbackSrc={eventsHero} />
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(200deg,hsl(0_0%_0%/0.2),hsl(0_0%_0%/0.92)_78%)]" />
                <span className="absolute top-[18px] left-[18px] font-stat text-[11px] uppercase tracking-[0.14em] text-primary bg-background/60 backdrop-blur-md border border-primary/35 rounded-full px-3.5 py-1.5">
                  {t("network.eventsBadge")}
                </span>
                <div className="relative h-full flex flex-col items-start justify-end gap-3 p-7">
                  <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground" style={{ lineHeight: 1.1 }}>
                    {t("network.eventsTitle")}
                  </h3>
                  <p className="text-[15.5px] text-foreground/80">{t("network.eventsDescription")}</p>
                  <Button size="lg" variant="hero" className="mt-1.5" asChild>
                    <NavLink to="/fuer-spieler">{t("network.eventsCta")}</NavLink>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <SectionDivider variant="glow" />

        <PartnerShowcase />

      </div>
      </main>

      <Footer />
    </>
  );
};

export default Index;
