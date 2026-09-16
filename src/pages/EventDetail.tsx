import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/NavLink";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  ArrowLeft, 
  ExternalLink,
  Music,
  Instagram,
  Globe,
  Users,
  Ticket,
  Sparkles,
  CalendarX
} from "lucide-react";
import { EventCard } from "@/components/events";
import { localized } from "@/lib/localized";
import { StorageImage } from "@/components/StorageImage";

interface DbArtist {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
}

interface DbBrand {
  id: string;
  name: string;
  brand_type: string;
  logo_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
}

interface DbEventDetail {
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
  price_cents: number | null;
  highlights: string[] | null;
  featured: boolean;
  venue_name: string | null;
  location_url: string | null;
  address_line1: string | null;
  postal_code: string | null;
  capacity: number | null;
  locations: { name: string; address: string | null } | null;
  event_artists: DbArtist[];
  event_brands: DbBrand[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EventDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("events");

  const isEn = i18n.language.startsWith("en");
  const dateLocale = isEn ? enUS : de;
  const dateFmtLong = isEn ? "EEEE, MMMM d, yyyy" : "EEEE, d. MMMM yyyy";
  const dateFmtMedium = isEn ? "EEEE, MMMM d" : "EEEE, d. MMMM";

  const EVENT_TYPE_LABELS = t("eventTypeLabels", { returnObjects: true }) as Record<string, string>;
  const ARTIST_ROLE_LABELS = t("artistRoleLabels", { returnObjects: true }) as Record<string, string>;

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event-detail", slug],
    queryFn: async () => {
      const query = supabase
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
          price_cents,
          highlights,
          featured,
          venue_name,
          location_url,
          address_line1,
          postal_code,
          capacity,
          locations:location_id (name, address),
          event_artists (id, name, role, image_url, instagram_url, website_url),
          event_brands (id, name, brand_type, logo_url, website_url, instagram_url)
        `)
        .eq("is_published", true);

      // Event lists link by `event.slug || event.id`, so the param may be a UUID
      const { data, error } = await (UUID_REGEX.test(slug!)
        ? query.eq("id", slug!)
        : query.eq("slug", slug!)
      ).single();

      if (error) throw error;
      return data as DbEventDetail;
    },
    enabled: !!slug,
  });

  // Fetch similar events
  const { data: similarEvents } = useQuery({
    queryKey: ["similar-events", event?.event_type, event?.id],
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
          event_type,
          price_label,
          highlights,
          venue_name,
          locations:location_id (name),
          event_artists (id, name, image_url),
          event_brands (id, name, logo_url)
        `)
        .eq("is_published", true)
        .eq("event_type", event?.event_type || "")
        .neq("id", event?.id || "")
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
    enabled: !!event?.event_type && !!event?.id,
  });

  if (isLoading) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-background pt-16 md:pt-20">
          <section className="pt-6 pb-24">
            <div className="mx-auto max-w-[1200px] px-5 flex flex-col gap-5">
              <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
              <div className="h-[340px] rounded-[22px] border border-border/60 bg-gradient-card animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
                <div className="h-[320px] rounded-[20px] border border-border/60 bg-gradient-card animate-pulse" />
                <div className="h-[320px] rounded-[20px] border border-border/60 bg-gradient-card animate-pulse" />
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  if (error || !event) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-background pt-16 md:pt-20">
          <section className="pt-[110px] pb-24 px-5">
            <div className="mx-auto max-w-[440px] flex flex-col items-center gap-5 text-center">
              <span className="w-[88px] h-[88px] rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-muted-foreground">
                <CalendarX className="w-[38px] h-[38px]" />
              </span>
              <div className="flex flex-col gap-2.5">
                <h1 className="text-[clamp(26px,4.4vw,36px)] font-black tracking-tight text-foreground">
                  {t("detail.notFoundTitle")}
                </h1>
                <p className="text-[15.5px] leading-relaxed text-muted-foreground">
                  {t("detail.notFoundText")}
                </p>
              </div>
              <Button variant="hero" size="lg" onClick={() => navigate("/events")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("detail.back")}
              </Button>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const startDate = event.start_at ? new Date(event.start_at) : null;
  const endDate = event.end_at ? new Date(event.end_at) : null;
  const isPast = startDate ? startDate.getTime() < Date.now() : false;
  const daysUntil = startDate
    ? Math.ceil((startDate.getTime() - Date.now()) / 86_400_000)
    : null;
  const isSoon = !isPast && daysUntil !== null && daysUntil <= 7;
  const localizedTitle = localized(event, "title", i18n.language);
  const localizedDescription = localized(event, "description", i18n.language);
  const localizedPriceLabel = localized(event, "price_label", i18n.language);
  const highlights =
    isEn && Array.isArray((event as any).highlights_en) && (event as any).highlights_en.length
      ? ((event as any).highlights_en as string[])
      : event.highlights;
  const fullAddress = [
    event.venue_name || event.locations?.name,
    event.address_line1 || event.locations?.address,
    event.postal_code && event.city ? `${event.postal_code} ${event.city}` : event.city,
  ].filter(Boolean).join(", ");

  // Schema.org Event JSON-LD
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: event.start_at,
    endDate: event.end_at,
    image: event.image_url,
    location: {
      "@type": "Place",
      name: event.venue_name || event.locations?.name,
      address: fullAddress,
    },
    offers: event.price_cents ? {
      "@type": "Offer",
      price: event.price_cents / 100,
      priceCurrency: "EUR",
      url: event.ticket_url,
    } : undefined,
  };

  return (
    <>
      <Helmet>
        <title>{event.title} | {t("detail.metaTitleSuffix")}</title>
        <meta
          name="description"
          content={event.description || t("detail.metaDescriptionFallback", { title: event.title })}
        />
        <meta property="og:title" content={event.title} />
        <meta property="og:description" content={event.description || ""} />
        {event.image_url && <meta property="og:image" content={event.image_url} />}
        <script type="application/ld+json">
          {JSON.stringify(eventSchema)}
        </script>
      </Helmet>

      <Navigation />
      
      <main className="min-h-screen bg-background pt-16 md:pt-20">
        <section className="pt-6 pb-24">
          <div className="mx-auto max-w-[1200px] px-5 flex flex-col gap-5">
            {/* Back Button */}
            <button
              onClick={() => navigate("/events")}
              className="inline-flex items-center gap-1.5 self-start py-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("detail.back")}
            </button>

            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden rounded-[22px] border border-border/80"
            >
              {event.image_url ? (
                <StorageImage
                  src={event.image_url}
                  renderWidth={1600}
                  alt={event.title}
                  className="block w-full h-[clamp(280px,38vw,400px)] object-cover"
                />
              ) : (
                <div className="w-full h-[clamp(280px,38vw,400px)] bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center">
                  <Sparkles className="w-24 h-24 text-primary/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/15 to-black/90" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-[clamp(20px,3vw,30px)]">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {event.event_type && (
                    <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                    </span>
                  )}
                  {event.featured && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-black/60 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
                      <Sparkles className="w-3 h-3" />
                      {t("detail.featured")}
                    </span>
                  )}
                  {isPast && (
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                      {t("detail.past")}
                    </span>
                  )}
                  {isSoon && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-black/60 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
                      <span className="w-[7px] h-[7px] rounded-full bg-primary animate-pulse" />
                      {daysUntil === 0 ? t("detail.today") : t("detail.inDays", { count: daysUntil })}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="max-w-[820px] text-[clamp(28px,4.6vw,48px)] font-black leading-[1.08] tracking-tight text-foreground">
                  {localizedTitle}
                </h1>

                {/* Meta Info */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {startDate && (
                    <span className="inline-flex items-center gap-2 font-stat text-[13px] text-foreground/80">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {format(startDate, dateFmtLong, { locale: dateLocale })}
                    </span>
                  )}
                  {startDate && (
                    <span className="inline-flex items-center gap-2 font-stat text-[13px] text-foreground/80">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      {t("time.withSuffix", { time: format(startDate, "HH:mm", { locale: dateLocale }) })}
                      {endDate && ` – ${t("time.withSuffix", { time: format(endDate, "HH:mm", { locale: dateLocale }) })}`}
                    </span>
                  )}
                  {event.capacity && (
                    <span className="inline-flex items-center gap-2 font-stat text-[13px] text-foreground/80">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      {t("detail.capacity", { n: event.capacity })}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">
              {/* Main Content */}
              <div className="flex flex-col gap-4 min-w-0">
                {/* About */}
                {event.description && (
                  <div className="rounded-2xl border border-border/60 bg-gradient-card p-[26px]">
                    <div className="flex flex-col gap-3.5">
                      <h2 className="text-[21px] font-bold tracking-tight text-foreground">
                        {t("detail.aboutHeading")}
                      </h2>
                      <p className="text-[15.5px] leading-[1.7] text-muted-foreground whitespace-pre-line">
                        {localizedDescription}
                      </p>
                      {highlights && highlights.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {highlights.map((highlight) => (
                            <span
                              key={highlight}
                              className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-3.5 py-1.5 text-[12.5px] font-semibold text-primary"
                            >
                              <Sparkles className="w-3 h-3" />
                              {highlight}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Line-up */}
                {event.event_artists.length > 0 && (
                  <div className="rounded-2xl border border-border/60 bg-gradient-card p-[26px]">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-[21px] font-bold tracking-tight text-foreground">
                          {t("detail.lineupHeading")}
                        </h2>
                        <span className="font-stat text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {t("detail.actsCount", { count: event.event_artists.length })}
                        </span>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5">
                        {event.event_artists.map((artist) => (
                          <div
                            key={artist.id}
                            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-primary/40"
                          >
                            <span className="w-11 h-11 shrink-0 overflow-hidden rounded-full border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] flex items-center justify-center text-primary">
                              {artist.image_url ? (
                                <StorageImage
                                  src={artist.image_url}
                                  renderWidth={200}
                                  alt={artist.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Music className="w-[18px] h-[18px]" />
                              )}
                            </span>
                            <span className="flex flex-col gap-px flex-1 min-w-0">
                              <span className="truncate text-[15px] font-bold text-foreground">
                                {artist.name}
                              </span>
                              <span className="text-[12.5px] text-muted-foreground">
                                {ARTIST_ROLE_LABELS[artist.role] || artist.role}
                              </span>
                            </span>
                            <span className="flex gap-1.5">
                              {artist.instagram_url && (
                                <a
                                  href={artist.instagram_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Instagram"
                                  className="w-[30px] h-[30px] rounded-[9px] border border-white/15 flex items-center justify-center text-muted-foreground transition-colors hover:text-primary hover:border-primary/40"
                                >
                                  <Instagram className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {artist.website_url && (
                                <a
                                  href={artist.website_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Website"
                                  className="w-[30px] h-[30px] rounded-[9px] border border-white/15 flex items-center justify-center text-muted-foreground transition-colors hover:text-primary hover:border-primary/40"
                                >
                                  <Globe className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Partners */}
                {event.event_brands.length > 0 && (
                  <div className="rounded-2xl border border-border/60 bg-gradient-card p-[26px]">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-[21px] font-bold tracking-tight text-foreground">
                          {t("detail.partnersHeading")}
                        </h2>
                        <span className="font-stat text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {t("detail.partnersOnBoard")}
                        </span>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-3">
                        {event.event_brands.map((brand) => (
                          <a
                            key={brand.id}
                            href={brand.website_url || brand.instagram_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-[76px] items-center justify-center overflow-hidden rounded-2xl bg-[#F5F5F3] p-2.5"
                          >
                            {brand.logo_url ? (
                              <StorageImage
                                src={brand.logo_url}
                                renderWidth={300}
                                alt={brand.name}
                                className="max-h-[56px] w-full object-contain"
                              />
                            ) : (
                              <span className="font-bold text-black">{brand.name}</span>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Location */}
                {fullAddress && (
                  <div className="rounded-2xl border border-border/60 bg-gradient-card p-[26px]">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="w-12 h-12 shrink-0 rounded-[13px] border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] flex items-center justify-center text-primary">
                        <MapPin className="w-[21px] h-[21px]" />
                      </span>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
                        <span className="text-[17px] font-bold text-foreground">
                          {event.venue_name || event.locations?.name}
                        </span>
                        <span className="text-[13.5px] text-muted-foreground">
                          {event.address_line1 || event.locations?.address}
                          {event.postal_code && event.city && (
                            <>{" "}· {event.postal_code} {event.city}</>
                          )}
                        </span>
                      </div>
                      {event.location_url && (
                        <Button variant="outline" size="default" asChild>
                          <a
                            href={event.location_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("detail.routeCta")}
                            <ExternalLink className="w-3.5 h-3.5 ml-2" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Ticket Sidebar */}
              <div className="lg:sticky lg:top-24">
                <div className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-lg shadow-primary/5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-[42px] h-[42px] rounded-xl border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] flex items-center justify-center text-primary">
                        <Ticket className="w-[19px] h-[19px]" />
                      </span>
                      <h3 className="text-[18px] font-bold text-foreground">
                        {t("detail.ticketsLabel")}
                      </h3>
                    </div>

                    {localizedPriceLabel && (
                      <div className="font-stat text-[34px] font-bold leading-none text-primary">
                        {localizedPriceLabel}
                      </div>
                    )}

                    {event.capacity && (
                      <p className="text-[12.5px] text-muted-foreground">
                        {t("detail.capacityAvailable", { n: event.capacity })}
                      </p>
                    )}

                    <div className="flex flex-col gap-2.5 rounded-[13px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
                      {startDate && (
                        <span className="inline-flex items-center gap-2.5 font-stat text-[12.5px] text-foreground/75">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          {format(startDate, dateFmtLong, { locale: dateLocale })}
                        </span>
                      )}
                      {startDate && (
                        <span className="inline-flex items-center gap-2.5 font-stat text-[12.5px] text-foreground/75">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          {t("time.withSuffix", { time: format(startDate, "HH:mm", { locale: dateLocale }) })}
                          {endDate && ` – ${t("time.withSuffix", { time: format(endDate, "HH:mm", { locale: dateLocale }) })}`}
                        </span>
                      )}
                      {(event.venue_name || event.locations?.name) && (
                        <span className="inline-flex items-center gap-2.5 text-[13px] text-foreground/75">
                          <MapPin className="w-3.5 h-3.5 text-primary" />
                          {event.venue_name || event.locations?.name}
                        </span>
                      )}
                    </div>

                    <Button
                      variant="hero"
                      size="xl"
                      className="w-full group"
                      asChild
                    >
                      <a
                        href={event.ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Ticket className="w-[17px] h-[17px] mr-2" />
                        {t("detail.ticketsCta")}
                        <ExternalLink className="w-4 h-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </a>
                    </Button>

                    <span className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <ExternalLink className="w-3 h-3" />
                      {t("detail.ticketsNote")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Similar Events */}
            {similarEvents && similarEvents.length > 0 && (
              <div className="flex flex-col gap-[18px] mt-6">
                <h2 className="text-[23px] font-bold tracking-tight text-foreground">
                  {t("detail.similarHeading")}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
                  {similarEvents.map((similar: any, index: number) => (
                    <EventCard
                      key={similar.id}
                      id={similar.id}
                      slug={similar.slug || similar.id}
                      title={localized(similar, "title", i18n.language)}
                      description={localized(similar, "description", i18n.language)}
                      city={similar.city}
                      start_at={similar.start_at}
                      end_at={similar.end_at}
                      image_url={similar.image_url}
                      event_type={similar.event_type}
                      price_label={localized(similar, "price_label", i18n.language)}
                      highlights={similar.highlights}
                      venue_name={similar.venue_name || similar.locations?.name || null}
                      event_artists={similar.event_artists || []}
                      event_brands={similar.event_brands || []}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default EventDetail;
