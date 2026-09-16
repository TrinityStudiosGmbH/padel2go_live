import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  Calendar,
  ExternalLink,
  Search,
  Languages,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { EventForm, EVENT_TYPES, EVENT_TRANSLATE_FIELDS } from "@/components/admin/events";
import type { Event, Location } from "@/components/admin/events";
import { useTranslateContent } from "@/hooks/useTranslateContent";

const TYPE_BADGE_STYLES: Record<string, string> = {
  party: "border-[hsl(263_100%_82%/0.3)] bg-[hsl(263_100%_82%/0.1)] text-[#C7A6FF]",
  tournament: "border-primary/30 bg-primary/10 text-primary",
  open_play: "border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]",
  workshop: "border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]",
  season_opening: "border-[hsl(20_100%_71%/0.3)] bg-[hsl(20_100%_71%/0.1)] text-[#FF9E6B]",
};
const TYPE_BADGE_FALLBACK = "border-[hsl(0_0%_18%)] bg-white/5 text-[hsl(0_0%_82%)]";

export default function AdminEvents() {
  const queryClient = useQueryClient();
  const { translateRow } = useTranslateContent();
  const { t } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all");
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const { data: events, isLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          locations:location_id (id, name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Event[];
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["admin-locations-for-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address, postal_code, city")
        .order("name");
      if (error) throw error;
      return (data || []) as Location[];
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ eventId, isPublished }: { eventId: string; isPublished: boolean }) => {
      const { error } = await supabase
        .from("events")
        .update({ is_published: isPublished })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["public-events"] });
    },
    onError: () => {
      toast.error("Fehler beim Aktualisieren");
    },
  });

  const toggleFeaturedMutation = useMutation({
    mutationFn: async ({ eventId, featured }: { eventId: string; featured: boolean }) => {
      const { error } = await supabase
        .from("events")
        .update({ featured })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Featured-Status aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["public-events"] });
    },
    onError: () => {
      toast.error("Fehler beim Aktualisieren");
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event gelöscht");
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["public-events"] });
    },
    onError: () => {
      toast.error("Fehler beim Löschen");
    },
  });

  const filteredEvents = events?.filter((event) => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "published" && event.is_published) ||
      (filterStatus === "draft" && !event.is_published);
    return matchesSearch && matchesFilter;
  });

  const publishedCount = events?.filter((e) => e.is_published).length || 0;
  const draftCount = events?.filter((e) => !e.is_published).length || 0;

  // Backfill: translate every event's DE copy into its *_en columns. Sequential to respect
  // DeepL rate limits; locked/empty fields are skipped server-side, so it is idempotent.
  const translateAll = async () => {
    if (!events?.length) return;
    setBulk({ done: 0, total: events.length });
    let ok = 0;
    for (const event of events) {
      const result = await translateRow({ table: "events", id: event.id, fields: EVENT_TRANSLATE_FIELDS });
      if (!result.error) ok++;
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBulk(null);
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    queryClient.invalidateQueries({ queryKey: ["public-events"] });
    toast.success(t("admin.translateAllDone", { count: ok }));
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Kopfzeile: Zähler + Aktionen */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-primary">{publishedCount} veröffentlicht</span>,{" "}
            <span className="font-bold text-[#FFC44D]">{draftCount} Entwürfe</span>
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {!!events?.length && (
              <Button
                variant="outline"
                onClick={translateAll}
                disabled={!!bulk}
                className="h-9 gap-[7px] rounded-[10px] border-[hsl(0_0%_16%)] bg-white/5 px-3.5 text-[13px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
              >
                {bulk ? (
                  <>
                    <Loader2 className="h-[15px] w-[15px] animate-spin" />
                    {t("admin.translateAllRunning", { done: bulk.done, total: bulk.total })}
                  </>
                ) : (
                  <>
                    <Languages className="h-[15px] w-[15px]" /> {t("admin.translateAll")}
                  </>
                )}
              </Button>
            )}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] transition-opacity hover:opacity-90">
                  <Plus className="h-[15px] w-[15px]" />
                  Neues Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
                <DialogHeader className="gap-[5px] space-y-0 text-left">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                    Event
                  </span>
                  <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                    Neues Event erstellen
                  </DialogTitle>
                </DialogHeader>
                <EventForm
                  locations={locations || []}
                  onSuccess={() => {
                    setIsCreateDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Events: Filter + Tabelle */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-[11px]">
              <div className="relative min-w-[min(240px,100%)] flex-1">
                <Search className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[hsl(0_0%_58%)]" />
                <Input
                  placeholder="Suche nach Titel oder Stadt..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9 text-[13.5px]"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger className="h-[38px] w-[170px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Events</SelectItem>
                  <SelectItem value="published">Veröffentlicht</SelectItem>
                  <SelectItem value="draft">Entwürfe</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Events Table */}
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Laden...</div>
            ) : filteredEvents && filteredEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Event</TableHead>
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Standort</TableHead>
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Datum</TableHead>
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Featured</TableHead>
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Status</TableHead>
                      <TableHead className="whitespace-nowrap font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Tickets</TableHead>
                      <TableHead className="whitespace-nowrap text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => (
                      <TableRow key={event.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {event.image_url ? (
                              <img
                                src={event.image_url}
                                alt={event.title}
                                className="h-12 w-12 flex-none rounded-[11px] border border-[hsl(0_0%_15%)] object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[11px] border border-[hsl(0_0%_15%)] bg-white/[0.04]">
                                <Calendar className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex min-w-0 flex-col gap-[3px]">
                              <p className="max-w-[230px] truncate text-[13.5px] font-bold text-foreground">
                                {event.title}
                              </p>
                              <div className="flex items-center gap-2">
                                {event.city && (
                                  <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                                    {event.city}
                                  </span>
                                )}
                                {event.event_type && (
                                  <Badge
                                    variant="outline"
                                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${
                                      TYPE_BADGE_STYLES[event.event_type] || TYPE_BADGE_FALLBACK
                                    }`}
                                  >
                                    {EVENT_TYPES.find(t => t.value === event.event_type)?.label || event.event_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[13.5px] text-[hsl(0_0%_78%)]">
                          {event.locations?.name || "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                          {event.start_at
                            ? format(new Date(event.start_at), "dd. MMM yyyy", { locale: de })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={event.featured}
                            onCheckedChange={(checked) =>
                              toggleFeaturedMutation.mutate({
                                eventId: event.id,
                                featured: checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Switch
                              checked={event.is_published}
                              onCheckedChange={(checked) =>
                                togglePublishMutation.mutate({
                                  eventId: event.id,
                                  isPublished: checked,
                                })
                              }
                            />
                            <Badge
                              variant={event.is_published ? "default" : "secondary"}
                              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                event.is_published
                                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/10"
                                  : "border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D] hover:bg-[hsl(41_100%_65%/0.1)]"
                              }`}
                            >
                              <span className="h-[5px] w-[5px] rounded-full bg-current" />
                              {event.is_published ? "Live" : "Entwurf"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.ticket_url ? (
                            <a
                              href={event.ticket_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-primary hover:underline"
                            >
                              Link
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="whitespace-nowrap text-xs text-[hsl(0_0%_55%)]">
                              über P2G
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-[7px]">
                            <Dialog
                              open={editingEvent?.id === event.id}
                              onOpenChange={(open) => setEditingEvent(open ? event : null)}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingEvent(event)}
                                  className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
                                <DialogHeader className="gap-[5px] space-y-0 text-left">
                                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                                    Event
                                  </span>
                                  <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                                    Event bearbeiten
                                  </DialogTitle>
                                </DialogHeader>
                                <EventForm
                                  event={event}
                                  locations={locations || []}
                                  onSuccess={() => {
                                    setEditingEvent(null);
                                    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
                                  }}
                                />
                              </DialogContent>
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
                                <AlertDialogHeader className="gap-4 space-y-0">
                                  <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
                                    <AlertTriangle className="h-5 w-5" />
                                  </span>
                                  <div className="flex flex-col gap-[7px] text-left">
                                    <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
                                      Event löschen?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-sm leading-relaxed text-[hsl(0_0%_68%)]">
                                      "{event.title}" wird unwiderruflich gelöscht.
                                    </AlertDialogDescription>
                                  </div>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                                    Abbrechen
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteEventMutation.mutate(event.id)}
                                    className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#FF6B6B]/90"
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-[13.5px] text-muted-foreground">Keine Events gefunden</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
