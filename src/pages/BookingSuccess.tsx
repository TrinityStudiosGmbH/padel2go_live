import { useEffect, useState } from "react";
import { useSearchParams, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import Navigation from "@/components/Navigation";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Check, CalendarDays, ArrowRight, Loader2, Coins, Gift, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { LobbyActionButton, type BookingForLobby } from "@/components/lobby";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { useCheckoutVerification, CheckoutStatusNotice } from "@/components/CheckoutStatusNotice";

interface EarnedReward {
  points: number;
  title: string;
}

const BookingSuccess = () => {
  const sectionColor = useSectionTheme("booking");
  const { t } = useTranslation("booking");
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [earnedRewards, setEarnedRewards] = useState<EarnedReward[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [recentBooking, setRecentBooking] = useState<BookingForLobby | null>(null);
  const { user } = useAuth();
  const { canSee } = useFeatureToggles();
  const sessionId = searchParams.get("session_id");
  // Erst bei Stripe nachfragen, dann feiern.
  const { state: payState, resumeUrl } = useCheckoutVerification(sessionId);
  const paymentDone = payState === "confirmed" || payState === "processing" || payState === "unknown";
  const isGuest = searchParams.get("guest") === "1" || !user;

  useEffect(() => {
    const fetchEarnedRewards = async () => {
      // Brief loading state to allow webhook processing
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (user) {
        // Fetch the just-paid booking so we can offer "make it a lobby"
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: latestBookings } = await supabase
          .from("bookings")
          .select(`
            id, location_id, court_id, start_time, end_time, price_cents,
            location:locations(name),
            court:courts(name)
          `)
          .eq("user_id", user.id)
          .eq("status", "confirmed")
          .gte("start_time", new Date().toISOString())
          .gte("updated_at", tenMinutesAgo)
          .order("updated_at", { ascending: false })
          .limit(1);

        const lb = latestBookings?.[0];
        if (lb && lb.location_id && lb.court_id) {
          setRecentBooking({
            id: lb.id,
            location_id: lb.location_id,
            court_id: lb.court_id,
            start_time: lb.start_time,
            end_time: lb.end_time,
            price_cents: lb.price_cents || 0,
            location_name: (lb.location as any)?.name,
            court_name: (lb.court as any)?.name,
          });
        }

        // Fetch rewards earned in the last 5 minutes (recent booking rewards)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentRewards } = await supabase
          .from("reward_instances")
          .select("points, definition_key, created_at")
          .eq("user_id", user.id)
          .eq("status", "CLAIMED")
          .gte("created_at", fiveMinutesAgo)
          .in("source_type", ["booking"])
          .order("created_at", { ascending: false });

        if (recentRewards && recentRewards.length > 0) {
          // Map definition keys to titles via translations
          const rewards = recentRewards.map((r) => {
            const key = `success.rewards.titles.${r.definition_key}`;
            const translated = t(key, { defaultValue: r.definition_key });
            return {
              points: r.points,
              title: translated,
            };
          });

          setEarnedRewards(rewards);
          setTotalEarned(rewards.reduce((sum, r) => sum + r.points, 0));
        }
      }

      setLoading(false);
    };

    fetchEarnedRewards();
  }, [user, t]);

  if (loading) {
    return (
      <>
        <Navigation />
        <main
          className="min-h-screen bg-background pt-24 flex items-center justify-center"
          style={sectionThemeVars(sectionColor)}
        >
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">{t("success.processing")}</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t("meta.success.title")}</title>
        <meta name="description" content={t("meta.success.description")} />
      </Helmet>

      <Navigation />

      <main
        className="relative min-h-screen bg-background pt-16 md:pt-20"
        style={sectionThemeVars(sectionColor)}
      >
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        <BookingStepper currentStep={3} />

        <section
          className="pt-10 md:pt-14 pb-24 px-5"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, hsl(var(--primary) / 0.09), transparent)" }}
        >
          <div className="mx-auto max-w-[560px] flex flex-col items-center gap-[22px] text-center">
            <CheckoutStatusNotice
              state={payState}
              resumeUrl={resumeUrl}
              backTo="/booking"
              backLabel="Zurück zur Buchung"
            />

            {paymentDone && (
              <>
                {/* Check-Kreis */}
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 14 }}
                  className="w-24 h-24 rounded-full bg-primary/10 border border-primary/45 flex items-center justify-center text-primary shadow-[0_0_60px_hsl(var(--primary)/0.3)]"
                >
                  <Check className="w-11 h-11" strokeWidth={2.5} />
                </motion.span>

                {/* Titel + Untertitel */}
                <div className="flex flex-col gap-2.5">
                  <h1 className="font-bold tracking-tight text-foreground leading-tight text-[clamp(30px,5vw,42px)]">
                    {t("success.title")}
                  </h1>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    {t("success.description")}
                  </p>
                </div>
              </>
            )}

            {/* Detail-Karte (echte Buchungsdaten) */}
            {recentBooking && (
              <div className="w-full rounded-2xl border border-border/60 bg-gradient-card p-6">
                <div className="flex flex-col gap-3 text-left">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] text-muted-foreground">Standort</span>
                    <span className="text-sm font-semibold text-foreground text-right">{recentBooking.location_name}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] text-muted-foreground">Court</span>
                    <span className="text-sm font-semibold text-foreground">{recentBooking.court_name}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] text-muted-foreground">Termin</span>
                    <span className="font-stat text-[13.5px] font-semibold text-foreground">
                      {new Date(recentBooking.start_time).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                      {" · "}
                      {new Date(recentBooking.start_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] text-muted-foreground">Bezahlt</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-stat text-[15px] font-bold text-primary">
                        {(recentBooking.price_cents / 100).toFixed(2).replace(".", ",")} €
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Bestätigt
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* P2G Points Earned Confirmation (eingeloggt) */}
            {totalEarned > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full rounded-[18px] border border-primary/35 p-5 text-left"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.03))" }}
              >
                <div className="flex items-center gap-3.5 mb-3">
                  <span className="flex-none w-[46px] h-[46px] rounded-[13px] bg-primary/[0.12] border border-primary/35 flex items-center justify-center text-primary">
                    <Coins className="w-5 h-5" />
                  </span>
                  <span className="font-semibold text-primary">
                    {t("success.rewards.creditedHeading")}
                  </span>
                </div>

                <div className="space-y-1.5 pl-[60px] text-sm">
                  {earnedRewards.map((reward, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{reward.title}</span>
                      <span className="font-stat text-primary font-medium">+{reward.points}</span>
                    </div>
                  ))}
                  <div className="border-t border-primary/20 pt-2 mt-2 flex justify-between items-center font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Gift className="h-4 w-4 text-primary" />
                      {t("success.rewards.totalLabel")}
                    </span>
                    <span className="font-stat text-primary text-lg">+{totalEarned}{t("success.rewards.totalSuffix")}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Lobby CTA — turn this booking into a lobby (hidden while lobbies feature isn't visible to this user) */}
            {!isGuest && recentBooking && canSee("lobbies") && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full rounded-[18px] border border-primary/30 bg-primary/5 p-5 text-left"
              >
                <div className="flex items-start gap-3.5">
                  <span className="flex-none w-[46px] h-[46px] rounded-[13px] bg-primary/[0.12] border border-primary/35 flex items-center justify-center text-primary">
                    <Users className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {t("success.lobby.title")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                      {t("success.lobby.body")}
                    </p>
                    <LobbyActionButton booking={recentBooking} variant="default" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Gast-Box: Points warten */}
            {isGuest && (
              <div
                className="w-full rounded-[18px] border border-primary/35 p-5 text-left"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.03))" }}
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex-none w-[46px] h-[46px] rounded-[13px] bg-primary/[0.12] border border-primary/35 flex items-center justify-center text-primary">
                    <Gift className="w-5 h-5" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-primary" />
                      {t("success.guestInfo.title")}
                    </span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{t("success.guestInfo.body")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action-Buttons */}
            <div className="flex flex-col gap-3 w-full">
              <div className="flex gap-3 w-full flex-wrap">
                <Button variant="outline" size="lg" className="flex-1 min-w-[200px]" asChild>
                  <NavLink to="/booking">
                    {t("success.actions.anotherBooking")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </NavLink>
                </Button>

                {!isGuest ? (
                  <Button variant="lime" size="lg" className="flex-1 min-w-[200px]" asChild>
                    <NavLink to="/account">
                      <CalendarDays className="w-4 h-4 mr-2" />
                      {t("success.actions.myBookings")}
                    </NavLink>
                  </Button>
                ) : (
                  <Button variant="lime" size="lg" className="flex-1 min-w-[200px]" asChild>
                    <NavLink to="/auth">
                      <Sparkles className="w-4 h-4 mr-2" />
                      {t("success.actions.createAccount")}
                    </NavLink>
                  </Button>
                )}
              </div>

              {!isGuest && totalEarned > 0 && (
                <Button variant="outline" size="lg" className="w-full border-primary/30 text-primary hover:bg-primary/10" asChild>
                  <NavLink to="/dashboard/p2g-points">
                    <Coins className="w-4 h-4 mr-2" />
                    {t("success.actions.myCredits")}
                  </NavLink>
                </Button>
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

export default BookingSuccess;
