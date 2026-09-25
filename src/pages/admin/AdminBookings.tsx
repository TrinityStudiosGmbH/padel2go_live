import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  List,
  CalendarDays,
  Search,
  Filter,
  XCircle,
  Trash2,
  AlertTriangle,
  Building2,
  Clock,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  differenceInMinutes,
} from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BookingWeekCalendar, BookingDetailDrawer, type Booking } from "@/components/admin/bookings";
import { courtSport, SPORT_LABEL } from "@/components/admin/courts/types";
import type { SportScope } from "@/components/admin/SportScopeTabs";
import { useSportCourtIds } from "@/hooks/useSportCourtIds";

const CALENDAR_LEGEND = [
  { label: "Spieler", dot: "bg-primary" },
  { label: "Club", dot: "bg-[#7FD4FF]" },
  { label: "Ausstehend", dot: "bg-[#FFC44D]" },
  { label: "Storniert", dot: "bg-[#FF6B6B]" },
];

// price_cents/payment_mode stehen in types.ts, credits_used noch nicht (Migration 20260412190000).
// courts.sport ebenfalls noch nicht (Migration 20260812100000) → optionales Feld.
type BookingListRow = Omit<Booking, "courts"> & {
  courts: { id: string; name: string; sport?: string | null } | null;
  price_cents: number | null;
  payment_mode: string | null;
  credits_used: number | null;
};

type CourtFilterRow = { id: string; name: string; sport?: string | null };

const formatEuro = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const getPaymentLabel = (booking: BookingListRow): string | null => {
  if (
    booking.booking_origin === "club" &&
    (booking.allocation_minutes || booking.is_free_allocation)
  ) {
    return "Kontingent";
  }
  if ((booking.credits_used ?? 0) > 0) return "Credits";
  if (booking.payment_mode === "voucher") return "Gutschein";
  if (booking.payment_mode === "split") return "Split";
  if (booking.payment_mode === "full") return "Voll";
  return null;
};

