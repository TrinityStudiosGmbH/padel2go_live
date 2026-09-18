import { motion } from "framer-motion";
import { MapPin, Edit, Trash2, Building2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useState } from "react";
import { AdminCourtEditDialog } from "./AdminCourtEditDialog";
import { useLocationMutations } from "./useLocationMutations";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";
import { SPORT_LABEL, SPORT_PILL_CLASSES, courtSport } from "./types";

interface AdminCourtCardProps {
  court: {
    id: string;
    name: string;
    is_active: boolean;
    location_id: string;
    sport?: string | null;
  };
  location: {
    id: string;
    name: string;
    main_image_url: string | null;
    tennis_image_url?: string | null;
    city: string | null;
  };
  index?: number;
}

export function AdminCourtCard({ court, location, index = 0 }: AdminCourtCardProps) {
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { toggleCourtMutation } = useLocationMutations();

  const sport = courtSport(court);
  // Tennis-Courts zeigen die Tennis-Ansicht des Standorts, sonst das Hauptbild.
  const headerImageUrl =
    (sport === "tennis" ? location.tennis_image_url : null) || location.main_image_url;

  const deleteCourtMutation = useMutation({
    mutationFn: async (courtId: string) => {
      // 1. Aktive Lobbies automatisch stornieren
      const { data: lobbies, error: lobbyError } = await supabase
        .from("lobbies")
        .select("id")
        .eq("court_id", courtId)
        .in("status", ["open", "full"]);

      if (lobbyError) throw lobbyError;

      if ((lobbies?.length || 0) > 0) {
        const { error: cancelError } = await invokeEdgeFunction(
          "lobby-api",
          {
            body: { action: "admin_cancel_lobbies_for_court", court_id: courtId },
          }
        );
        if (cancelError) throw cancelError;
      }

      // 2. Zukünftige Buchungen automatisch stornieren
      const { error: bookingCancelError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled" as const,
          cancelled_at: new Date().toISOString()
        })
        .eq("court_id", courtId)
        .gte("start_time", new Date().toISOString())
        .in("status", ["pending_payment", "confirmed"]);

      if (bookingCancelError) throw bookingCancelError;

      // 3. Hard-Delete: Court komplett löschen
      const { error } = await supabase
        .from("courts")
        .delete()
        .eq("id", courtId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Court gelöscht");
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.adminLocations] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Löschen");
    },
  });

  const statusPill = (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/65 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-md ${
        court.is_active
          ? "border-primary/40 text-primary"
          : "border-[hsl(0_100%_71%/0.4)] text-[#FF6B6B]"
      }`}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {court.is_active ? "Online" : "Offline"}
    </span>
  );

  const sportPill = (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border bg-black/65 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-md ${SPORT_PILL_CLASSES[sport]}`}
    >
      {SPORT_LABEL[sport]}
    </span>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
      >
        <Card className="group overflow-hidden rounded-2xl border-border bg-gradient-card transition-all hover:border-primary/30">
          {/* Image Header */}
          {headerImageUrl ? (
            <div className="relative aspect-[21/9] w-full overflow-hidden">
              <img
                src={headerImageUrl}
                alt={location.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(0_0%_0%/0.1),hsl(0_0%_0%/0.7))]" />
              <div className="absolute left-[11px] right-[11px] top-[11px] flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
                <div className="flex items-center gap-1.5">
                  {statusPill}
                  {sportPill}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative flex aspect-[21/9] w-full items-center justify-center bg-gradient-to-br from-primary/20 via-secondary to-muted">
              <Building2 className="h-8 w-8 text-muted-foreground/50" />
              <div className="absolute left-[11px] right-[11px] top-[11px] flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
                <div className="flex items-center gap-1.5">
                  {statusPill}
                  {sportPill}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-[13px] px-[17px] pb-[17px] pt-[15px]">
            {/* Court Name & Location + Toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="truncate font-display text-base font-bold tracking-tight text-foreground">
                  {court.name}
                </h3>
                <p className="flex items-center gap-1 text-xs text-[hsl(0_0%_65%)]">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {location.name}
                    {location.city && ` • ${location.city}`}
                  </span>
                </p>
              </div>
              <Switch
                className="mt-0.5 flex-shrink-0"
                checked={court.is_active}
                onCheckedChange={(checked) =>
                  toggleCourtMutation.mutate({ courtId: court.id, isActive: checked })
                }
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-[9px]">
              <Button
                variant="ghost"
                className="h-[34px] flex-1 gap-[7px] rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                onClick={() => setEditDialogOpen(true)}
              >
                <Edit className="h-3.5 w-3.5" />
                Bearbeiten
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[34px] w-[34px] flex-shrink-0 rounded-[10px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <AlertDialogHeader className="space-y-[7px] text-left">
                    <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
                      Court löschen?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
                      "{court.name}" wird unwiderruflich gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2.5">
                    <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                      Abbrechen
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteCourtMutation.mutate(court.id)}
                      className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
                    >
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      </motion.div>

      <AdminCourtEditDialog
        court={court}
        locationName={location.name}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}
