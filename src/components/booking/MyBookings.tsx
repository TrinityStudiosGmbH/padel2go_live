import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Loader2, 
  ChevronDown,
  X,
  CheckCircle,
  AlertCircle,
  CalendarX,
  CreditCard,
  Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCancelBooking } from "@/hooks/useCancelBooking";
import { format, isPast } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { formatPrice } from "@/lib/pricing";
import { LobbyActionButton } from "@/components/lobby";

const useCountdown = (targetDate: string | null) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) { setIsExpired(false); setTimeLeft(""); return; }

    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setIsExpired(true); setTimeLeft("00:00"); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      setIsExpired(false);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return { timeLeft, isExpired };
};

interface Booking {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  price_cents: number | null;
  currency: string | null;
  created_at: string;
  cancelled_at: string | null;
  hold_expires_at: string | null;
  location_id: string;
  court_id: string;
  location: {
    name: string;
    slug: string;
  };
  court: {
    name: string;
  };
}

export const MyBookings = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("booking");
  const dateLocale = i18n.language === "en" ? enUS : de;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const cancelBooking = useCancelBooking();

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  const fetchBookings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          start_time,
          end_time,
          status,
          price_cents,
          currency,
          created_at,
          cancelled_at,
          hold_expires_at,
          location_id,
          court_id,
          location:locations(name, slug),
          court:courts(name)
        `)
        .eq("user_id", user.id)
        .order("start_time", { ascending: false });

      if (error) throw error;

      // Type cast the data
      const typedBookings = (data || []).map(b => ({
        ...b,
        location: b.location as unknown as { name: string; slug: string },
        court: b.court as unknown as { name: string },
      }));

      setBookings(typedBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Only show pending_payment if hold hasn't expired yet
  const pendingPaymentBookings = bookings.filter(
    b => b.status === "pending_payment" 
      && !isPast(new Date(b.start_time))
      && (!b.hold_expires_at || new Date(b.hold_expires_at) > new Date())
  );
  const upcomingBookings = bookings.filter(
    b => b.status === "confirmed" && !isPast(new Date(b.start_time))
  );
  const pastBookings = bookings.filter(b => {
    // Cancelled bookings are hidden entirely.
    if (b.status === "cancelled") return false;

    // Completed confirmed bookings: always show
    if (b.status === "confirmed" && isPast(new Date(b.start_time))) {
      return true;
    }

    // Expired: only show if < 30 min since creation
    if (b.status === "expired") {
      const relevantTime = b.cancelled_at
        ? new Date(b.cancelled_at)
        : new Date(b.created_at);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      return relevantTime > thirtyMinutesAgo;
    }

    return false;
  });

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-4"
      >
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" /> {t("myBookings.title")}
        </h2>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {bookings.length === 0 ? (
              <div className="text-center py-8">
                <CalendarX className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">{t("myBookings.empty")}</p>
                <Button variant="lime" asChild>
                  <NavLink to="/booking">{t("myBookings.bookNowCta")}</NavLink>
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Pending Payment Bookings */}
                {pendingPaymentBookings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {t("myBookings.pendingHeading")}
                    </h3>
                    <div className="space-y-3">
                      {pendingPaymentBookings.map((booking) => (
                        <PendingPaymentCard key={booking.id} booking={booking} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Bookings */}
                {upcomingBookings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {t("myBookings.upcomingHeading")}
                    </h3>
                    <div className="space-y-3">
                      {upcomingBookings.map((booking) => (
                        <motion.div
                          key={booking.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="rounded-2xl p-4 border border-border/60 bg-gradient-card"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="font-bold tracking-tight">{booking.location?.name}</p>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                  <CheckCircle className="w-3 h-3" />
                                  {t("myBookings.statusConfirmed")}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {booking.court?.name}
                              </p>
                              <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4 text-primary" />
                                  <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "dd.MM.yyyy", { locale: dateLocale })}</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-4 h-4 text-primary" />
                                  <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "HH:mm")} - {format(new Date(booking.end_time), "HH:mm")}{t("myBookings.timeSuffix")}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                              <LobbyActionButton
                                booking={{
                                  id: booking.id,
                                  location_id: booking.location_id,
                                  court_id: booking.court_id,
                                  start_time: booking.start_time,
                                  end_time: booking.end_time,
                                  price_cents: booking.price_cents || 0,
                                  location_name: booking.location?.name,
                                  court_name: booking.court?.name,
                                }}
                                variant="lime"
                              />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={cancelBooking.isPending}
                                  >
                                    {cancelBooking.isPending && cancelBooking.variables === booking.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <X className="w-4 h-4" />
                                    )}
                                    <span className="ml-1 hidden sm:inline">{t("myBookings.cancel")}</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t("myBookings.cancelConfirmTitle")}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t("myBookings.cancelConfirmDesc")}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("myBookings.cancelConfirmAbort")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => cancelBooking.mutate(booking.id, { onSuccess: () => fetchBookings() })}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {t("myBookings.cancel")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          {/* Nur bezahlte Buchungen haben einen Beleg. Freistunden
                              und Vereinskontingente erzeugen keinen. */}
                          {(booking.price_cents ?? 0) > 0 && (
                            <div className="mt-3 border-t border-border/50 pt-3">
                              <InvoiceDownloadButton
                                sourceId={booking.id}
                                receiptType="booking"
                                className="gap-1.5"
                              />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Past/Cancelled Bookings */}
                {pastBookings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {t("myBookings.pastHeading")}
                    </h3>
                    <div className="space-y-3">
                      {pastBookings.slice(0, 5).map((booking) => (
                        <div
                          key={booking.id}
                          className="rounded-2xl p-4 border border-border/60 bg-gradient-card opacity-60"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="font-bold tracking-tight">{booking.location?.name}</p>
                                {booking.status === "cancelled" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                                    <AlertCircle className="w-3 h-3" />
                                    {t("myBookings.statusCancelled")}
                                  </span>
                                ) : booking.status === "expired" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                                    <Timer className="w-3 h-3" />
                                    {t("myBookings.statusExpired")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                                    {t("myBookings.statusCompleted")}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4 text-primary" />
                                  <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "dd.MM.yyyy", { locale: dateLocale })}</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-4 h-4 text-primary" />
                                  <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "HH:mm")}{t("myBookings.timeSuffix")}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                          {(booking.price_cents ?? 0) > 0 && booking.status !== "expired" && (
                            <div className="mt-3 border-t border-border/50 pt-3">
                              <InvoiceDownloadButton
                                sourceId={booking.id}
                                receiptType="booking"
                                className="gap-1.5"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Book More CTA */}
                <div className="pt-4 border-t border-border">
                  <Button variant="outline" className="w-full" asChild>
                    <NavLink to="/booking">
                      <Calendar className="w-4 h-4 mr-2" />
                      {t("myBookings.bookNewCta")}
                    </NavLink>
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const PendingPaymentCard = ({ booking }: { booking: Booking }) => {
  const { t, i18n } = useTranslation("booking");
  const dateLocale = i18n.language === "en" ? enUS : de;
  const { timeLeft, isExpired } = useCountdown(booking.hold_expires_at);

  if (isExpired) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-2xl p-4 border border-amber-500/30 bg-amber-500/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="font-bold tracking-tight">{booking.location?.name}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
              <Timer className="w-3 h-3" />
              {t("myBookings.pendingHeading")}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-muted-foreground">
              {booking.court?.name}
            </p>
            {booking.price_cents && (
              <span className="font-stat text-xs font-semibold text-primary">
                {formatPrice(booking.price_cents, booking.currency || 'EUR')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "dd.MM.yyyy", { locale: dateLocale })}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              <span className="font-stat text-[12.5px]">{format(new Date(booking.start_time), "HH:mm")} - {format(new Date(booking.end_time), "HH:mm")}{t("myBookings.timeSuffix")}</span>
            </span>
          </div>
          {timeLeft && (
            <p className="mt-2 text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <Timer className="w-3 h-3" />
              <span className="font-stat">{t("myBookings.reservedRemaining", { time: timeLeft })}</span>
            </p>
          )}
        </div>
        <Button
          variant="lime"
          size="sm"
          asChild
        >
          <NavLink to={`/booking/checkout?booking_id=${booking.id}`}>
            <CreditCard className="w-4 h-4 mr-1" />
            {t("myBookings.payNow")}
          </NavLink>
        </Button>
      </div>
    </motion.div>
  );
};