export default function AdminBookings() {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<SportScope>("all");
  const [statusFilter, setStatusFilter] = useState<string>("confirmed");
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [onlyClubBookings, setOnlyClubBookings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [onlyExpiredAndCancelled, setOnlyExpiredAndCancelled] = useState(true);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const queryClient = useQueryClient();

  // Get week boundaries (Monday to Friday for work week)
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).slice(0, 7); // Mon-So (7 Tage)

  // Fetch locations for filter
  const { data: locations } = useQuery({
    queryKey: ["admin-locations-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch courts for filter (scoped to selected location)
  // courts.sport fehlt noch in den generierten Typen (types.ts) → Cast
  const { data: allCourts } = useQuery({
    queryKey: ["admin-courts-filter", selectedLocationId],
    queryFn: async () => {
      let query = supabase.from("courts").select("id, name, sport").order("name");
      if (selectedLocationId !== "all") {
        query = query.eq("location_id", selectedLocationId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CourtFilterRow[];
    },
  });

  const courts = useMemo(
    () =>
      sportFilter === "all"
        ? allCourts
        : allCourts?.filter((court) => courtSport(court) === sportFilter),
    [allCourts, sportFilter]
  );

  // Court-IDs der gewählten Sportart. `null` = nicht einschränken, LEERES Array
  // = diese Sportart hat keine Courts (dann muss die Buchungsliste leer bleiben).
  const { data: sportCourtIds } = useSportCourtIds(sportFilter);

  // Fetch clubs for filter
  const { data: clubs } = useQuery({
    queryKey: ["admin-clubs-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch bookings for the selected week
  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: [
      "admin-week-bookings",
      weekStart.toISOString(),
      selectedLocationId,
      courtFilter,
      sportFilter,
      statusFilter,
      clubFilter,
      onlyClubBookings,
    ],
    // Ohne die Court-IDs der Sportart würde die Query kurzzeitig ALLE Buchungen
    // liefern — also erst starten, wenn der Filter wirklich anwendbar ist.
    enabled: sportFilter === "all" || sportCourtIds !== undefined,
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select(`
          id,
          start_time,
          end_time,
          status,
          user_id,
          created_at,
          booking_origin,
          club_id,
          club_booked_by_user_id,
          booked_for_member_name,
          guest_name,
          guest_email,
          guest_phone,
          allocation_minutes,
          is_free_allocation,
          price_cents,
          payment_mode,
          is_test,
          credits_used,
          courts (id, name, sport),
          locations (id, name),
          club:clubs (id, name)
        `)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString())
        .order("start_time", { ascending: true });

      if (selectedLocationId !== "all") {
        query = query.eq("location_id", selectedLocationId);
      }

      if (courtFilter !== "all") {
        query = query.eq("court_id", courtFilter);
      }

      // bookings trägt keine Sportart → über die Courts der Sportart filtern
      if (sportCourtIds) {
        query = query.in("court_id", sportCourtIds);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "confirmed" | "pending" | "cancelled");
      }

      if (onlyClubBookings) {
        query = query.eq("booking_origin", "club");
      }

      if (clubFilter !== "all") {
        query = query.eq("club_id", clubFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // credits_used fehlt noch in den generierten Typen (types.ts) → Cast
      const rows = (data || []) as unknown as BookingListRow[];

      // Fetch profiles for each booking (user who owns it)
      const userIds = [...new Set(rows.map((b) => b.user_id))];
      const clubBookedByIds = [...new Set(rows.filter(b => b.club_booked_by_user_id).map((b) => b.club_booked_by_user_id!))];
      const allUserIds = [...new Set([...userIds, ...clubBookedByIds])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", allUserIds);

      const profilesMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return rows.map((booking) => ({
        ...booking,
        profiles: profilesMap.get(booking.user_id) || null,
        club_booked_by: booking.club_booked_by_user_id
          ? profilesMap.get(booking.club_booked_by_user_id) || null
          : null,
      })) as BookingListRow[];
    },
  });

  // Cancel booking mutation
  // Storniert ueber dieselbe Edge Function wie der Kundenweg. Vorher stand hier
  // eine nackte Statusaenderung: das Geld blieb einbehalten, Punkte kamen nicht
  // zurueck, das Vereinskontingent verfiel, es entstand keine Stornorechnung und
  // der Kunde erfuhr nichts.
  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.functions.invoke("cancel-booking", {
        body: { booking_id: bookingId },
      });
      if (error) {
        let serverMessage: string | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            serverMessage = body?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        throw new Error(serverMessage || error.message);
      }
    },
    onSuccess: () => {
      toast.success("Buchung storniert", {
        description: "Betrag erstattet, Punkte zurückgebucht, Kunde benachrichtigt.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-week-bookings"] });
      setCancelBookingId(null);
      setSelectedBooking(null);
    },
    onError: (e: Error) => {
      toast.error("Fehler beim Stornieren", { description: e.message });
    },
  });

  // Reset all bookings mutation
  const resetBookingsMutation = useMutation({
    mutationFn: async (onlyExpiredCancelled: boolean) => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "reset_all_bookings", onlyExpiredAndCancelled: onlyExpiredCancelled },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Buchungen wurden zurückgesetzt");
      queryClient.invalidateQueries({ queryKey: ["admin-week-bookings"] });
      setShowResetDialog(false);
      setResetConfirmText("");
    },
    onError: (error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const isLoading = bookingsLoading || (sportFilter !== "all" && sportCourtIds === undefined);

  // Filter bookings for list view
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    if (!searchQuery) return bookings;

    const searchLower = searchQuery.toLowerCase();
    return bookings.filter(
      (booking) =>
        booking.courts?.name?.toLowerCase().includes(searchLower) ||
        booking.locations?.name?.toLowerCase().includes(searchLower) ||
        booking.profiles?.display_name?.toLowerCase().includes(searchLower) ||
        booking.profiles?.username?.toLowerCase().includes(searchLower) ||
        booking.club?.name?.toLowerCase().includes(searchLower) ||
        booking.booked_for_member_name?.toLowerCase().includes(searchLower) ||
        booking.club_booked_by?.display_name?.toLowerCase().includes(searchLower)
    );
  }, [bookings, searchQuery]);

  // Court-Name für Kalender und Detail-Ansicht: "Court 1" gibt es sowohl als
  // Padel- als auch als Tennis-Platz — ohne Sportart wären beide nicht
  // unterscheidbar. Die Listenansicht zeigt die Sportart in einer eigenen Zeile.
  const withSportInCourtName = (booking: BookingListRow): Booking => ({
    ...booking,
    courts: booking.courts
      ? {
          ...booking.courts,
          name: `${booking.courts.name} · ${SPORT_LABEL[courtSport(booking.courts)]}`,
        }
      : null,
  });

  const calendarBookings = useMemo<Booking[]>(
    () => filteredBookings.map(withSportInCourtName),
    [filteredBookings]
  );

  // Count club bookings
  const clubBookingsCount = useMemo(() => {
    return bookings?.filter(b => b.booking_origin === "club").length || 0;
  }, [bookings]);

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value);
    setCourtFilter("all");
  };

  const handleSportChange = (value: string) => {
    setSportFilter(value as SportScope);
    // Der gewählte Court gehört evtl. zur anderen Sportart → Filter zurücksetzen
    setCourtFilter("all");
  };

  const handlePrevWeek = () => setSelectedWeek((w) => subWeeks(w, 1));
  const handleNextWeek = () => setSelectedWeek((w) => addWeeks(w, 1));
  const handleThisWeek = () => setSelectedWeek(new Date());

  const getStatusBadge = (status: string) => {
    const styles = {
      confirmed: "border-primary/30 bg-primary/10 text-primary",
      cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
      pending: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
    };
    return styles[status as keyof typeof styles] || "border-[hsl(0_0%_18%)] bg-white/5 text-muted-foreground";
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Kopfzeile: Wochenzähler + Ansicht-Tabs + Reset */}
        <div className="flex flex-wrap items-end justify-between gap-x-[18px] gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{bookings?.length || 0} Buchungen</span>{" "}
              in dieser Woche
              {clubBookingsCount > 0 && (
                <span className="ml-2 text-[#7FD4FF]">
                  ({clubBookingsCount} Club-Buchungen)
                </span>
              )}
            </p>
            <Tabs value={view} onValueChange={(v) => setView(v as "calendar" | "list")}>
              <TabsList className="h-auto justify-start gap-[22px] rounded-none border-b border-[hsl(0_0%_12%)] bg-transparent p-0">
                <TabsTrigger
                  value="calendar"
                  className="-mb-px gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-sm font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  <CalendarDays className="h-4 w-4" />
                  Kalender
                </TabsTrigger>
                <TabsTrigger
                  value="list"
                  className="-mb-px gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-sm font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  <List className="h-4 w-4" />
                  Liste
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            className="h-9 gap-2 rounded-[10px] border-[hsl(0_100%_71%/0.32)] bg-[hsl(0_100%_71%/0.08)] px-3.5 text-[13px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
          >
            <Trash2 className="h-[15px] w-[15px]" />
            Buchungen Reset
          </Button>
        </div>

        {/* Filterkarte */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            {/* Wochen-Navigation */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevWeek}
                className="h-[34px] w-[34px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[hsl(0_0%_75%)] hover:border-primary/40 hover:bg-white/[0.04] hover:text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[196px] text-center font-mono text-sm font-bold text-foreground">
                {format(weekStart, "dd. MMM", { locale: de })} -{" "}
                {format(weekEnd, "dd. MMM yyyy", { locale: de })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextWeek}
                className="h-[34px] w-[34px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[hsl(0_0%_75%)] hover:border-primary/40 hover:bg-white/[0.04] hover:text-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleThisWeek}
                className="h-[34px] rounded-[10px] border-primary/30 bg-primary/[0.09] px-3.5 text-[12.5px] font-bold text-primary hover:bg-primary/[0.16] hover:text-primary"
              >
                Diese Woche
              </Button>
            </div>

            {/* Filter */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Standort
                </Label>
                <Select value={selectedLocationId} onValueChange={handleLocationChange}>
                  <SelectTrigger className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                    <SelectValue placeholder="Standort wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Standorte</SelectItem>
                    {locations?.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Sportart
                </Label>
                <Select value={sportFilter} onValueChange={handleSportChange}>
                  <SelectTrigger className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                    <SelectValue placeholder="Sportart wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Sportarten</SelectItem>
                    <SelectItem value="padel">
                      <span className="flex items-center gap-2">
                        <span className="h-[9px] w-[9px] rounded-[3px] bg-primary" />
                        Padel
                      </span>
                    </SelectItem>
                    <SelectItem value="tennis">
                      <span className="flex items-center gap-2">
                        <span className="h-[9px] w-[9px] rounded-[3px] bg-[#7FD4FF]" />
                        Tennis
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Court
                </Label>
                <Select value={courtFilter} onValueChange={setCourtFilter}>
                  <SelectTrigger className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                    <SelectValue placeholder="Court wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Courts</SelectItem>
                    {courts?.map((court) => (
                      <SelectItem key={court.id} value={court.id}>
                        <span className="flex items-center gap-2">
                          {court.name}
                          <span
                            className={`font-mono text-[10.5px] ${
                              courtSport(court) === "tennis" ? "text-[#7FD4FF]" : "text-primary"
                            }`}
                          >
                            {SPORT_LABEL[courtSport(court)]}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="confirmed">Bestätigt</SelectItem>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Club
                </Label>
                <Select value={clubFilter} onValueChange={setClubFilter}>
                  <SelectTrigger className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Club wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Clubs</SelectItem>
                    {clubs?.map((club) => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Club-Schnellfilter */}
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[hsl(0_0%_12%)] pt-[13px]">
              <div className="flex items-center gap-2.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/[0.04] py-[7px] pl-2.5 pr-3.5">
                <Checkbox
                  id="onlyClubBookings"
                  checked={onlyClubBookings}
                  onCheckedChange={(checked) => setOnlyClubBookings(checked === true)}
                  className="h-[17px] w-[17px] rounded-[5px] border-[hsl(0_0%_30%)]"
                />
                <Label
                  htmlFor="onlyClubBookings"
                  className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[hsl(0_0%_75%)]"
                >
                  <Building2 className="h-4 w-4 text-primary" />
                  Nur Club-Buchungen
                </Label>
              </div>
            </div>
          </div>
        </Card>

        {/* Kalenderansicht */}
        {view === "calendar" && (
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <span className="font-display text-base font-bold tracking-tight text-foreground">
                    Wochenübersicht
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3.5">
                  {CALENDAR_LEGEND.map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center gap-[7px] whitespace-nowrap text-xs text-muted-foreground"
                    >
                      <span className={`h-[9px] w-[9px] rounded-[3px] ${item.dot}`} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Laden...
                </div>
              ) : (
                <BookingWeekCalendar
                  weekDays={weekDays}
                  bookings={calendarBookings}
                  onBookingClick={setSelectedBooking}
                />
              )}
            </div>
          </Card>
        )}

        {/* Listenansicht */}
        {view === "list" && (
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <span className="font-display text-base font-bold tracking-tight text-foreground">
                  Buchungsliste{" "}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    ({filteredBookings?.length || 0})
                  </span>
                </span>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9 text-[13.5px]"
                  />
                </div>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground">Laden...</p>
              ) : filteredBookings && filteredBookings.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Typ</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Datum & Zeit</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Standort</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Court</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Benutzer</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Club</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Gebucht von</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Für Mitglied</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Kontingent</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Dauer</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Betrag</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Zahlung</TableHead>
                        <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Status</TableHead>
                        <TableHead className="whitespace-nowrap text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map((booking) => (
                        <TableRow key={booking.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]">
                          {/* Booking Type */}
                          <TableCell>
                            {booking.booking_origin === "club" ? (
                              <Badge
                                variant="outline"
                                className="gap-1.5 whitespace-nowrap rounded-full border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] px-2.5 py-1 text-[11px] font-bold text-[#7FD4FF]"
                              >
                                <Building2 className="h-3 w-3" />
                                Club
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="whitespace-nowrap rounded-full border-[hsl(0_0%_18%)] bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[hsl(0_0%_80%)]"
                              >
                                User
                              </Badge>
                            )}
                          </TableCell>
                          {/* Date & Time */}
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <p className="whitespace-nowrap font-mono text-[12.5px] text-foreground">
                                {format(new Date(booking.start_time), "dd.MM.yyyy", { locale: de })}
                              </p>
                              <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                                {format(new Date(booking.start_time), "HH:mm")} -{" "}
                                {format(new Date(booking.end_time), "HH:mm")}
                              </p>
                            </div>
                          </TableCell>
                          {/* Location */}
                          <TableCell className="whitespace-nowrap text-[13px] text-[hsl(0_0%_78%)]">
                            {booking.locations?.name}
                          </TableCell>
                          {/* Court */}
                          <TableCell className="whitespace-nowrap py-3 text-[13px] font-semibold text-foreground">
                            <div className="flex flex-col gap-px">
                              <span>{booking.courts?.name}</span>
                              {booking.courts && (
                                <span
                                  className={`font-mono text-[11px] font-normal ${
                                    courtSport(booking.courts) === "tennis"
                                      ? "text-[#7FD4FF]"
                                      : "text-primary"
                                  }`}
                                >
                                  {SPORT_LABEL[courtSport(booking.courts)]}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {/* User (Owner) / Gast */}
                          <TableCell>
                            {booking.profiles?.display_name || booking.profiles?.username ? (
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-primary/[0.26] bg-primary/10 font-display text-[10.5px] font-extrabold text-primary">
                                  {(booking.profiles?.display_name || booking.profiles?.username || "")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
                                  {booking.profiles?.display_name || booking.profiles?.username}
                                </span>
                              </div>
                            ) : booking.guest_email || booking.guest_name ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                                  {booking.guest_name || "Gast"}
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-primary/[0.28] bg-primary/[0.09] px-2 py-0 font-mono text-[10px] uppercase tracking-[0.1em] text-primary"
                                  >
                                    Gast
                                  </Badge>
                                </span>
                                {booking.guest_email && (
                                  <a
                                    href={`mailto:${booking.guest_email}`}
                                    className="break-all text-xs text-muted-foreground hover:text-primary"
                                  >
                                    {booking.guest_email}
                                  </a>
                                )}
                                {booking.guest_phone && (
                                  <span className="text-xs text-muted-foreground">{booking.guest_phone}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Club Name */}
                          <TableCell className="whitespace-nowrap">
                            {booking.club?.name ? (
                              <span className="text-[13px] font-semibold text-[#7FD4FF]">{booking.club.name}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Booked By (Club User) */}
                          <TableCell className="whitespace-nowrap text-[13px] text-[hsl(0_0%_78%)]">
                            {booking.club_booked_by?.display_name || booking.club_booked_by?.username || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* For Member */}
                          <TableCell className="whitespace-nowrap text-[13px] text-[hsl(0_0%_78%)]">
                            {booking.booked_for_member_name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Quota */}
                          <TableCell>
                            {booking.allocation_minutes ? (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="whitespace-nowrap font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                                  {booking.allocation_minutes} Min
                                </span>
                                {booking.is_free_allocation && (
                                  <Badge
                                    variant="outline"
                                    className="ml-1 rounded-full border-green-500/30 bg-green-500/10 px-2 py-0 font-mono text-[10px] uppercase tracking-[0.1em] text-green-500"
                                  >
                                    Frei
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Duration */}
                          <TableCell>
                            <span className="whitespace-nowrap font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                              {differenceInMinutes(
                                new Date(booking.end_time),
                                new Date(booking.start_time)
                              )}{" "}
                              Min
                            </span>
                          </TableCell>
                          {/* Amount */}
                          <TableCell>
                            {booking.price_cents != null ? (
                              <span className="whitespace-nowrap font-mono text-[12.5px] text-foreground">
                                {formatEuro(booking.price_cents)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Payment */}
                          <TableCell className="whitespace-nowrap text-[13px] text-[hsl(0_0%_78%)]">
                            {getPaymentLabel(booking) || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {/* Status */}
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusBadge(
                                booking.status
                              )}`}
                            >
                              <span className="h-[5px] w-[5px] rounded-full bg-current" />
                              {booking.status === "confirmed"
                                ? "Bestätigt"
                                : booking.status === "cancelled"
                                ? "Storniert"
                                : "Ausstehend"}
                            </span>
                            {(booking as { is_test?: boolean }).is_test && (
                              <span className="ml-1.5 inline-flex items-center whitespace-nowrap rounded-full border border-[hsl(0_0%_30%)] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[hsl(0_0%_62%)]">
                                Test
                              </span>
                            )}
                          </TableCell>
                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBooking(withSportInCourtName(booking))}
                                className="h-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 px-3 text-xs font-bold text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                              >
                                Details
                              </Button>
                              {booking.status === "confirmed" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.28)] bg-[hsl(0_100%_71%/0.08)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.18)] hover:text-[#FF6B6B]"
                                  onClick={() => setCancelBookingId(booking.id)}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Keine Buchungen in dieser Woche gefunden
                </p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        booking={selectedBooking}
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        onCancel={(id) => setCancelBookingId(id)}
      />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelBookingId} onOpenChange={() => setCancelBookingId(null)}>
        <AlertDialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Buchung stornieren?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-[hsl(0_0%_68%)]">
              Der bezahlte Betrag wird über Stripe zurückerstattet, eingesetzte Punkte und
              Vereins-Freistunden gehen zurück, und der Kunde bekommt eine Nachricht. Die
              Stornorechnung entsteht automatisch. Nicht umkehrbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[11px] bg-[#FF6B6B] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
              onClick={() => cancelBookingId && cancelMutation.mutate(cancelBookingId)}
            >
              {cancelMutation.isPending ? "Storniere…" : "Stornieren & erstatten"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Bookings Dialog */}
      <AlertDialog
        open={showResetDialog}
        onOpenChange={(open) => {
          setShowResetDialog(open);
          if (!open) setResetConfirmText("");
        }}
      >
        <AlertDialogContent className="rounded-[20px] border-[hsl(0_100%_71%/0.25)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:rounded-[20px]">
          <AlertDialogHeader className="gap-1.5">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#FF6B6B]">
              <AlertTriangle className="h-3.5 w-3.5 flex-none" />
              Achtung: Diese Aktion ist unwiderruflich!
            </span>
            <AlertDialogTitle className="font-display text-[20px] font-extrabold tracking-tight text-foreground">
              Buchungen löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-[hsl(0_0%_68%)]">
              Es werden alle zugehörigen Daten gelöscht:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2 rounded-[13px] border border-[hsl(0_100%_71%/0.18)] bg-[hsl(0_100%_71%/0.05)] p-3.5">
            {[
              "Alle Buchungen",
              "Alle Teilnehmer-Einladungen",
              "Alle Spieler-Zuordnungen",
              "Alle Zahlungsdaten",
            ].map((item) => (
              <span key={item} className="flex items-center gap-2.5 text-[13px] text-[hsl(0_0%_72%)]">
                <span className="h-1 w-1 flex-none rounded-full bg-[#FF6B6B]" />
                {item}
              </span>
            ))}
          </div>

          <div className="flex w-fit items-center gap-2.5 rounded-full border border-[hsl(0_0%_15%)] bg-white/[0.04] py-[7px] pl-2.5 pr-3.5">
            <Checkbox
              id="onlyExpiredCancelled"
              checked={onlyExpiredAndCancelled}
              onCheckedChange={(checked) => setOnlyExpiredAndCancelled(checked === true)}
              className="h-[17px] w-[17px] rounded-[5px] border-[hsl(0_0%_30%)]"
            />
            <Label
              htmlFor="onlyExpiredCancelled"
              className="cursor-pointer text-[13px] font-semibold text-foreground"
            >
              Nur abgelaufene/stornierte Buchungen löschen
            </Label>
          </div>

          <label className="flex flex-col gap-[7px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Zur Bestätigung „LÖSCHEN" eingeben<span className="text-[#FF6B6B]"> *</span>
            </span>
            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="LÖSCHEN"
              className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/[0.04] font-mono text-sm font-bold tracking-[0.12em] focus-visible:border-[#FF6B6B] focus-visible:ring-0"
            />
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[11px] bg-[#FF6B6B] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585] disabled:bg-[hsl(0_0%_14%)] disabled:text-[hsl(0_0%_45%)] disabled:opacity-100"
              onClick={() => resetBookingsMutation.mutate(onlyExpiredAndCancelled)}
              disabled={resetConfirmText !== "LÖSCHEN" || resetBookingsMutation.isPending}
            >
              {resetBookingsMutation.isPending ? "Lösche..." : "Endgültig löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
