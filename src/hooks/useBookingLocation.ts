import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { setHours, setMinutes, addMinutes } from "date-fns";
import { useBookingSlots } from "@/hooks/useBookingSlots";
import { useCourtBasePrices, getPriceFromList, useResolvedBookingRates, getRateForStart } from "@/hooks/useCourtPrices";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";
import type { Court, CourtSport, TimeSlot } from "@/components/booking/types";
import { DEFAULT_COURT_SPORT, TENNIS_DURATION_MINUTES, courtSport } from "@/components/booking/types";
import type { DbLocation } from "@/types/database";
import type { LobbySettings } from "@/types/lobby";
import { DEFAULT_LOBBY_SETTINGS } from "@/types/lobby";

export function useBookingLocation(slug: string | undefined) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [location, setLocation] = useState<DbLocation | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<CourtSport>(DEFAULT_COURT_SPORT);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [booking, setBooking] = useState(false);
  const [lobbyEnabled, setLobbyEnabled] = useState(false);
  const [lobbySettings, setLobbySettings] = useState<LobbySettings>(DEFAULT_LOBBY_SETTINGS);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestBookingInProgress, setGuestBookingInProgress] = useState(false);

  // Standardpreis des Courts: Standort-Ausnahme, sonst globaler Preis.
  const { data: courtPrices, isLoading: pricesLoading } = useCourtBasePrices(selectedCourt);

  const { availableSlots, loadingSlots, refetchSlots } = useBookingSlots({
    location,
    courts,
    selectedCourt,
    selectedDate,
    selectedDuration,
  });
  
  // Preis ohne Zeitfenster. Der endgueltige Preis eines Slots kommt weiter unten
  // aus der Datenbank und kann davon abweichen.
  const basePriceCents = getPriceFromList(courtPrices, selectedDuration);
  const hasPrices = basePriceCents !== null;

  // Identische Umrechnung wie in handleBooking — Anzeige und Buchung müssen
  // denselben Zeitpunkt meinen, sonst greift ein anderes Zeitfenster-Band.
  const slotStartTimes = useMemo(
    () =>
      availableSlots.map((slot) => {
        const [hours, minutes] = slot.time.split(':').map(Number);
        return setMinutes(setHours(selectedDate, hours), minutes);
      }),
    [availableSlots, selectedDate]
  );

  const { ratesByStart } = useResolvedBookingRates({
    courtId: selectedCourt,
    startTimes: slotStartTimes,
    durationMinutes: selectedDuration,
  });

  // Der Preis des GEWAEHLTEN Slots. Vorher zeigte die Zusammenfassung den rohen
  // Standardpreis und ignorierte damit Zeitfenster und Vereinskondition, obwohl
  // die Dauer-Knoepfe direkt darueber den richtigen Preis anzeigten.
  const selectedSlotStart = useMemo(() => {
    if (!selectedSlot) return null;
    const [hours, minutes] = selectedSlot.time.split(':').map(Number);
    return setMinutes(setHours(selectedDate, hours), minutes);
  }, [selectedSlot, selectedDate]);

  const selectedRate = selectedSlotStart ? getRateForStart(ratesByStart, selectedSlotStart) : undefined;
  const priceCents = selectedRate?.priceCents ?? basePriceCents;
  // Punkte nur ankuendigen, wenn auch bezahlt wird. Bei 0 EUR (z. B. Tennis am
  // Heimstandort oder Freikontingent) vergibt der Webhook keine.
  const paybackPoints = (priceCents ?? 0) > 0 ? selectedRate?.paybackPoints ?? 0 : 0;

  const fetchLocation = useCallback(async () => {
    if (!slug) return;
    
    try {
      const { data: locationData, error: locError } = await supabase
        .from("locations")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (locError) throw locError;
      if (!locationData) {
        navigate("/booking");
        return;
      }

      setLocation(locationData as unknown as DbLocation);

      // `sport` fehlt noch in den generierten Typen -> Client-Cast wie anderswo im Repo.
      const { data: courtsData, error: courtsError } = await (supabase as any)
        .from("courts")
        .select("id, name, is_active, label, sport")
        .eq("location_id", locationData.id)
        .eq("is_active", true);

      if (courtsError) throw courtsError;

      const courtsList: Court[] = ((courtsData ?? []) as any[]).map((court) => ({
        ...court,
        sport: courtSport(court),
      }));
      setCourts(courtsList);

      // Padel bleibt der Einstieg. Nur ein Standort ganz ohne Padel-Court
      // startet in der Tennis-Ansicht.
      const padelCourts = courtsList.filter((court) => courtSport(court) === "padel");
      const startCourts = padelCourts.length > 0 ? padelCourts : courtsList;

      if (startCourts.length > 0) {
        setSelectedSport(courtSport(startCourts[0]));
        setSelectedCourt(startCourts[0].id);
      }
    } catch (error) {
      console.error("Error fetching location:", error);
      toast.error("Fehler", { description: "Standort konnte nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, [slug, navigate]);

  useEffect(() => {
    if (slug) {
      fetchLocation();
    }
  }, [slug, fetchLocation]);

  /** Sportarten, die dieser Standort tatsaechlich anbietet — Padel immer zuerst. */
  const availableSports = useMemo<CourtSport[]>(() => {
    const sports: CourtSport[] = [];
    if (courts.some((court) => courtSport(court) === "padel")) sports.push("padel");
    if (courts.some((court) => courtSport(court) === "tennis")) sports.push("tennis");
    return sports;
  }, [courts]);

  const hasTennisCourts = availableSports.includes("tennis");

  /** Nur die Courts der gewaehlten Sportart erscheinen in der Auswahl. */
  const visibleCourts = useMemo(
    () => courts.filter((court) => courtSport(court) === selectedSport),
    [courts, selectedSport]
  );

  const changeSport = useCallback(
    (sport: CourtSport) => {
      if (sport === selectedSport) return;
      setSelectedSport(sport);
      setSelectedSlot(null);
      const firstCourt = courts.find((court) => courtSport(court) === sport);
      setSelectedCourt(firstCourt?.id ?? null);
      if (sport === "tennis") {
        setSelectedDuration(TENNIS_DURATION_MINUTES);
      }
    },
    [courts, selectedSport]
  );

  // Guest booking handler — called after the GuestCheckoutModal is submitted
  const handleGuestBooking = useCallback(async (guestName: string, guestEmail: string, guestPhone: string) => {
    if (!selectedSlot || !location || !selectedCourt || !hasPrices) return;

    setGuestBookingInProgress(true);
    try {
      const [hours, minutes] = selectedSlot.time.split(':').map(Number);
      const startTime = setMinutes(setHours(selectedDate, hours), minutes);
      const endTime = addMinutes(startTime, selectedDuration);

      const { data, error } = await invokeEdgeFunction<{ booking_id: string; price_cents: number }>(
        "create-guest-booking",
        {
          body: {
            court_id: selectedCourt,
            location_id: location.id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            guest_name: guestName,
            guest_email: guestEmail,
            guest_phone: guestPhone,
          },
          maxRetries: 1,
        }
      );

      if (error || !data?.booking_id) {
        toast.error("Fehler bei der Buchung", {
          description: error?.message || "Bitte versuche es erneut.",
        });
        return;
      }

      setShowGuestModal(false);
      navigate(`/booking/checkout?booking_id=${data.booking_id}&guest=1`);
    } catch (err: any) {
      toast.error("Fehler bei der Buchung", { description: err.message || "Bitte versuche es erneut." });
    } finally {
      setGuestBookingInProgress(false);
    }
  }, [selectedSlot, location, selectedCourt, hasPrices, selectedDate, selectedDuration, navigate]);

  const handleBooking = useCallback(async () => {
    if (!user) {
      // Open guest checkout modal instead of redirecting to auth
      if (!selectedSlot || !hasPrices) {
        toast.error("Bitte wähle zuerst einen Zeitslot");
        return;
      }
      setShowGuestModal(true);
      return;
    }

    if (!selectedSlot || !location || !selectedCourt || !hasPrices) return;

    setBooking(true);
    try {
      // Limit: max 3 active (unpaid) holds per user at a time.
      // Only pending_payment bookings with a hold that hasn't expired count.
      // Confirmed (paid) bookings never count — users can have unlimited paid bookings.
      const now = new Date().toISOString();
      const { count } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending_payment")
        .gt("hold_expires_at", now);

      if (count !== null && count >= 10) {
        toast.error("Buchungslimit erreicht", {
          description: "Du hast bereits 10 offene Reservierungen. Bezahle eine davon oder warte bis die Haltezeit (15 Min.) abläuft.",
        });
        setBooking(false);
        return;
      }
      const [hours, minutes] = selectedSlot.time.split(':').map(Number);
      const startTime = setMinutes(setHours(selectedDate, hours), minutes);
      const endTime = addMinutes(startTime, selectedDuration);
      const holdExpiresAt = addMinutes(new Date(), 15);

      // Preis fuer GENAU diesen Slot (Zeitfenster-Band); ohne Band identisch zu priceCents.
      // Die Buchungszeile muss den echten Preis tragen: voucher-redeem entscheidet ueber
      // `discount_value >= booking.price_cents`, ob ein Fixbetrag-Gutschein voll deckt.
      // Mit einem veralteten Standardpreis wuerde ein Band diese Entscheidung verfaelschen.
      const slotRate = getRateForStart(ratesByStart, startTime);
      const effectivePriceCents = slotRate?.priceCents ?? priceCents!;

      const { data, error } = await supabase
        .from("bookings")
        .insert({
          user_id: user.id,
          location_id: location.id,
          court_id: selectedCourt,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: "pending_payment",
          price_cents: effectivePriceCents,
          currency: "EUR",
          hold_expires_at: holdExpiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes("no_overlapping_bookings") || error.code === "23P01") {
          toast.error("Slot nicht mehr verfügbar", {
            description: "Dieser Zeitslot wurde gerade von jemand anderem gebucht. Bitte wähle einen anderen.",
          });
          refetchSlots();
          setSelectedSlot(null);
          return;
        }
        throw error;
      }

      // Create lobby if enabled
      if (lobbyEnabled && priceCents) {
        try {
          const { error: lobbyError } = await supabase.functions.invoke("lobby-api", {
            body: {
              action: "create_lobby",
              booking_id: data.id,
              location_id: location.id,
              court_id: selectedCourt,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              price_total_cents: effectivePriceCents,
              capacity: lobbySettings.capacity,
              skill_min: lobbySettings.skillRange[0],
              skill_max: lobbySettings.skillRange[1],
              description: lobbySettings.description || null,
              is_private: !lobbySettings.isPublic,
            },
          });
          if (lobbyError) {
            console.error("Failed to create lobby:", lobbyError);
            toast.error("Lobby konnte nicht erstellt werden", { description: "Die Buchung wurde trotzdem angelegt." });
          }
        } catch (err) {
          console.error("Lobby creation error:", err);
        }
      }

      // Redirect to checkout page
      navigate(`/booking/checkout?booking_id=${data.id}`);
    } catch (error: any) {
      console.error("Booking error:", error);
      toast.error("Fehler bei der Buchung", { description: error.message || "Bitte versuche es erneut." });
    } finally {
      setBooking(false);
    }
  }, [
    user, slug, selectedSlot, location, selectedCourt, hasPrices,
    selectedDate, selectedDuration, priceCents,
    navigate, refetchSlots, lobbyEnabled, lobbySettings
  ]);

  return {
    // State
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
    paybackPoints,
    hasPrices,
    courtPrices,
    ratesByStart,
    user,
    lobbyEnabled,
    lobbySettings,
    showGuestModal,
    guestBookingInProgress,

    // Setters
    setSelectedDate,
    setSelectedCourt,
    setSelectedSlot,
    setSelectedDuration,
    setLobbyEnabled,
    setLobbySettings,
    setShowGuestModal,

    // Actions
    changeSport,
    handleBooking,
    handleGuestBooking,
  };
}
