import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import Navigation from "@/components/Navigation";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { LocationCard } from "@/components/booking/LocationCard";
import { MyBookings } from "@/components/booking/MyBookings";
import { useAuth } from "@/hooks/useAuth";
import { fetchLocationMinPriceCents } from "@/hooks/useCourtPrices";
import type { DbLocation } from "@/types/database";

interface LocationWithAvailability extends DbLocation {
  todayFreeSlots: number;
  occupancyPercent: number;
  minPriceCents: number | null;
  /** Padel-Courts — die Karte spricht in erster Linie von Padel. */
  courtCount: number;
  tennisCourtCount: number;
}

const Booking = () => {
  const sectionColor = useSectionTheme("booking");
  const { t } = useTranslation("booking");
  const { user } = useAuth();
  const [locations, setLocations] = useState<LocationWithAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const { data: locationsData, error } = await supabase
        .from("locations")
        .select("*")
        .eq("is_online", true);

      if (error) throw error;

      // Globaler Standardpreis als Rueckfall fuer die "ab X EUR"-Anzeige.
      // Die Sportart MUSS mit: seit der Vereinheitlichung gibt es je Sportart
      // eine eigene 60-Minuten-Zeile, ohne Filter kaeme hier keine eindeutige.
      const { data: globalPrice } = await (supabase as any)
        .from("court_prices")
        .select("price_cents")
        .eq("sport", "padel")
        .eq("duration_minutes", 60)
        .maybeSingle();

      const globalMinPrice = globalPrice?.price_cents ?? null;

      // Calculate availability for each location
      const today = new Date();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayName = dayNames[today.getDay()];

      const locationsWithAvailability = await Promise.all(
        (locationsData || []).map(async (loc) => {
          const hours = (loc.opening_hours_json as Record<string, { open: string; close: string } | undefined>)?.[todayName];
          
          // Get courts for this location
          // `sport` fehlt noch in den generierten Typen -> Client-Cast wie anderswo im Repo.
          const { data: courts } = await (supabase as any)
            .from("courts")
            .select("id, sport")
            .eq("location_id", loc.id)
            .eq("is_active", true);

          const courtRows = (courts ?? []) as { id: string; sport?: string | null }[];
          const courtIds = courtRows.map(c => c.id);
          const tennisCourtCount = courtRows.filter(c => c.sport === "tennis").length;
          const padelCourtCount = courtIds.length - tennisCourtCount;

          // Günstigster PADEL-Preis inkl. Zeitfenster-Bänder (aufgelöst in der DB)
          let minPriceCents: number | null = globalMinPrice;
          if (courtIds.length > 0) {
            minPriceCents = (await fetchLocationMinPriceCents(courtIds)) ?? minPriceCents;
          }

          if (!hours) {
            return {
              ...loc,
              todayFreeSlots: 0,
              occupancyPercent: 0,
              minPriceCents,
              courtCount: padelCourtCount,
              tennisCourtCount,
            };
          }

          // Calculate total available minutes today
          const [openHour, openMin] = hours.open.split(':').map(Number);
          const [closeHour, closeMin] = hours.close.split(':').map(Number);
          const totalMinutes = (closeHour * 60 + closeMin) - (openHour * 60 + openMin);
          const totalSlots = Math.floor(totalMinutes / 60); // 1-hour slots

          // Get bookings for today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const { data: bookings } = await supabase
            .from("bookings")
            .select("start_time, end_time")
            .in("court_id", courtIds.length > 0 ? courtIds : [''])
            .in("status", ["pending", "confirmed"])
            .gte("start_time", todayStart.toISOString())
            .lte("end_time", todayEnd.toISOString());

          const bookedMinutes = (bookings || []).reduce((sum, b) => {
            const start = new Date(b.start_time);
            const end = new Date(b.end_time);
            return sum + (end.getTime() - start.getTime()) / 60000;
          }, 0);

          const courtsCount = courtIds.length || 1;
          const totalAvailableMinutes = totalMinutes * courtsCount;
          const occupancyPercent = Math.round((bookedMinutes / totalAvailableMinutes) * 100);
          const freeSlots = Math.max(0, (totalSlots * courtsCount) - Math.ceil(bookedMinutes / 60));

          return {
            ...loc,
            todayFreeSlots: freeSlots,
            occupancyPercent: Math.min(100, occupancyPercent),
            minPriceCents,
            courtCount: padelCourtCount,
            tennisCourtCount,
          };
        })
      );

      setLocations(locationsWithAvailability as unknown as LocationWithAvailability[]);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t("meta.booking.title")}</title>
        <meta name="description" content={t("meta.booking.description")} />
      </Helmet>

      <Navigation />

      <main
        className="relative min-h-screen bg-background pt-16 md:pt-20"
        style={sectionThemeVars(sectionColor)}
      >
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        <BookingStepper currentStep={0} />

        <section className="px-5 pt-8 md:pt-10 pb-24">
          <div className="mx-auto max-w-[1200px]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                Court buchen
              </span>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.08]">
                {t("landing.heading")}<span className="text-gradient-acc">{t("landing.headingHighlight")}</span>
              </h1>
              <p className="max-w-[520px] text-base md:text-lg text-muted-foreground">
                {t("landing.intro")}
              </p>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-4 py-[7px] text-[13.5px] font-semibold text-primary">
                <Zap className="w-3.5 h-3.5" />
                Ohne Konto buchbar — einfach als Gast
              </span>
            </motion.div>

            {user && (
              <div className="mt-10">
                <MyBookings />
              </div>
            )}

            <div className="mt-11">
              {loading ? (
                <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-[440px] rounded-2xl border border-[hsl(0_0%_12%)] bg-gradient-card animate-pulse"
                    />
                  ))}
                </div>
              ) : locations.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-muted-foreground">{t("landing.noLocations")}</p>
                </div>
              ) : (
                <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
                  {locations.map((location, index) => (
                    <LocationCard
                      key={location.id}
                      location={location}
                      todayFreeSlots={location.todayFreeSlots}
                      occupancyPercent={location.occupancyPercent}
                      index={index}
                      minPriceCents={location.minPriceCents}
                      courtCount={location.courtCount}
                      tennisCourtCount={location.tennisCourtCount}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      </main>

      <Footer />
    </>
  );
};

export default Booking;
