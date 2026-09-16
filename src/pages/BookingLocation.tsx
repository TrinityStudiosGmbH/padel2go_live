import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import Navigation from "@/components/Navigation";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, EyeOff } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { BookingLocationHeader } from "@/components/booking/BookingLocationHeader";
import { BookingSlotPicker } from "@/components/booking/BookingSlotPicker";
import { BookingSummary } from "@/components/booking/BookingSummary";
import { BookingTennisTeaser } from "@/components/booking/BookingTennisTeaser";
import { BookingWhatsAppTeaser } from "@/components/booking/BookingWhatsAppTeaser";
import { GuestCheckoutModal } from "@/components/booking/GuestCheckoutModal";
import { useBookingLocation } from "@/hooks/useBookingLocation";
import { useCourtsVisibility } from "@/hooks/useCourtsVisibility";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

const BookingLocation = () => {
  const sectionColor = useSectionTheme("booking");
  const { t } = useTranslation("booking");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { canSeeCourts, publicEnabled, isAdmin, loading: visibilityLoading } = useCourtsVisibility();
  const { canSee } = useFeatureToggles();


  const {
    location,
    courts,
    visibleCourts,
    availableSports,
    hasTennisCourts,
    selectedSport,
    loading,
    selectedDate,
    selectedCourt,
    selectedSlot,
    selectedDuration,
    booking,
    availableSlots,
    loadingSlots,
    priceCents,
    hasPrices,
    courtPrices,
    ratesByStart,
    user,
    lobbyEnabled,
    lobbySettings,
    showGuestModal,
    guestBookingInProgress,
    setSelectedDate,
    setSelectedCourt,
    setSelectedSlot,
    setSelectedDuration,
    setLobbyEnabled,
    setLobbySettings,
    setShowGuestModal,
    changeSport,
    handleBooking,
    handleGuestBooking,
  } = useBookingLocation(slug);

  if (loading || visibilityLoading) {
    return (
      <>
        <Navigation />
        <main
          className="min-h-screen bg-background pt-24 flex items-center justify-center"
          style={sectionThemeVars(sectionColor)}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </>
    );
  }

  if (!canSeeCourts) {
    return (
      <>
        <Navigation />
        <main
          className="relative min-h-screen bg-background pt-24 pb-12"
          style={sectionThemeVars(sectionColor)}
        >
          <SectionShaderBackdrop color={sectionColor} />
          <div className="relative z-[1] container mx-auto px-4 max-w-md text-center py-20">
            <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-4">
              <EyeOff className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t("common.comingSoonTitle")}</h1>
            <p className="text-muted-foreground mb-6">
              {t("location.comingSoonDescription")}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>{t("common.backToHome")}</Button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!location) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>{`${location.name} | ${t("meta.location.titleSuffix")}`}</title>
        <meta name="description" content={t("meta.location.descriptionTemplate", { name: location.name })} />
      </Helmet>

      <Navigation />

      <main
        className="relative min-h-screen bg-background pt-16 md:pt-20"
        style={sectionThemeVars(sectionColor)}
      >
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        <BookingStepper currentStep={1} detailPath={`/booking/locations/${slug}`} />

        <section className="pt-8 md:pt-10 pb-24 px-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-[1200px] flex flex-col gap-5"
          >
            <Button
              variant="ghost"
              onClick={() => navigate("/booking")}
              className="self-start px-0 h-auto py-1.5 text-[hsl(0_0%_60%)] hover:bg-transparent hover:text-primary"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {t("location.back")}
            </Button>

            {isAdmin && !publicEnabled && (
              <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 flex items-start gap-3">
                <EyeOff className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{t("common.adminPreviewLabel")}</p>
                  <p className="text-muted-foreground">
                    {t("location.adminPreviewDescription")}
                  </p>
                </div>
              </div>
            )}

            <BookingLocationHeader location={location} sport={selectedSport} />

            {location.whatsapp_group_url && (
              <BookingWhatsAppTeaser locationName={location.name} href={location.whatsapp_group_url} />
            )}

            <div
              id="bk-detail"
              className="grid gap-5 items-start min-[980px]:grid-cols-[minmax(0,1fr)_384px]"
            >
              <div className="flex min-w-0 flex-col gap-4">
                <BookingSlotPicker
                  courts={visibleCourts}
                  sport={selectedSport}
                  availableSports={availableSports}
                  onSportChange={changeSport}
                  selectedCourt={selectedCourt}
                  setSelectedCourt={setSelectedCourt}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedDuration={selectedDuration}
                  setSelectedDuration={setSelectedDuration}
                  selectedSlot={selectedSlot}
                  setSelectedSlot={setSelectedSlot}
                  availableSlots={availableSlots}
                  loadingSlots={loadingSlots}
                  courtPrices={courtPrices}
                  ratesByStart={ratesByStart}
                />

                {hasTennisCourts && selectedSport === "padel" && (
                  <BookingTennisTeaser
                    vendingEnabled={location.vending_enabled}
                    onShowTennis={() => changeSport("tennis")}
                  />
                )}
              </div>

              <BookingSummary
                location={location}
                courts={courts}
                selectedCourt={selectedCourt}
                selectedDate={selectedDate}
                selectedDuration={selectedDuration}
                selectedSlot={selectedSlot}
                booking={booking}
                user={user}
                onBook={handleBooking}
                priceCents={priceCents}
                hasPrices={hasPrices}
                lobbyEnabled={lobbyEnabled}
                onLobbyEnabledChange={setLobbyEnabled}
                lobbySettings={lobbySettings}
                onLobbySettingsChange={setLobbySettings}
                lobbiesFeatureEnabled={canSee("lobbies")}
              />
            </div>
          </motion.div>
        </section>
        </div>
      </main>

      <Footer />

      <GuestCheckoutModal
        open={showGuestModal}
        onOpenChange={setShowGuestModal}
        onConfirm={handleGuestBooking}
        isSubmitting={guestBookingInProgress}
        locationSlug={slug ?? ""}
      />
    </>
  );
};

export default BookingLocation;
