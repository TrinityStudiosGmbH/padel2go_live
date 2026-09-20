import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation, Trans } from "react-i18next";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import eventsHero from "@/assets/events-hero.jpg";
import leagueHero from "@/assets/league-hero.jpg";
import {
  ArrowRight,
  PartyPopper,
  Music,
  Users,
  Sparkles,
  Gift,
  Ticket,
  CalendarX,
  Calendar,
  Building2,
  UtensilsCrossed,
  Handshake,
  Mic2,
  Gamepad2,
} from "lucide-react";
import { EventCard, FeaturedEvent, EventFilters, NewsletterCTA } from "@/components/events";
import { isToday, isThisWeek, isThisMonth, isPast, format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { localized } from "@/lib/localized";

interface DbArtist {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  instagram_url: string | null;
}

interface DbBrand {
  id: string;
  name: string;
  brand_type: string;
  logo_url: string | null;
}

interface DbEvent {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  city: string | null;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  ticket_url: string;
  event_type: string | null;
  price_label: string | null;
  highlights: string[] | null;
  featured: boolean;
  venue_name: string | null;
  locations: { name: string } | null;
  event_artists: DbArtist[];
  event_brands: DbBrand[];
}

// Benefits Section Data (copy lives in the "events" i18n namespace)
const benefits = [
  {
    icon: Mic2,
    gradient: "from-violet-400/40 to-fuchsia-400/40",
    borderColor: "hover:border-violet-300/60",
    iconColor: "text-violet-300",
  },
  {
    icon: UtensilsCrossed,
    gradient: "from-amber-400/40 to-orange-400/40",
    borderColor: "hover:border-amber-300/60",
    iconColor: "text-amber-300",
  },
  {
    icon: Handshake,
    gradient: "from-cyan-400/40 to-blue-400/40",
    borderColor: "hover:border-cyan-300/60",
    iconColor: "text-cyan-300",
  },
  {
    icon: Gamepad2,
    gradient: "from-emerald-400/40 to-lime-400/40",
    borderColor: "hover:border-emerald-300/60",
    iconColor: "text-emerald-300",
  },
];

const Events = () => {
  const sectionColor = useSectionTheme("events");
  const { t, i18n } = useTranslation(["events", "common"]);
  const dateLocale = i18n.language.startsWith("en") ? enUS : de;
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const resetAllFilters = () => {
    setSearch("");
    setSelectedType(null);
    setSelectedTime(null);
    setShowPast(false);
  };

  const { data: dbEvents, isLoading } = useQuery({
    queryKey: ["public-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`
          id,
          title,
          slug,
          description,
          city,
          start_at,
          end_at,
          image_url,
          ticket_url,
          event_type,
          price_label,
          highlights,
          featured,
          venue_name,
          locations:location_id (name),
          event_artists (id, name, role, image_url, instagram_url),
          event_brands (id, name, brand_type, logo_url)
        `)
        .eq("is_published", true)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data || []) as DbEvent[];
    },
  });

  // Filter and sort events
  const { featuredEvent, upcomingEvents, partnerLogos } = useMemo(() => {
    if (!dbEvents) return { featuredEvent: null, upcomingEvents: [], partnerLogos: [] };

    const now = new Date();
    
    // Filter events
    let filtered = dbEvents.filter((event) => {
      const eventDate = event.start_at ? new Date(event.start_at) : null;
      
      // Past filter
      if (!showPast && eventDate && isPast(eventDate)) return false;
      if (showPast && eventDate && !isPast(eventDate)) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = 
          event.title.toLowerCase().includes(searchLower) ||
          event.city?.toLowerCase().includes(searchLower) ||
          event.venue_name?.toLowerCase().includes(searchLower) ||
          event.highlights?.some(h => h.toLowerCase().includes(searchLower)) ||
          event.event_artists.some(a => a.name.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Type filter
      if (selectedType && event.event_type !== selectedType) return false;
      
      // Time filter
      if (selectedTime && eventDate) {
        if (selectedTime === "today" && !isToday(eventDate)) return false;
        if (selectedTime === "weekend" && !isThisWeek(eventDate, { weekStartsOn: 1 })) return false;
        if (selectedTime === "month" && !isThisMonth(eventDate)) return false;
      }
      
      return true;
    });

    // Find featured event (first one with featured=true, or next upcoming)
    const featured = !showPast 
      ? dbEvents.find(e => e.featured && e.start_at && !isPast(new Date(e.start_at))) 
        || dbEvents.find(e => e.start_at && !isPast(new Date(e.start_at)))
      : null;

    // Remove featured from upcoming list
    const upcoming = filtered.filter(e => e.id !== featured?.id);

    // Collect unique partner logos
    const logos = new Map<string, { name: string; logo_url: string }>();
    dbEvents.forEach(event => {
      event.event_brands.forEach(brand => {
        if (brand.logo_url && !logos.has(brand.id)) {
          logos.set(brand.id, { name: brand.name, logo_url: brand.logo_url });
        }
      });
    });

    return {
      featuredEvent: featured,
      upcomingEvents: upcoming,
      partnerLogos: Array.from(logos.values()),
    };
  }, [dbEvents, search, selectedType, selectedTime, showPast]);

  // Unfiltered DB list is empty → no events created yet (Launch-Placeholder).
  const noEventsAtAll = !isLoading && (!dbEvents || dbEvents.length === 0);

  return (
    <>
      <Helmet>
        <title>{t("meta.title")}</title>
        <meta
          name="description"
          content={t("meta.description")}
        />
      </Helmet>

      <Navigation />
      
      <main className="relative min-h-screen bg-background pt-20" style={sectionThemeVars(sectionColor)}>
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        {/* Hero Section */}
        <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-black">
          {/* Hintergrundbild */}
          <img src={eventsHero} alt="" className="absolute inset-0 w-full h-full object-cover object-center z-0" />
          {/* Overlay */}
          <div
            className="absolute inset-0 z-[1]"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 20%, hsl(71 91% 51% / 0.1), transparent), linear-gradient(180deg, hsl(0 0% 0% / 0.55), hsl(0 0% 0% / 0.72) 60%, #000)",
            }}
          />

          <div className="relative z-10 mx-auto max-w-[860px] px-5 py-24">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                {t("hero.badge")}
              </span>

              <h1 className="font-display font-extrabold leading-[1.04] tracking-[-0.02em] text-white text-[clamp(40px,7.5vw,74px)]">
                {t("hero.titlePrefix")}{" "}
                <span className="italic text-primary">{t("hero.titleHighlight")}</span>
              </h1>

              <p className="text-[clamp(15px,2.3vw,18.5px)] leading-relaxed text-white/75 max-w-[560px]">
                {t("hero.description")}
              </p>

              {/* Trust Strip */}
              <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-3 text-[13.5px] font-semibold text-white/85">
                <span className="inline-flex items-center gap-2">
                  <Music className="w-[15px] h-[15px] text-primary" />
                  {t("hero.trust.djs")}
                </span>
                <span className="w-1 h-1 rounded-full bg-[hsl(0_0%_40%)]" />
                <span className="inline-flex items-center gap-2">
                  <Gift className="w-[15px] h-[15px] text-primary" />
                  {t("hero.trust.brands")}
                </span>
                <span className="w-1 h-1 rounded-full bg-[hsl(0_0%_40%)]" />
                <span className="inline-flex items-center gap-2">
                  <Ticket className="w-[15px] h-[15px] text-primary" />
                  {t("hero.trust.spots")}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3.5 justify-center mt-1">
                <Button variant="hero" size="xl" className="group" asChild>
                  <a href="#filters">
                    <Sparkles className="w-[17px] h-[17px]" />
                    {t("hero.primaryCta")}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                </Button>
                <Button variant="heroOutline" size="xl" asChild>
                  <a href="#ev-plan">
                    <PartyPopper className="w-[17px] h-[17px]" />
                    {t("hero.secondaryCta")}
                  </a>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Featured Event Section */}
        {!noEventsAtAll && featuredEvent && featuredEvent.slug && (
          <>
            <section className="pt-14 md:pt-20">
              <div className="mx-auto max-w-[1200px] px-5">
                <FeaturedEvent
                  slug={featuredEvent.slug}
                  title={localized(featuredEvent, "title", i18n.language)}
                  description={localized(featuredEvent, "description", i18n.language)}
                  city={featuredEvent.city}
                  start_at={featuredEvent.start_at}
                  image_url={featuredEvent.image_url}
                  event_type={featuredEvent.event_type}
                  price_label={localized(featuredEvent, "price_label", i18n.language)}
                  highlights={featuredEvent.highlights}
                  venue_name={featuredEvent.venue_name || featuredEvent.locations?.name || null}
                  event_artists={featuredEvent.event_artists}
                />
              </div>
            </section>
          </>
        )}

        {/* Filters & Events Grid */}
        <section id="filters" className="py-14 md:py-20 scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-5 flex flex-col gap-7">
            {!noEventsAtAll && (
              <>
                {/* Section Header */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="flex items-end justify-between gap-4 flex-wrap"
                >
                  <div className="flex flex-col gap-3">
                    <span className="font-stat text-xs tracking-[0.2em] uppercase text-primary">
                      {t("list.subtitleUpcoming")}
                    </span>
                    <h2 className="font-display font-extrabold text-3xl md:text-[44px] leading-[1.1] tracking-[-0.02em]">
                      {showPast ? t("list.headingPast") : t("list.headingUpcoming")}
                    </h2>
                  </div>
                  {!isLoading && (
                    <span className="font-stat text-[13px] text-[hsl(0_0%_55%)]">
                      {upcomingEvents.length}{" "}
                      {upcomingEvents.length === 1 ? t("list.countSingular") : t("list.countPlural")}
                    </span>
                  )}
                </motion.div>

                {/* Filters */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <EventFilters
                    onSearchChange={setSearch}
                    onTypeChange={setSelectedType}
                    onTimeChange={setSelectedTime}
                    selectedType={selectedType}
                    selectedTime={selectedTime}
                    showPast={showPast}
                    onShowPastChange={setShowPast}
                  />
                </motion.div>
              </>
            )}

            {/* Events Grid / States */}
            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[380px] rounded-2xl border border-[hsl(0_0%_12%)] bg-gradient-card animate-pulse"
                  />
                ))}
              </div>
            ) : noEventsAtAll ? (
              /* No events created yet → Launch-Placeholder */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-md w-full flex flex-col items-center gap-5 text-center rounded-2xl border border-dashed border-border/60 bg-white/[0.02] py-16 px-6"
              >
                <span className="w-14 h-14 rounded-[16px] flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))]">
                  <Calendar className="w-7 h-7" />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-bold text-xl text-foreground">
                    {t("list.comingSoonTitle")}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed text-[hsl(0_0%_60%)]">
                    {t("list.comingSoonText")}
                  </p>
                </div>
                <Button variant="hero" asChild>
                  <a href="#newsletter">{t("list.newsletterCta")}</a>
                </Button>
              </motion.div>
            ) : upcomingEvents.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {upcomingEvents.map((event, index) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    slug={event.slug || event.id}
                    title={localized(event, "title", i18n.language)}
                    description={localized(event, "description", i18n.language)}
                    city={event.city}
                    start_at={event.start_at}
                    end_at={event.end_at}
                    image_url={event.image_url}
                    event_type={event.event_type}
                    price_label={localized(event, "price_label", i18n.language)}
                    highlights={event.highlights}
                    venue_name={event.venue_name || event.locations?.name || null}
                    event_artists={event.event_artists}
                    event_brands={event.event_brands}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              /* Events exist but filter matched nothing */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3.5 text-center py-16 px-5 rounded-[22px] border border-dashed border-[hsl(0_0%_18%)] bg-white/[0.02]"
              >
                <span className="w-[58px] h-[58px] rounded-full bg-white/5 border border-[hsl(0_0%_18%)] flex items-center justify-center text-[hsl(0_0%_55%)]">
                  <CalendarX className="w-[26px] h-[26px]" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display font-bold text-xl text-foreground">
                    {showPast ? t("list.emptyTitlePast") : t("list.emptyTitleUpcoming")}
                  </h3>
                  <p className="text-[14.5px] text-[hsl(0_0%_55%)] max-w-md">
                    {showPast
                      ? t("list.emptyTextPast")
                      : t("list.emptyTextFiltered")}{" "}
                    <span className="text-primary">✨</span>
                  </p>
                </div>
                <Button variant="outline" onClick={resetAllFilters}>
                  <CalendarX className="w-4 h-4" />
                  {t("list.resetFilters")}
                </Button>
              </motion.div>
            )}
          </div>
        </section>

        <SectionDivider variant="glow" />

        {/* Benefits Section */}
        <section className="py-14 md:py-24">
          <div className="mx-auto max-w-[1200px] px-5 flex flex-col gap-11">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex flex-col items-center gap-3.5 text-center max-w-[560px] mx-auto"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                {t("benefits.badge")}
              </span>
              <h2 className="font-display font-extrabold text-3xl md:text-[44px] leading-[1.1] tracking-[-0.02em]">
                {t("benefits.titlePrefix")}{" "}
                <span className="text-gradient-acc">{t("benefits.titleHighlight")}</span>
              </h2>
              <p className="text-[17px] leading-relaxed text-[hsl(0_0%_65%)]">
                {t("benefits.subtitle")}
              </p>
            </motion.div>

            {/* Bento — Part A: Networking image + Stats */}
            <div className="grid lg:grid-cols-5 gap-5">
              {/* Networking (Bild) */}
              <div className="lg:col-span-3 relative rounded-2xl overflow-hidden border border-border/60 min-h-[380px] lg:min-h-[440px] flex flex-col justify-end">
                <img
                  src={leagueHero}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(200deg,hsl(0_0%_0%/0.1),hsl(0_0%_0%/0.92)_80%)]" />
                <span className="absolute top-[18px] left-[18px] font-stat text-[11px] tracking-[0.14em] uppercase text-primary bg-black/60 backdrop-blur-md border border-primary/35 rounded-full px-3.5 py-[7px]">
                  {t("benefits.communityFirstBadge")}
                </span>
                <div className="relative flex flex-col gap-3 p-7">
                  <h3 className="font-display font-extrabold tracking-[-0.02em] text-white text-[clamp(24px,3.4vw,36px)] leading-[1.08]">
                    <Trans
                      i18nKey="events:benefits.networkingTitle"
                      components={[<br />, <span className="italic text-primary" />]}
                    />
                  </h3>
                  <p className="text-[15.5px] leading-relaxed text-white/80 max-w-[420px]">
                    {t("benefits.networkingText")}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    <div className="flex">
                      {[
                        "from-primary to-lime-600",
                        "from-neutral-500 to-neutral-700",
                        "from-lime-500 to-lime-800",
                        "from-neutral-400 to-neutral-600",
                        "from-primary to-lime-400",
                      ].map((g, i) => (
                        <span
                          key={i}
                          className={`w-9 h-9 rounded-full border-2 border-black bg-gradient-to-br ${g} ${
                            i > 0 ? "-ml-2.5" : ""
                          }`}
                        />
                      ))}
                    </div>
                    <span className="inline-flex items-center gap-2 font-stat text-[12.5px] font-bold text-primary">
                      <Users className="w-3.5 h-3.5" />
                      {t("benefits.networkBadge")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="lg:col-span-2 flex flex-col gap-5">
                <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-card p-6 flex flex-col gap-3">
                  <div className="absolute -right-20 -top-20 w-56 h-56 rounded-full bg-[radial-gradient(circle,hsl(71_91%_51%/0.14),transparent_70%)] pointer-events-none" />
                  <span className="w-12 h-12 rounded-[13px] flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))]">
                    <Handshake className="w-[21px] h-[21px]" />
                  </span>
                  <span className="font-display font-extrabold text-[clamp(30px,3.6vw,44px)] leading-[1.05] tracking-[-0.02em] text-primary [text-shadow:0_0_40px_hsl(71_91%_51%/0.35)]">
                    {t("benefits.soloStat")}
                  </span>
                  <h3 className="font-display font-extrabold text-xl tracking-[-0.01em] leading-tight text-foreground">
                    {t("benefits.soloTitle")}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed text-[hsl(0_0%_65%)]">
                    {t("benefits.soloText")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-gradient-card p-5">
                  <div className="flex items-stretch gap-3.5">
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <Building2 className="w-[19px] h-[19px] text-primary" />
                      <span className="font-display font-bold text-[17px] leading-tight text-foreground">{t("benefits.partnerClubsTitle")}</span>
                      <span className="text-[12.5px] text-[hsl(0_0%_55%)]">{t("benefits.partnerClubsText")}</span>
                    </div>
                    <span className="w-px bg-[hsl(0_0%_14%)] flex-none" />
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <Users className="w-[19px] h-[19px] text-primary" />
                      <span className="font-display font-bold text-[17px] leading-tight text-foreground">{t("benefits.allLevelsTitle")}</span>
                      <span className="text-[12.5px] text-[hsl(0_0%_55%)]">{t("benefits.allLevelsText")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bento — Part B: Afterplay image + "Immer dabei" */}
            <div className="grid lg:grid-cols-5 gap-5">
              {/* Afterplay (Bild) */}
              <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-border/60 min-h-[300px] lg:min-h-[340px] flex flex-col justify-end">
                <img src={eventsHero} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(200deg,hsl(0_0%_0%/0.15),hsl(0_0%_0%/0.92)_80%)]" />
                <span className="absolute top-[18px] left-[18px] font-stat text-[11px] tracking-[0.14em] uppercase text-primary bg-black/60 backdrop-blur-md border border-primary/35 rounded-full px-3.5 py-[7px]">
                  {t("benefits.afterplayBadge")}
                </span>
                <div className="relative flex flex-col gap-2.5 p-6">
                  <h3 className="font-display font-extrabold tracking-[-0.02em] text-white text-[clamp(21px,2.6vw,28px)] leading-[1.12]">
                    {t("benefits.afterplayTitle")}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed text-white/80">
                    {t("benefits.afterplayText")}
                  </p>
                </div>
              </div>

              {/* Immer dabei */}
              <div className="lg:col-span-3 rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-7 flex flex-col gap-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="font-display font-bold text-xl tracking-[-0.01em] text-foreground">
                    {t("benefits.alwaysIncludedTitle")}
                  </h3>
                  <span className="font-stat text-[11px] tracking-[0.14em] uppercase text-[hsl(0_0%_50%)]">
                    {t("benefits.alwaysIncludedSub")}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3.5 flex-1">
                  {benefits.map((benefit, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.08 }}
                      className={`flex items-center gap-4 rounded-2xl p-[18px] border bg-gradient-to-br ${benefit.gradient} ${benefit.borderColor} transition-colors`}
                    >
                      <span className="w-[52px] h-[52px] flex-none rounded-[14px] flex items-center justify-center bg-background/40 backdrop-blur-sm border border-white/10">
                        <benefit.icon className={`w-[22px] h-[22px] ${benefit.iconColor}`} />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-display font-bold text-[17px] text-foreground">
                          {t(`benefits.items.${index}.title`)}
                        </span>
                        <span className="text-sm leading-snug text-[hsl(0_0%_62%)]">
                          {t(`benefits.items.${index}.description`)}
                        </span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Newsletter + Event planen Side-by-Side */}
            <div id="ev-nlgrid" className="grid md:grid-cols-2 gap-5 scroll-mt-24">
              <NewsletterCTA />

              <div
                id="ev-plan"
                className="h-full rounded-2xl border border-border/60 bg-gradient-card p-7 flex flex-col gap-4 scroll-mt-24"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-12 h-12 rounded-[13px] flex-none flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))]">
                    <PartyPopper className="w-[21px] h-[21px]" />
                  </span>
                  <h3 className="font-display font-bold text-xl tracking-[-0.01em] text-foreground">
                    {t("planEvent.title")}
                  </h3>
                </div>
                <p className="text-[14.5px] leading-relaxed text-[hsl(0_0%_65%)]">
                  {t("planEvent.description")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mt-auto">
                  <Button variant="heroOutline" size="lg" asChild>
                    <NavLink to="/faq-kontakt?reason=verein">
                      {t("planEvent.primaryCta")}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </NavLink>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      </main>

      <Footer />
    </>
  );
};

export default Events;
