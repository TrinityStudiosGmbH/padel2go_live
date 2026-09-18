import { useState, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { HeroBackgroundVisual } from "@/components/HeroBackgroundVisual";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User, Calendar, Smartphone, ArrowRight, CalendarCheck, Gem, ShoppingBag,
  Coins, Video, Bell, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLaunchDate } from "@/hooks/useLaunchDate";
import leagueHero from "@/assets/league-hero.jpg";
import skypadelOutdoor from "@/assets/courts/skypadel-outdoor.jpg";
import eventsHero from "@/assets/events-hero.jpg";
import fuerVereineHero from "@/assets/fuer-vereine-hero.jpg";

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
});

const FuerSpieler = () => {
  const { t } = useTranslation("spieler");
  const { launchDate } = useLaunchDate();

  const { data: rates } = useQuery({
    queryKey: ["payback-rates-public"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("site_settings")
        .select("payback_points_60min, credits_per_euro")
        .eq("id", "global")
        .maybeSingle();
      return data;
    },
  });
  // Punkte haengen allein an der Dauer: 60 Minuten = Grundwert, 90 = x1.5, 120 = x2.
  const p1 = Number((rates as any)?.payback_points_60min ?? 100) || 100;
  const pointsPerEuro = Number((rates as any)?.credits_per_euro ?? 100) || 100;
  const p2 = Math.round(p1 * 1.5);
  const p3 = p1 * 2;
  const durationRows = [
    { minutes: 60, points: p1 },
    { minutes: 90, points: p2 },
    { minutes: 120, points: p3 },
  ];

  const [nlMail, setNlMail] = useState("");
  const [nlDone, setNlDone] = useState(false);
  const [nlErr, setNlErr] = useState(false);
  const submitNl = async () => {
    if (!/.+@.+\..+/.test(nlMail.trim())) { setNlErr(true); return; }
    try {
      await (supabase as any).from("newsletter_subscribers").insert({ email: nlMail.trim().toLowerCase(), source: "fuer-spieler-ki" });
    } catch {
      /* duplicate email etc. — still confirm to the user */
    }
    setNlDone(true);
  };

  const launchLabel = format(launchDate, "dd.MM.yyyy", { locale: de });

  const pillars = [
    { img: skypadelOutdoor, tag: t("networkNew.pillars.0.tag"), title: t("networkNew.pillars.0.title"), text: t("networkNew.pillars.0.text"), cta: t("networkNew.pillars.0.cta"), to: "/booking" },
    { img: eventsHero, tag: t("networkNew.pillars.1.tag"), title: t("networkNew.pillars.1.title"), text: t("networkNew.pillars.1.text"), cta: t("networkNew.pillars.1.cta"), to: "/events" },
    { img: leagueHero, tag: t("networkNew.pillars.2.tag"), title: t("networkNew.pillars.2.title"), text: t("networkNew.pillars.2.text"), cta: t("networkNew.pillars.2.cta"), to: "/marketplace" },
  ];

  const steps = [
    { icon: CalendarCheck, title: t("paybackNew.steps.0.title"), text: t("paybackNew.steps.0.text") },
    { icon: Gem, title: t("paybackNew.steps.1.title"), text: t("paybackNew.steps.1.text") },
    { icon: ShoppingBag, title: t("paybackNew.steps.2.title"), text: t("paybackNew.steps.2.text") },
  ];

  return (
    <>
      <Helmet>
        <title>{t("metaNew.title")}</title>
        <meta name="description" content={t("metaNew.description")} />
      </Helmet>

      <Navigation />

      <main className="bg-black text-foreground">
        {/* ① HERO */}
        <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
          <HeroBackgroundVisual
            videoKey="fuer-spieler.hero.video"
            imageKey="fuer-spieler.hero.image"
            alt={t("heroNew.imageAlt")}
            fallbackSrc={leagueHero}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 15%, rgba(199,240,17,0.12), transparent), linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.72) 55%, #000)" }} />
          <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-[900px] mx-auto px-5 pt-[120px] pb-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary">
              <User className="w-3.5 h-3.5" />{t("heroNew.badge")}
            </span>
            <h1 className="font-display font-extrabold tracking-tight text-[clamp(38px,7.6vw,76px)] leading-[1.06]">
              {t("heroNew.titleLine1")} <span className="text-primary">{t("heroNew.titleHighlight")}</span><br />
              <span className="italic">{t("heroNew.titleLine2")}</span>
            </h1>
            <p className="max-w-[560px] text-[clamp(15px,2.3vw,19px)] leading-relaxed text-foreground/75">
              {t("heroNew.description")}
            </p>
            <div className="flex flex-wrap gap-3.5 justify-center">
              <Button variant="hero" size="xl" asChild><NavLink to="/booking"><Calendar className="w-[18px] h-[18px] mr-1" />{t("heroNew.primaryCta")}</NavLink></Button>
              <Button variant="heroOutline" size="xl" asChild><NavLink to="/app-booking"><Smartphone className="w-[18px] h-[18px] mr-1" />{t("heroNew.secondaryCta")}</NavLink></Button>
            </div>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {[
                <>{t("heroNew.chipLaunch")} <span className="text-primary font-bold">{launchLabel}</span></>,
                <>{t("heroNew.chipRegistration")} <span className="text-primary font-bold">0 €</span></>,
                <>{t("heroNew.chipBooking")} <span className="text-primary font-bold">&lt;30 Sek</span></>,
                <><span className="text-primary font-bold">+{p1}/+{p2} P</span> {t("heroNew.chipPointsSuffix")}</>,
              ].map((chip, i) => (
                <span key={i} className="font-stat text-xs text-foreground/85 bg-white/[0.05] backdrop-blur border border-white/15 rounded-full px-4 py-2 whitespace-nowrap">{chip}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ② Network — 3 Pfeiler */}
        <section id="network" className="py-[clamp(72px,10vw,116px)] px-5">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...reveal()} className="flex flex-col items-center gap-3.5 text-center mb-12">
              <span className="font-stat text-xs tracking-[0.2em] uppercase text-primary">{t("networkNew.eyebrow")}</span>
              <h2 className="font-display font-extrabold text-[clamp(30px,4.6vw,52px)] leading-tight tracking-tight">
                {t("networkNew.titlePrefix")} <span className="text-gradient-lime">{t("networkNew.titleHighlight")}</span>
              </h2>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-5">
              {pillars.map((p, i) => (
                <motion.div key={p.title} {...reveal(i * 0.1)}
                  className="flex flex-col rounded-2xl border border-border/60 bg-gradient-card overflow-hidden">
                  <div className="relative">
                    <img src={p.img} alt={p.title} className="w-full h-[180px] object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))" }} />
                    <span className="absolute top-3.5 left-3.5 font-stat text-[11px] text-primary bg-black/70 backdrop-blur border border-primary/35 rounded-full px-3 py-1.5 whitespace-nowrap">{p.tag}</span>
                  </div>
                  <div className="flex flex-col gap-2.5 p-[20px_22px_22px] flex-1">
                    <h3 className="font-display font-bold text-[21px] tracking-tight">{p.title}</h3>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">{p.text}</p>
                    <NavLink to={p.to} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary mt-auto pt-1.5">
                      {p.cta}<ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                    </NavLink>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1100px] h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(199,240,17,0.45) 50%, transparent)" }} />

        {/* ③ Du spielst Padel und wirst dafuer belohnt */}
        <section
          id="payback"
          className="relative overflow-hidden px-5 py-[clamp(80px,11vw,132px)]"
          style={{ background: "radial-gradient(ellipse at 50% -10%, rgba(199,240,17,0.13), transparent 60%), #000" }}
        >
          {/* Zwei weiche Lichtquellen, die der Sektion Tiefe geben */}
          <div className="pointer-events-none absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full bg-primary/20 opacity-[0.18] blur-[130px]" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-[360px] w-[360px] rounded-full bg-primary/30 opacity-[0.12] blur-[120px]" />

          <div className="relative mx-auto flex max-w-[1100px] flex-col">
            <motion.div {...reveal()} className="flex flex-col items-center gap-4 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary">
                <Coins className="h-3.5 w-3.5" />
                {t("paybackNew.badge")}
              </span>
              <h2 className="font-display text-[clamp(32px,5.4vw,64px)] font-extrabold leading-[1.05] tracking-tight">
                {t("paybackNew.titleLine1")}
                <br />
                <span className="text-gradient-lime">{t("paybackNew.titleLine2")}</span>
              </h2>
              <p className="max-w-[620px] text-[clamp(15px,1.7vw,18px)] leading-relaxed text-muted-foreground">
                {t("paybackNew.lead")}
              </p>
            </motion.div>

            {/* Die Zahlen, um die es geht */}
            <motion.div
              {...reveal(0.08)}
              className="mt-[clamp(40px,6vw,64px)] overflow-hidden rounded-[24px] border border-primary/25"
              style={{ background: "linear-gradient(145deg, hsl(0 0% 8%), hsl(0 0% 3%))" }}
            >
              <div className="border-b border-primary/15 px-6 py-4 text-center">
                <span className="font-stat text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
                  {t("paybackNew.durationsTitle")}
                </span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-white/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {durationRows.map((row) => (
                  <div key={row.minutes} className="flex flex-col items-center gap-1.5 px-6 py-[clamp(24px,4vw,38px)]">
                    <span className="font-stat text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      {t("paybackNew.duration", { minutes: row.minutes })}
                    </span>
                    <span className="font-stat text-[clamp(38px,6vw,56px)] font-extrabold leading-none text-primary">
                      +{row.points.toLocaleString("de-DE")}
                    </span>
                    <span className="font-stat text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("paybackNew.pointsSuffix")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-primary/15 px-6 py-3.5 text-center">
                <span className="font-stat text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  {t("paybackNew.rateLabel")}
                </span>
                <span className="font-stat text-sm font-bold text-foreground">
                  {t("paybackNew.rateValue", { points: pointsPerEuro.toLocaleString("de-DE") })}
                </span>
              </div>
            </motion.div>

            {/* Drei Schritte */}
            <motion.div {...reveal(0.12)} className="mt-[clamp(32px,5vw,52px)] grid items-start gap-4 md:grid-cols-[1fr_40px_1fr_40px_1fr]">
              {steps.map((step, i) => (
                <Fragment key={step.title}>
                  <div
                    className="flex h-full flex-col items-center gap-2.5 rounded-[18px] border border-border/50 p-[26px_20px] text-center"
                    style={{ background: "linear-gradient(145deg, hsl(0 0% 8%), hsl(0 0% 3%))" }}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-[13px] border border-primary/35 bg-gradient-to-br from-primary/[0.18] to-primary/[0.04] text-primary">
                      <step.icon className="h-[22px] w-[22px]" />
                    </span>
                    <span className="font-stat text-[11px] uppercase tracking-[0.16em] text-primary/70">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-[18px] font-bold">{step.title}</h3>
                    <p className="text-sm leading-snug text-muted-foreground">{step.text}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden items-center justify-center self-center text-primary/55 md:flex">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  )}
                </Fragment>
              ))}
            </motion.div>

            <motion.div {...reveal(0.16)} className="mt-[clamp(32px,5vw,48px)] flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="lime" size="lg" asChild className="gap-2">
                  <NavLink to="/marketplace">
                    <ShoppingBag className="h-4 w-4" />
                    {t("paybackNew.cta")}
                  </NavLink>
                </Button>
                <Button variant="outline" size="lg" asChild className="gap-2">
                  <NavLink to="/booking">
                    <CalendarCheck className="h-4 w-4" />
                    {t("paybackNew.ctaSecondary")}
                  </NavLink>
                </Button>
              </div>
              <p className="max-w-[560px] text-center text-xs leading-relaxed text-muted-foreground/70">
                {t("paybackNew.fineprint")}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ④ KI-Analyse Teaser */}
        <section id="ki" className="pt-[clamp(64px,9vw,104px)] px-5">
          <motion.div {...reveal()} className="relative mx-auto max-w-[1100px] rounded-[22px] overflow-hidden border" style={{ borderColor: "hsl(199 89% 60% / 0.25)" }}>
            <img src={fuerVereineHero} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22]" />
            <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 80% at 50% 0%, hsl(199 89% 60% / 0.14), transparent 60%), linear-gradient(180deg, hsl(210 60% 3% / 0.82), rgba(0,0,0,0.94))" }} />
            <div className="relative flex flex-col items-center gap-4 text-center p-[clamp(36px,6vw,60px)_clamp(20px,4vw,48px)]">
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <span className="inline-flex items-center rounded-full border border-border bg-white/[0.05] px-3 py-1 text-xs font-semibold text-muted-foreground">{t("kiNew.comingSoon")}</span>
                <span className="inline-flex items-center gap-2 font-stat text-[11px] tracking-[0.12em] uppercase rounded-full px-3.5 py-1.5" style={{ color: "hsl(199 89% 70%)", background: "hsl(199 89% 60% / 0.08)", border: "1px solid hsl(199 89% 60% / 0.3)" }}>
                  <Video className="w-3 h-3" />{t("kiNew.poweredBy")}
                </span>
              </div>
              <h2 className="font-display font-extrabold text-[clamp(26px,4vw,42px)] leading-tight tracking-tight">
                {t("kiNew.titlePrefix")} <span style={{ background: "linear-gradient(90deg, hsl(199 89% 62%), hsl(190 90% 70%))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{t("kiNew.titleHighlight")}</span>
              </h2>
              <p className="max-w-[560px] text-[clamp(14.5px,2vw,16.5px)] leading-relaxed text-foreground/70">
                {t("kiNew.description")}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[t("kiNew.tags.0"), t("kiNew.tags.1"), t("kiNew.tags.2"), t("kiNew.tags.3")].map((tag) => (
                  <span key={tag} className="font-stat text-[11.5px] rounded-full px-3.5 py-1.5 whitespace-nowrap" style={{ color: "hsl(199 89% 70%)", border: "1px solid hsl(199 89% 60% / 0.28)" }}>{tag}</span>
                ))}
              </div>
              {nlDone ? (
                <div className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-primary bg-primary/[0.08] border border-primary/30 rounded-full px-5 py-3 mt-1.5">
                  <Check className="w-4 h-4" />{t("kiNew.newsletterDone")}
                </div>
              ) : (
                <div className="w-full max-w-[440px] flex flex-col gap-2 mt-1.5">
                  <div className={`flex gap-2.5 flex-wrap justify-center ${nlErr ? "animate-[shake_0.4s]" : ""}`}>
                    <Input type="email" value={nlMail} onChange={(e) => { setNlMail(e.target.value); setNlErr(false); }}
                      onKeyDown={(e) => e.key === "Enter" && submitNl()} placeholder={t("kiNew.emailPlaceholder")}
                      className="flex-1 min-w-0 h-[46px] bg-white/[0.05] border-border/70" />
                    <Button variant="lime" onClick={submitNl} className="h-[46px]"><Bell className="w-4 h-4 mr-1" />{t("kiNew.notifyCta")}</Button>
                  </div>
                  {nlErr && <span className="text-[12.5px] text-red-400">{t("kiNew.emailError")}</span>}
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* ⑤ CTA */}
        <section id="cta" className="py-[clamp(72px,10vw,116px)] px-5 pb-[clamp(80px,11vw,128px)]" style={{ background: "radial-gradient(ellipse 55% 45% at 50% 100%, rgba(199,240,17,0.09), transparent), #000" }}>
          <motion.div {...reveal()} className="mx-auto max-w-[760px] flex flex-col items-center gap-5 text-center">
            <h2 className="font-display font-extrabold text-[clamp(30px,4.6vw,50px)] leading-tight tracking-tight">
              {t("ctaNew.titlePrefix")} <span className="italic text-primary">{t("ctaNew.titleHighlight")}</span>
            </h2>
            <div className="flex flex-wrap gap-3.5 justify-center">
              <Button variant="hero" size="xl" asChild><NavLink to="/booking"><Calendar className="w-[18px] h-[18px] mr-1" />{t("ctaNew.primaryCta")}</NavLink></Button>
              <Button variant="heroOutline" size="xl" asChild><NavLink to="/app-booking"><Smartphone className="w-[18px] h-[18px] mr-1" />{t("ctaNew.secondaryCta")}</NavLink></Button>
            </div>
            <span className="font-stat text-[12.5px] text-muted-foreground">{t("ctaNew.note", { date: launchLabel })}</span>
          </motion.div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default FuerSpieler;
