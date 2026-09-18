import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Minus, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";
import { CourtSport, courtSport } from "./types";
import { SportSelect } from "./SportSelect";

/** Obergrenze der Plaetze je Standort. */
export const MAX_COURTS_PER_LOCATION = 20;

interface CourtCountSelectorProps {
  locationId: string;
  currentCourts: { id: string; name: string; is_active: boolean; sport?: string | null }[];
  maxCourts?: number;
}

export function CourtCountSelector({
  locationId,
  currentCourts,
  maxCourts = MAX_COURTS_PER_LOCATION,
}: CourtCountSelectorProps) {
  const queryClient = useQueryClient();
  // Count only active courts for the UI
  const activeCourts = currentCourts.filter((c) => c.is_active);
  const currentCount = activeCourts.length;
  const [isUpdating, setIsUpdating] = useState(false);
  // Sportart der neu angelegten Courts — einmal wählen, gilt für alle in diesem Schritt.
  const [newCourtSport, setNewCourtSport] = useState<CourtSport>("padel");

  const syncCourtsMutation = useMutation({
    mutationFn: async (targetCount: number) => {
      const activeCount = activeCourts.length;

      if (targetCount > activeCount) {
        // Nur inaktive Courts der gewählten Sportart reaktivieren — sonst
        // entstünde bei "Tennis" still ein wiederbelebter Padel-Court.
        const inactiveCourts = currentCourts.filter(
          (c) => !c.is_active && courtSport(c) === newCourtSport
        );
        const courtsToReactivate = inactiveCourts.slice(0, targetCount - activeCount);
        
        if (courtsToReactivate.length > 0) {
          const { error: reactivateError } = await supabase
            .from("courts")
            .update({ is_active: true })
            .in("id", courtsToReactivate.map((c) => c.id));
          if (reactivateError) throw reactivateError;
        }
        
        // If we need more courts than we can reactivate, create new ones
        const stillNeeded = targetCount - activeCount - courtsToReactivate.length;
        if (stillNeeded > 0) {
          const highestNumber = Math.max(
            ...currentCourts.map((c) => {
              const match = c.name.match(/Court\s*(\d+)/i);
              return match ? parseInt(match[1], 10) : 0;
            }),
            0
          );
          
          const courtsToAdd = [];
          for (let i = 1; i <= stillNeeded; i++) {
            courtsToAdd.push({
              location_id: locationId,
              name: `Court ${highestNumber + i}`,
              is_active: true,
              sport: newCourtSport,
            });
          }
          // `sport` fehlt noch in den generierten Supabase-Typen (Migration 20260812100000).
          const { error } = await supabase.from("courts").insert(courtsToAdd as any);
          if (error) throw error;
        }
      } else if (targetCount < activeCount) {
        // Deactivate courts (from the end) - soft delete
        const courtsToDeactivate = activeCourts.slice(targetCount);
        
        // Check for dependencies on each court
        for (const court of courtsToDeactivate) {
          // 1) Aktive Lobbies automatisch absagen (Admin)
          const { data: lobbies, error: lobbiesError } = await supabase
            .from("lobbies")
            .select("id")
            .eq("court_id", court.id)
            .in("status", ["open", "full"]);

          if (lobbiesError) throw lobbiesError;

          if ((lobbies?.length || 0) > 0) {
            const { error: cancelError } = await invokeEdgeFunction(
              "lobby-api",
              {
                body: { action: "admin_cancel_lobbies_for_court", court_id: court.id },
              }
            );

            if (cancelError) throw cancelError;
          }

          // 2) Zukünftige Buchungen automatisch stornieren
          const { error: bookingCancelError } = await supabase
            .from("bookings")
            .update({ 
              status: "cancelled" as const, 
              cancelled_at: new Date().toISOString() 
            })
            .eq("court_id", court.id)
            .gte("start_time", new Date().toISOString())
            .in("status", ["pending_payment", "confirmed"]);

          if (bookingCancelError) throw bookingCancelError;
        }
        
        // Hard-Delete: Courts komplett löschen
        const courtIds = courtsToDeactivate.map((c) => c.id);
        const { error } = await supabase
          .from("courts")
          .delete()
          .in("id", courtIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Anzahl Courts aktualisiert");
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.adminLocations] });
    },
    onError: (error: any) => {
      const message = error.message || "Fehler beim Aktualisieren";
      
      // Check for foreign key constraint error (fallback)
      if (message.includes("foreign key") || message.includes("violates")) {
        toast.error("Court kann nicht entfernt werden", {
          description: "Es gibt noch aktive Lobbies oder Buchungen für diesen Court.",
        });
      } else {
        toast.error(message);
      }
    },
    onSettled: () => {
      setIsUpdating(false);
    },
  });

  const handleChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(maxCourts, currentCount + delta));
    if (newCount !== currentCount) {
      setIsUpdating(true);
      syncCourtsMutation.mutate(newCount);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">
          Anzahl Courts:
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border"
            onClick={() => handleChange(-1)}
            disabled={currentCount <= 1 || isUpdating}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-9 text-center font-medium tabular-nums text-foreground">
            {currentCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border"
            onClick={() => handleChange(1)}
            disabled={currentCount >= maxCourts || isUpdating}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">(max. {maxCourts})</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(0_0%_58%)]">
          Neue Courts
        </span>
        <SportSelect value={newCourtSport} onChange={setNewCourtSport} size="sm" />
      </div>
    </div>
  );
}
