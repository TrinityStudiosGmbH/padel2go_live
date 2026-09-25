import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Star, Gift, History, MapPin, CalendarCheck, Trophy, ShoppingBag, User as UserIcon,
  ArrowRight, Calendar, ShieldCheck, CalendarPlus, Sparkles, Coins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useAccountData } from "@/hooks/useAccountData";
import { useP2GPoints } from "@/hooks/useP2GPoints";
import { usePointsValue } from "@/hooks/usePointsValue";
import { useMarketplaceItems } from "@/hooks/useMarketplaceItems";
import { useDashboardEvents, useMyEventRegistrations } from "@/hooks/useEventRegistrations";
import { eur as eurFmt, ptsFmt, maxRedeemablePoints } from "@/lib/marketplace";
import { useArticles } from "@/hooks/useArticles";
import { sectionThemeVars, useSectionTheme, useSectionThemes, type SectionKey } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import { NewsCard } from "@/components/news/NewsCard";
import courtHero from "@/assets/courts/skypadel-outdoor.jpg";
import { StorageImage } from "@/components/StorageImage";

const MON = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

const DashboardHome = () => {
  const { user } = useAuth();
  const { canSee } = useFeatureToggles();
  const { profile, wallet } = useAccountData(user);
  const { summary } = useP2GPoints();
  const { centsPerPoint, maxPercent, enabled: pointsEnabled } = usePointsValue();
  const { data: marketItems } = useMarketplaceItems();
  const { data: allEvents } = useDashboardEvents();
  const { data: myRegs } = useMyEventRegistrations();
  const { data: articles } = useArticles("logged_in");
  const sectionColor = useSectionTheme("home");
  const sectionThemes = useSectionThemes();
  const eventsColor = sectionThemes.events;

  // Live P2G points = the single spendable balance (play + reward), same as "Mein P2G",
  // the nav and Account. (DashboardHome previously showed only play_credits → the 1.200 vs
  // 2.200 mismatch.) Forward-compatible with merging both buckets into one score.
  const balance =
    summary?.redeemable_balance ??
    summary?.reward_balance ??
    ((wallet?.play_credits ?? 0) + (wallet?.reward_credits ?? 0));
  const pointsPerEuro = Math.round(100 / centsPerPoint);
  const userName = (profile?.display_name || user?.email?.split("@")[0] || "Spieler").trim();

  const euroValue = eurFmt(Math.round(balance * centsPerPoint));

  // Upcoming confirmed bookings (list + count).
  const { data: bookings } = useQuery({
    queryKey: ["dash-upcoming-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, status, play_credits_awarded, location:locations(name), court:courts(name)")
        .eq("user_id", user!.id)
        .eq("status", "confirmed")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Total bookable courts across the platform (active courts).
  const { data: courtsCount } = useQuery({
    queryKey: ["dash-bookable-courts"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("courts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Points earned this week (from the ledger).
  const { data: weeklyPoints } = useQuery({
    queryKey: ["dash-weekly-points", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const { data, error } = await (supabase as any)
        .from("points_ledger")
        .select("delta_points")
        .eq("user_id", user!.id)
        .gte("created_at", monday.toISOString());
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Math.max(0, Number(r.delta_points) || 0), 0);
    },
  });

  const upcoming = (bookings ?? []) as any[];
  const bookableEvents = (allEvents ?? []).filter((e) => e.start_at && new Date(e.start_at).getTime() > Date.now());
  const shopItems = (marketItems ?? []).filter((m) => !!m.slug && m.status !== "draft");
  const nextReg = useMemo(
    () =>
      (myRegs ?? [])
        .filter((r) => r.event?.start_at && new Date(r.event.start_at).getTime() > Date.now())
        .sort((a, b) => new Date(a.event!.start_at!).getTime() - new Date(b.event!.start_at!).getTime())[0],
    [myRegs],
  );

  const now = new Date();
  const dateLabel = `${["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"][now.getDay()]}, ${now.getDate()}. ${MON[now.getMonth()]} ${now.getFullYear()}`;
  const memberSince = user?.created_at ? `Mitglied seit ${MON[new Date(user.created_at).getMonth()]} ${new Date(user.created_at).getFullYear()}` : "";

  const regCount = (myRegs ?? []).length;
  const quickAll: Array<{ icon: typeof CalendarCheck; label: string; sub: string; to: string; section: SectionKey; show: boolean }> = [
    { icon: CalendarCheck, label: "Meine Buchungen", sub: `${upcoming.length} anstehend`, to: "/account?tab=bookings", section: "booking", show: true },
    { icon: Trophy, label: "Events", sub: `${bookableEvents.length} Events · ${regCount} Anmeldung${regCount === 1 ? "" : "en"}`, to: "/dashboard/events", section: "events", show: canSee("events") },
    { icon: ShoppingBag, label: "Marketplace", sub: `${shopItems.length} Artikel im Shop`, to: "/marketplace", section: "market", show: canSee("marketplace") },
    { icon: UserIcon, label: "Mein Profil", sub: "Konto & Einstellungen", to: "/account", section: "profile", show: true },
  ];
  const quick = quickAll.filter((q) => q.show);

  return (
    <DashboardLayout>
      <Helmet><title>Mein P2G | PADEL2GO</title></Helmet>

      <main className="relative min-h-screen bg-background pb-16" style={sectionThemeVars(sectionColor)}>
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1] mx-auto max-w-[1200px] px-4 sm:px-5 pt-6 md:pt-8 flex flex-col gap-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex flex-col items-start gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />Mein P2G
              </span>
              <h1 className="font-display font-extrabold tracking-tight text-[clamp(30px,5vw,50px)] leading-[1.06]">
                Moin, <span className="text-gradient-acc">{userName}.</span>
              </h1>
              <p className="text-[15.5px] text-muted-foreground">{dateLabel} — bereit für dein nächstes Match?</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {memberSince && <span className="font-stat text-[11.5px] text-muted-foreground/70">{memberSince}</span>}
            </div>
          </motion.div>

          {/* Top: Points + Court CTA */}
          <div className="grid gap-5 lg:grid-cols-12 items-stretch">
            {/* Points card */}
            <div className="lg:col-span-5">
              <div className="h-full rounded-2xl border border-primary/25 bg-gradient-card p-6 flex flex-col gap-4 glow-lime">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-stat text-[11px] tracking-[0.18em] text-muted-foreground">
                    <Star className="w-3.5 h-3.5 text-primary" />P2G POINTS
                  </span>
                  {(weeklyPoints ?? 0) > 0 && (
                    <span className="font-stat text-[11.5px] text-primary bg-primary/[0.08] border border-primary/25 rounded-full px-2.5 py-1">
                      +{ptsFmt(weeklyPoints ?? 0)} P diese Woche
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-stat font-bold text-[clamp(48px,6.5vw,72px)] leading-none text-primary" style={{ textShadow: "0 0 40px rgba(199,240,17,0.4)" }}>
                    {ptsFmt(balance)}
                  </span>
                  <span className="text-[14.5px] text-muted-foreground">
                    ≈ {euroValue} Rabattwert <span className="text-muted-foreground/60">· Umrechenkurs {ptsFmt(pointsPerEuro)} P = €1,00</span>
                  </span>
                </div>
                <div className="flex gap-2.5 flex-wrap mt-auto">
                  <Button variant="lime" size="lg" asChild>
                    <Link to="/marketplace"><Gift className="w-4 h-4 mr-1" />Punkte einlösen</Link>
                  </Button>
                  <Button variant="outline" size="lg" asChild>
                    <Link to="/account?tab=p2g-points"><History className="w-4 h-4 mr-1" />Historie</Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Court CTA */}
            <div className="lg:col-span-7">
              <div className="relative h-full min-h-[300px] rounded-2xl overflow-hidden flex flex-col justify-end border border-border/60">
                <img src={courtHero} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(200deg, rgba(0,0,0,0.15), rgba(0,0,0,0.92) 80%)" }} />
                <span className="absolute top-[18px] left-[18px] inline-flex items-center gap-2 font-stat text-[11px] tracking-[0.14em] uppercase text-primary bg-black/60 backdrop-blur border border-primary/35 rounded-full px-3.5 py-1.5">
                  <span className="w-[7px] h-[7px] rounded-full bg-primary animate-pulse" />
                  {courtsCount ?? 0} Courts buchbar
                </span>
                <div className="relative flex flex-col items-start gap-3.5 p-[clamp(22px,3vw,30px)]">
                  <h2 className="font-display font-extrabold text-[clamp(26px,3.6vw,40px)] leading-[1.08] tracking-tight">
                    Zeit für dein<br />nächstes <span className="italic text-primary">Match?</span>
                  </h2>
                  <span className="inline-flex items-center gap-2 font-stat text-[12.5px] text-foreground/80">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    {courtsCount ?? 0} Courts an deinen Standorten verfügbar
                  </span>
                  <Button variant="hero" size="xl" asChild>
                    <Link to="/booking">🎾 Jetzt Court buchen</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick access */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {quick.map((q) => {
              const qColor = sectionThemes[q.section];
              return (
              <Link key={q.label} to={q.to}
                className="group flex items-center gap-3.5 rounded-2xl border border-border/70 bg-gradient-card px-4 py-4 transition-all"
                style={{ "--q": qColor } as React.CSSProperties}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${qColor}66`; e.currentTarget.style.boxShadow = `0 0 24px ${qColor}1F`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}>
                <span
                  className="w-11 h-11 flex-none rounded-[13px] border flex items-center justify-center"
                  style={{
                    color: qColor,
                    borderColor: `${qColor}59`,
                    background: `linear-gradient(135deg, ${qColor}2E, ${qColor}0A)`,
                  }}
                >
                  <q.icon className="w-5 h-5" />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-display font-bold text-[15px]">{q.label}</span>
                  <span className="font-stat text-[11.5px] text-muted-foreground truncate">{q.sub}</span>
                </span>
              </Link>
              );
            })}
          </div>

          {/* Bookings + Event teaser */}
          <div className="grid gap-5 lg:grid-cols-12 items-stretch">
            {/* Meine Buchungen */}
            <div className="lg:col-span-7">
              <div className="h-full rounded-2xl border border-border/60 bg-gradient-card p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display font-bold text-[21px] tracking-tight">Meine Buchungen</h3>
                  <Link to="/booking" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                    Neue Buchung<ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {upcoming.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-2.5">
                      {upcoming.slice(0, 3).map((b) => {
                        const d = new Date(b.start_time);
                        return (
                          <div key={b.id} className="flex items-center gap-4 bg-white/[0.03] border border-border/70 rounded-2xl px-3.5 py-3">
                            <span className="flex flex-col items-center gap-px w-[54px] flex-none bg-primary/[0.07] border border-primary/25 rounded-[13px] py-2">
                              <span className="font-stat font-bold text-[21px] leading-none text-primary">{format(d, "dd")}</span>
                              <span className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">{format(d, "MMM", { locale: de }).toUpperCase()}</span>
                            </span>
                            <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="font-semibold text-[15px] truncate">
                                {b.location?.name || "Court"}{b.court?.name ? ` · ${b.court.name}` : ""}
                              </span>
                              <span className="font-stat text-xs text-muted-foreground truncate">
                                {format(d, "EEEE", { locale: de })} · {format(d, "HH:mm")} – {format(new Date(b.end_time), "HH:mm")} Uhr
                              </span>
                            </span>
                            {(b.play_credits_awarded ?? 0) > 0 && (
                              <span className="hidden sm:inline-flex items-center gap-1.5 font-stat text-[11.5px] text-primary bg-primary/[0.08] border border-primary/25 rounded-full px-2.5 py-1 flex-none">
                                <Sparkles className="w-3 h-3" />+{b.play_credits_awarded} P
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground/70 mt-auto">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />Kostenlose Stornierung bis 24 h vor Spielbeginn
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3.5 text-center py-11 border border-dashed border-border/70 rounded-2xl">
                    <span className="w-[54px] h-[54px] rounded-2xl bg-primary/[0.07] border border-primary/25 flex items-center justify-center text-primary">
                      <CalendarPlus className="w-6 h-6" />
                    </span>
                    <span className="text-[15px] text-muted-foreground">Noch keine Buchungen — Zeit für dein erstes Match.</span>
                    <Button variant="lime" size="sm" asChild><Link to="/booking">Ersten Court buchen</Link></Button>
                  </div>
                )}
              </div>
            </div>

            {/* Event teaser */}
            <div className="lg:col-span-5">
              <div className="h-full rounded-2xl border border-border/60 bg-gradient-card overflow-hidden flex flex-col">
                {nextReg?.event ? (
                  <>
                    <div className="relative h-[168px] flex-none">
                      {nextReg.event.image_url && <StorageImage renderWidth={600} src={nextReg.event.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), #0a0a0a)" }} />
                      <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-black/70 backdrop-blur border border-primary/40 rounded-full px-3 py-1.5">Angemeldet</span>
                    </div>
                    <div className="flex flex-col gap-3 p-5 flex-1">
                      <span className="inline-flex items-center gap-2 font-stat text-[11px] tracking-[0.18em] text-primary">
                        <span className="w-[7px] h-[7px] rounded-full bg-primary animate-pulse" />DEIN NÄCHSTES EVENT
                      </span>
                      <h3 className="font-display font-extrabold text-[22px] leading-tight tracking-tight">{nextReg.event.title}</h3>
                      <div className="flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-2 font-stat text-[12.5px] text-foreground/75">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          {nextReg.event.start_at ? format(new Date(nextReg.event.start_at), "EEEE, d. MMMM · HH:mm", { locale: de }) + " Uhr" : ""}
                        </span>
                        <span className="inline-flex items-center gap-2 text-[13px] text-foreground/75">
                          <MapPin className="w-3.5 h-3.5 text-primary" />{nextReg.event.venue_name || nextReg.event.city}
                        </span>
                      </div>
                      <div className="h-px bg-border mt-auto" />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-[12.5px] text-muted-foreground">{Math.max(0, bookableEvents.length - 1)} weitere Events buchbar</span>
                        <Button variant="lime" size="sm" asChild><Link to="/dashboard/events">Zu den Events</Link></Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    className="relative flex flex-1 flex-col items-start justify-center gap-3 p-5"
                    style={{
                      // Violett der Events-Section statt des Lime der uebrigen
                      // Kacheln — nur hier, damit der Platzhalter als eigener
                      // Bereich lesbar ist und nicht wie eine leere Buchung wirkt.
                      background: `radial-gradient(120% 100% at 0% 0%, ${eventsColor}22, transparent 70%)`,
                    }}
                  >
                    <span
                      className="inline-flex items-center gap-2 font-stat text-[11px] tracking-[0.18em]"
                      style={{ color: eventsColor }}
                    >
                      <Trophy className="w-3.5 h-3.5" />EVENTS
                    </span>
                    <h3 className="font-display font-extrabold text-[22px] leading-tight tracking-tight">
                      {bookableEvents.length > 0 ? `${bookableEvents.length} Events buchbar` : "Bald neue Events"}
                    </h3>
                    <p className="text-[13.5px] text-muted-foreground">Sichere dir deinen Spot bei kommenden P2G Events.</p>
                    <Button
                      size="sm"
                      asChild
                      className="mt-1 font-semibold text-black hover:brightness-110"
                      style={{ backgroundColor: eventsColor }}
                    >
                      <Link to="/dashboard/events">Zu den Events</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Marketplace teaser */}
          {shopItems.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-gradient-card overflow-hidden grid lg:grid-cols-[5fr_7fr]">
              <div className="relative min-h-[240px] flex flex-col justify-end">
                {shopItems[0]?.image_url && <StorageImage renderWidth={600} src={shopItems[0].image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0" style={{ background: "linear-gradient(200deg, rgba(0,0,0,0.15), rgba(0,0,0,0.9) 82%)" }} />
                <div className="relative flex flex-col items-start gap-2.5 p-6">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary">Shop</span>
                  <h3 className="font-display font-extrabold text-[clamp(24px,3vw,32px)] leading-tight tracking-tight">P2G <span className="italic text-primary">Marketplace</span></h3>
                  <p className="text-sm text-foreground/75">Punkte einlösen, Gear shoppen — direkt aus deinem Konto.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 p-[clamp(20px,3vw,28px)]">
                {shopItems.slice(0, 3).map((m) => {
                  const price = m.price_cents ?? 0;
                  const maxDisc = pointsEnabled ? Math.floor(maxRedeemablePoints(price, balance, centsPerPoint, maxPercent) * centsPerPoint) : 0;
                  return (
                    <Link key={m.id} to={`/marketplace/${m.slug}`}
                      className="flex items-center gap-3.5 bg-white/[0.03] border border-border/70 rounded-[15px] px-3.5 py-3 transition-colors hover:border-primary/35">
                      <span className="w-[42px] h-[42px] flex-none rounded-xl overflow-hidden bg-primary/[0.1] border border-primary/25">
                        {m.image_url ? <StorageImage renderWidth={300} src={m.image_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-primary"><ShoppingBag className="w-5 h-5" /></span>}
                      </span>
                      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-semibold text-[14.5px] truncate">{m.name}</span>
                        <span className="font-stat text-xs text-muted-foreground">{eurFmt(price)}</span>
                      </span>
                      {maxDisc > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-stat text-[11.5px] font-bold text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1 flex-none whitespace-nowrap">
                          <Coins className="w-3 h-3" />bis −{eurFmt(maxDisc)}
                        </span>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-none" />
                      )}
                    </Link>
                  );
                })}
                <div className="flex items-center justify-between gap-3 flex-wrap mt-1.5">
                  <span className="font-stat text-[11.5px] text-muted-foreground">Dein Guthaben: {ptsFmt(balance)} P</span>
                  <Button variant="lime" size="sm" asChild><Link to="/marketplace">Zum Marketplace<ArrowRight className="w-3.5 h-3.5 ml-1" /></Link></Button>
                </div>
              </div>
            </div>
          )}

          {/* Liga teaser */}
          <div className="relative min-h-[150px] rounded-2xl overflow-hidden flex items-center border border-border/60">
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/40" />
            <div className="relative flex items-center justify-between gap-5 flex-wrap p-[clamp(20px,3vw,28px)] w-full">
              <div className="flex flex-col items-start gap-2.5">
                <span className="inline-flex items-center rounded-full border border-border bg-white/[0.05] px-3 py-1 text-xs font-semibold text-muted-foreground">Coming Soon</span>
                <h3 className="font-display font-extrabold text-[clamp(21px,2.8vw,27px)] leading-tight tracking-tight">
                  P2G Liga: Von <span className="text-primary">Beginner</span> bis <span className="italic text-primary">Legend.</span>
                </h3>
                <span className="font-stat text-xs text-muted-foreground">EU-weites Ranking · in Kürze</span>
              </div>
              <Button variant="heroOutline" size="lg" asChild><Link to="/fuer-spieler">Mehr erfahren</Link></Button>
            </div>
          </div>

          {/* News */}
          {(articles?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div className="flex flex-col items-start gap-2.5">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary">News</span>
                  <h2 className="font-display font-extrabold text-[clamp(26px,3.8vw,38px)] leading-tight tracking-tight">
                    Aktuelles aus der <span className="text-gradient-acc">P2G-Welt</span>
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
                {(articles ?? []).slice(0, 3).map((a, i) => (
                  <NewsCard key={a.id} article={a} index={i} />
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Link
                  to="/news"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-6 py-3 text-[15px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Alle News ansehen <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
};




export default DashboardHome;
