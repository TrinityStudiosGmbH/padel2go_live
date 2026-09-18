import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { NavLink, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Clock,
  CreditCard,
  AlertCircle,
  Timer,
  Coins,
  Gift,
  Users,
  Ticket,
  Check,
  X,
  Mail,
  PencilLine,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { useBookingCheckout } from "@/hooks/useBookingCheckout";
import { format, differenceInMinutes } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { formatPrice, applyVoucherDiscount } from "@/lib/pricing";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const BookingCheckout = () => {
  const sectionColor = useSectionTheme("booking");
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("booking");
  const dateLocale = i18n.language === "en" ? enUS : de;
  const {
    booking,
    state,
    error,
    timeLeft,
    stripeUrl,
    rewardsEstimate,
    voucher,
    setVoucherCode,
    validateVoucher,
    clearVoucher,
    isGuest,
    handlePayment,
    formatTimeLeft,
    memberQuota,
    claimingQuota,
    useMemberQuotaForBooking,
  } = useBookingCheckout();

  // Gutschein-Feld standardmäßig offen, damit es in der Bezahlmaske sofort sichtbar ist.
  const [voucherOpen, setVoucherOpen] = useState(true);

  if (state === "loading") {
    return (
      <>
        <Navigation />
        <main
          className="min-h-screen bg-background pt-16 md:pt-20"
          style={sectionThemeVars(sectionColor)}
        >
          <BookingStepper currentStep={2} />
          <div className="flex items-center justify-center py-40">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </>
    );
  }

  if (state === "error" || state === "expired" || !booking) {
    return (
      <>
        <Navigation />
        <main
          className="relative min-h-screen bg-background pt-16 md:pt-20"
          style={sectionThemeVars(sectionColor)}
        >
          <SectionShaderBackdrop color={sectionColor} />
          <div className="relative z-[1]">
          <BookingStepper currentStep={2} />
          <section className="pt-8 md:pt-10 pb-24 px-5">
            <div className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-gradient-card p-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10">
                  <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <h1 className="text-xl font-bold tracking-tight mb-2">{t("common.errorTitle")}</h1>
                <p className="text-muted-foreground mb-6">{error || t("common.bookingNotFound")}</p>
                <Button asChild variant="hero" size="lg">
                  <NavLink to="/booking">{t("common.backToBooking")}</NavLink>
                </Button>
              </div>
            </div>
          </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const startTime = new Date(booking.start_time);
  const endTime = new Date(booking.end_time);
  const durationMinutes = differenceInMinutes(endTime, startTime);
  const isVoucherApplied = voucher.status === "valid";
  const priceAfterVoucher = isVoucherApplied
    ? applyVoucherDiscount(booking.price_cents, voucher.discountType, voucher.discountValue)
    : booking.price_cents;
  // Court bookings are money-only — P2G points cannot discount a booking. The price
  // is the (optionally voucher-reduced) court price; only a genuinely 0-price booking
  // or a fully-free voucher is free.
  const effectivePrice = priceAfterVoucher;
  const isFullyFree = effectivePrice === 0;
  const detailPath = booking.location?.slug ? `/booking/locations/${booking.location.slug}` : undefined;

  // Vereinskondition: booking.price_cents ist bereits der Mitgliederpreis, der
  // Externenpreis ergibt sich aus Preis + gewährtem Abzug.
  const memberDiscount = booking.member_discount_cents ?? 0;
  const basePrice = booking.price_cents + memberDiscount;
  const isQuotaBooking = booking.is_free_allocation === true;
  // Kontingent anbieten, solange die Buchung noch etwas kostet und beide Töpfe reichen.
  const canUseQuota =
    !isGuest &&
    !isQuotaBooking &&
    !!memberQuota?.quotaEnabled &&
    booking.price_cents > 0 &&
    memberQuota.clubRemaining >= durationMinutes &&
    memberQuota.memberRemaining >= durationMinutes;

  return (
    <>
      <Helmet>
        <title>{t("meta.checkout.title")}</title>
        <meta name="description" content={t("meta.checkout.description")} />
      </Helmet>

      <Navigation />

      <main
        className="relative min-h-screen bg-background pt-16 md:pt-20"
        style={sectionThemeVars(sectionColor)}
      >
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        <BookingStepper currentStep={2} detailPath={detailPath} />

        <section className="pt-8 md:pt-10 pb-24 px-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-[1040px] flex flex-col gap-[18px]"
          >
            {/* Back button */}
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-[7px] self-start py-1.5 text-sm text-[hsl(0_0%_60%)] hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("common.back")}
            </button>

            {/* Heading */}
            <div className="flex flex-col gap-2">
              <h1 className="font-black tracking-tight text-[clamp(26px,4vw,38px)] text-foreground">
                Fast geschafft!
              </h1>
              <p className="text-[15.5px] text-[hsl(0_0%_60%)]">
                Prüfe deine Buchung und bezahle sicher über Stripe.
              </p>
            </div>

            {/* Reservation Timer */}
            {timeLeft !== null && timeLeft > 0 && (
              <div className="rounded-[18px] border border-primary/30 bg-gradient-card p-[16px_18px]">
                <div className="flex items-center gap-[13px]">
                  <span className="flex-none w-10 h-10 rounded-xl flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.04))]">
                    <Timer className="w-[19px] h-[19px]" />
                  </span>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-bold text-foreground">
                      Dein Slot ist für dich reserviert
                    </span>
                    <span className="text-[12.5px] text-[hsl(0_0%_55%)]">
                      {t("checkout.reservationExpires", { time: formatTimeLeft(timeLeft) })}
                    </span>
                  </div>
                  <span className="font-stat font-bold text-2xl text-primary flex-none">
                    {formatTimeLeft(timeLeft)}
                  </span>
                </div>
              </div>
            )}

            {/* Checkout grid */}
            <div className="grid gap-4 items-start lg:grid-cols-[1.35fr_1fr]">
              {/* Left column */}
              <div className="flex flex-col gap-4 min-w-0">
                {/* Summary card */}
                <div className="rounded-2xl border border-border/60 bg-gradient-card p-[22px]">
                  <div className="flex flex-col gap-[14px]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[17px] font-bold tracking-tight text-foreground">
                        Zusammenfassung
                      </h3>
                      <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:opacity-80 transition-opacity"
                      >
                        <PencilLine className="w-[13px] h-[13px]" />
                        Ändern
                      </button>
                    </div>
                    <div className="flex gap-[14px] items-center">
                      <span className="flex-none w-[76px] h-[76px] rounded-xl flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.04))]">
                        <MapPin className="w-6 h-6" />
                      </span>
                      <div className="flex flex-col gap-[3px] min-w-0">
                        <span className="text-base font-bold tracking-tight text-foreground truncate">
                          {booking.location?.name}
                        </span>
                        <span className="text-[13px] text-[hsl(0_0%_60%)] truncate">
                          {booking.court?.name}
                          {booking.location?.address && ` · ${booking.location.address}`}
                        </span>
                        <span className="font-stat text-[12.5px] text-primary">
                          {format(startTime, t("checkout.dateFormat"), { locale: dateLocale })} · {format(startTime, "HH:mm")}–{format(endTime, "HH:mm")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-[hsl(0_0%_80%)]">
                      <Clock className="w-4 h-4 flex-none text-[hsl(0_0%_55%)]" />
                      <span>{t("checkout.minutes", { count: durationMinutes })}</span>
                    </div>

                    {/* Guest info row */}
                    {isGuest && booking?.guest_name && (
                      <div className="rounded-xl border border-[hsl(0_0%_13%)] bg-white/[0.03] px-[13px] py-[11px] space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("checkout.guestLabel")}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4 text-primary" />
                          <span>{booking.guest_name}</span>
                        </div>
                        {booking.guest_email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-4 h-4" />
                            <span>{booking.guest_email}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Voucher card */}
                <div className="rounded-2xl border border-border/60 bg-gradient-card p-[22px]">
                  <Collapsible open={voucherOpen || isVoucherApplied} onOpenChange={setVoucherOpen}>
                    <CollapsibleTrigger asChild>
                      <button
                        className="flex items-center gap-3 w-full text-left disabled:cursor-default"
                        disabled={isVoucherApplied}
                      >
                        <span className="flex-none w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-primary border border-primary/35 bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.04))]">
                          <Ticket className="w-[17px] h-[17px]" />
                        </span>
                        <span className="flex-1 text-[14.5px] font-bold text-foreground">
                          {isVoucherApplied
                            ? t("checkout.voucherAppliedLabel", { discount: voucher.discountLabel })
                            : t("checkout.voucherEnterLabel")}
                        </span>
                        {!isVoucherApplied && (
                          voucherOpen ? (
                            <ChevronUp className="w-[17px] h-[17px] text-[hsl(0_0%_50%)]" />
                          ) : (
                            <ChevronDown className="w-[17px] h-[17px] text-[hsl(0_0%_50%)]" />
                          )
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-[14px] space-y-2">
                        {isVoucherApplied ? (
                          <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.08] px-[14px] py-[11px]">
                            <Check className="w-4 h-4 text-primary" />
                            <span className="flex-1 font-stat text-[13px] font-bold text-primary">
                              {t("checkout.voucherRedeemedText", { code: voucher.code, discount: voucher.discountLabel })}
                            </span>
                            <button
                              className="flex-none text-[hsl(0_0%_55%)] hover:text-foreground transition-colors p-0.5"
                              onClick={clearVoucher}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2.5">
                            <Input
                              placeholder={t("checkout.voucherPlaceholder")}
                              value={voucher.code}
                              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                              className="font-stat"
                              onKeyDown={(e) => e.key === "Enter" && validateVoucher()}
                            />
                            <Button
                              variant="outline"
                              onClick={validateVoucher}
                              disabled={!voucher.code.trim() || voucher.status === "validating"}
                            >
                              {voucher.status === "validating" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                t("checkout.voucherRedeemButton")
                              )}
                            </Button>
                          </div>
                        )}
                        {voucher.status === "invalid" && voucher.errorMessage && (
                          <p className="text-sm text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {voucher.errorMessage}
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Payment methods (informational) */}
                {!isFullyFree && (
                  <div className="rounded-2xl border border-border/60 bg-gradient-card p-[22px]">
                    <div className="flex flex-col gap-[14px]">
                      <h3 className="text-[17px] font-bold tracking-tight text-foreground">Zahlungsart</h3>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="flex items-center gap-3 rounded-[14px] border border-[hsl(0_0%_15%)] bg-white/[0.03] px-[15px] py-[14px]">
                          <span className="flex-none w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-primary border border-primary/40 bg-primary/[0.14]">
                            <CreditCard className="w-[19px] h-[19px]" />
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[14.5px] font-bold text-foreground">{t("checkout.paymentMethods.card")}</span>
                            <span className="text-xs text-[hsl(0_0%_55%)]">Visa · Mastercard · Amex</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-[14px] border border-[hsl(0_0%_15%)] bg-white/[0.03] px-[15px] py-[14px]">
                          <span className="flex-none w-[38px] h-[38px] rounded-[11px] flex items-center justify-center border border-[#003087]/30 bg-[#003087]/10">
                            <span className="text-xs font-bold text-[#009cde]">Pay</span>
                            <span className="text-xs font-bold text-[#003087]">Pal</span>
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[14.5px] font-bold text-foreground">PayPal</span>
                            <span className="text-xs text-[hsl(0_0%_55%)]">Stripe · SSL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right column (sticky) */}
              <div className="flex flex-col gap-4 lg:sticky lg:top-[90px]">
                <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
                  <div className="flex flex-col gap-[13px]">
                    <h3 className="text-[17px] font-bold tracking-tight text-foreground">
                      {t("checkout.price.totalCourtLabel")}
                    </h3>

                    {/* Base price — bei Mitgliedern der Externenpreis vor Kondition */}
                    <div className="flex justify-between text-[13.5px] text-[hsl(0_0%_60%)]">
                      <span className="min-w-0 truncate pr-3">{booking.court?.name}</span>
                      <span className="font-stat flex-none">{formatPrice(basePrice, booking.currency)}</span>
                    </div>

                    {/* Vereinskondition */}
                    {memberDiscount > 0 && (
                      <div className="flex justify-between text-[13.5px] text-primary">
                        <span className="inline-flex items-center gap-1.5 min-w-0 pr-3">
                          <Users className="w-[13px] h-[13px] flex-none" />
                          <span className="truncate">
                            {booking.member_scope === "home" ? "Mitgliederpreis" : "Vereinsrabatt"}
                          </span>
                        </span>
                        <span className="font-stat flex-none">
                          −{formatPrice(memberDiscount, booking.currency)}
                        </span>
                      </div>
                    )}

                    {/* Freikontingent verbraucht */}
                    {isQuotaBooking && (
                      <div className="flex justify-between text-[13.5px] text-primary">
                        <span className="inline-flex items-center gap-1.5 min-w-0 pr-3">
                          <Users className="w-[13px] h-[13px] flex-none" />
                          <span className="truncate">
                            Freikontingent{memberQuota?.clubName ? ` · ${memberQuota.clubName}` : ""}
                          </span>
                        </span>
                        <span className="font-stat flex-none">{durationMinutes} Min</span>
                      </div>
                    )}

                    {/* Voucher discount */}
                    {isVoucherApplied && (
                      <div className="flex justify-between text-[13.5px] text-primary">
                        <span className="inline-flex items-center gap-1.5 min-w-0 pr-3">
                          <Ticket className="w-[13px] h-[13px] flex-none" />
                          <span className="truncate">{voucher.discountLabel}</span>
                        </span>
                        <span className="font-stat flex-none">
                          −{formatPrice(booking.price_cents - effectivePrice, booking.currency)}
                        </span>
                      </div>
                    )}

                    <div className="h-px bg-border" />

                    {/* Total */}
                    <div className="flex justify-between items-baseline">
                      <span className="text-[14.5px] font-bold text-foreground">
                        {t("checkout.price.totalLabel")}
                      </span>
                      <span className="flex flex-col items-end">
                        <span className="font-stat font-bold text-3xl leading-tight text-primary">
                          {isFullyFree ? t("checkout.price.freePrice") : formatPrice(effectivePrice, booking.currency)}
                        </span>
                        <span className="text-[11px] text-[hsl(0_0%_50%)]">inkl. MwSt.</span>
                      </span>
                    </div>

                    {/* Freikontingent des Vereins — bewusste Entscheidung, kein Automatismus */}
                    {canUseQuota && memberQuota && (
                      <div className="rounded-[14px] border border-primary/25 bg-primary/[0.06] px-[14px] py-[13px] flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <Users className="h-[19px] w-[19px] text-primary flex-none" />
                          <span className="font-semibold text-primary text-sm">
                            Freikontingent {memberQuota.clubName}
                          </span>
                        </div>
                        <span className="text-[12.5px] leading-[1.5] text-[hsl(0_0%_58%)]">
                          Verein: noch {memberQuota.clubRemaining} Min auf diesem Court · dein Anteil:
                          noch {memberQuota.memberRemaining} Min diesen Monat.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={claimingQuota}
                          onClick={() => useMemberQuotaForBooking()}
                          className="border-primary/40 text-primary hover:bg-primary/10"
                        >
                          {claimingQuota ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            `Kontingent nutzen (${durationMinutes} Min · 0 €)`
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Punkte-Vorschau. Nur wenn am Ende wirklich Geld fliesst —
                        bei 0 EUR (Gutschein, Freikontingent, voll mit Punkten
                        bezahlt) gibt es keine Punkte, und die Vorschau darf
                        nichts versprechen, was danach nicht ankommt. */}
                    {!isGuest && !isVoucherApplied && !isFullyFree && !isQuotaBooking &&
                      rewardsEstimate && rewardsEstimate.total_points > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[14px] border border-primary/25 bg-primary/[0.07] px-[14px] py-[13px]"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <Coins className="h-[19px] w-[19px] text-primary flex-none" />
                          <span className="font-semibold text-primary text-sm">
                            {t("checkout.rewards.earnHeading")}
                          </span>
                        </div>
                        <div className="space-y-1.5 text-[13px]">
                          {rewardsEstimate.breakdown.map((item) => (
                            <div key={item.key} className="flex justify-between items-center">
                              <span className="text-[hsl(0_0%_70%)]">
                                {item.title}
                                {item.description && (
                                  <span className="text-xs ml-1 opacity-70">({item.description})</span>
                                )}
                              </span>
                              <span className="font-stat text-primary font-medium">+{item.points}</span>
                            </div>
                          ))}
                          <div className="border-t border-primary/20 pt-2 mt-2 flex justify-between items-center font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Gift className="h-4 w-4 text-primary" />
                              {t("checkout.rewards.totalLabel")}
                            </span>
                            <span className="font-stat text-primary">+{rewardsEstimate.total_points}</span>
                          </div>
                        </div>
                        {rewardsEstimate.disclaimers.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-3">
                            {rewardsEstimate.disclaimers[0]}
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* Guest upsell */}
                    {isGuest && (
                      <div className="rounded-[14px] border border-[hsl(0_0%_14%)] bg-white/[0.03] px-[14px] py-[13px] flex items-start gap-3">
                        <Gift className="w-[18px] h-[18px] text-primary shrink-0 mt-0.5" />
                        <div className="text-[12.5px] leading-relaxed text-[hsl(0_0%_65%)]">
                          <p className="font-semibold text-foreground mb-0.5">{t("checkout.guestUpsell.title")}</p>
                          <p>
                            {t("checkout.guestUpsell.body")}{" "}
                            <NavLink to="/auth" className="font-bold text-primary underline hover:no-underline">{t("checkout.guestUpsell.cta")}</NavLink>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Pay button */}
                    <Button
                      variant="hero"
                      size="xl"
                      className="w-full"
                      onClick={() => handlePayment()}
                      disabled={state === "processing" || (timeLeft !== null && timeLeft === 0)}
                    >
                      {state === "processing" ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {isFullyFree ? t("checkout.pay.confirming") : t("checkout.pay.redirecting")}
                        </>
                      ) : isFullyFree ? (
                        <>
                          <Ticket className="w-4 h-4 mr-2" />
                          {t("checkout.pay.bookFree")}
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {isVoucherApplied
                            ? t("checkout.pay.voucherTemplate", {
                                discount: voucher.discountLabel,
                                amount: formatPrice(effectivePrice, booking.currency),
                              })
                            : t("checkout.pay.payNow")
                          }
                        </>
                      )}
                    </Button>

                    {/* Fallback link */}
                    {stripeUrl && !isFullyFree && (
                      <div className="text-center space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {t("checkout.fallback.info")}
                        </p>
                        <a
                          href={stripeUrl}
                          className="text-primary underline hover:no-underline text-sm font-medium"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("checkout.fallback.link")}
                        </a>
                      </div>
                    )}

                    {/* Secure hint */}
                    <span className="inline-flex items-center justify-center gap-[7px] text-xs text-[hsl(0_0%_50%)]">
                      <ShieldCheck className="w-[13px] h-[13px]" />
                      {isFullyFree
                        ? t("checkout.footnote.free")
                        : t("checkout.footnote.secure")}
                    </span>

                    <p className="text-xs text-center text-muted-foreground/70">
                      {t("checkout.legal.intro")}
                      <NavLink to="/agb" className="underline hover:no-underline">
                        {t("checkout.legal.tos")}
                      </NavLink>
                      {t("checkout.legal.and")}
                      <NavLink to="/datenschutz" className="underline hover:no-underline">
                        {t("checkout.legal.privacy")}
                      </NavLink>
                      {t("checkout.legal.outro")}
                    </p>
                    <p className="text-xs text-center text-muted-foreground/70">
                      {t("checkout.legal.cancellation")}
                    </p>
                    <p className="text-xs text-center text-muted-foreground/70">
                      {t("checkout.legal.withdrawal")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default BookingCheckout;
