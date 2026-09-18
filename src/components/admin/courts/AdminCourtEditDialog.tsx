import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { useLocationMutations } from "./useLocationMutations";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { CourtSport, SPORT_LABEL, courtSport } from "./types";
import { SportSelect } from "./SportSelect";

interface Court {
  id: string;
  name: string;
  is_active: boolean;
  location_id: string;
  label?: string | null;
  sport?: string | null;
}

interface AdminCourtEditDialogProps {
  court: Court;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminCourtEditDialog({ court, locationName, open, onOpenChange }: AdminCourtEditDialogProps) {
  const queryClient = useQueryClient();
  const { toggleCourtMutation } = useLocationMutations();
  
  const [courtName, setCourtName] = useState(court.name);
  const [courtLabel, setCourtLabel] = useState(court.label ?? "");
  const [isActive, setIsActive] = useState(court.is_active);
  const [sport, setSport] = useState<CourtSport>(courtSport(court));

  // Sync state when dialog opens or court changes
  useEffect(() => {
    setCourtName(court.name);
    setCourtLabel(court.label ?? "");
    setIsActive(court.is_active);
    setSport(courtSport(court));
  }, [court, open]);

  const updateCourtMutation = useMutation({
    mutationFn: async ({
      name,
      label,
      sport: nextSport,
    }: {
      name: string;
      label: string | null;
      sport: CourtSport;
    }) => {
      // `sport` fehlt noch in den generierten Supabase-Typen (Migration 20260812100000).
      const { error } = await supabase
        .from("courts")
        .update({ name, label, sport: nextSport } as any)
        .eq("id", court.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.adminLocations] });
    },
    onError: () => {
      toast.error("Fehler beim Speichern");
    },
  });

  const handleSave = async () => {
    // Update court name/label/sport if changed
    const newLabel = courtLabel.trim() || null;
    if (
      courtName !== court.name ||
      newLabel !== (court.label ?? null) ||
      sport !== courtSport(court)
    ) {
      await updateCourtMutation.mutateAsync({ name: courtName, label: newLabel, sport });
    }

    // Update active status if changed
    if (isActive !== court.is_active) {
      toggleCourtMutation.mutate({ courtId: court.id, isActive });
    }

    toast.success("Court gespeichert");
    onOpenChange(false);
  };

  const isSaving = updateCourtMutation.isPending;
  const sportChanged = sport !== courtSport(court);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Court bearbeiten
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{locationName}</p>
        </DialogHeader>

        <div className="space-y-6">
            {/* Sportart */}
            <div className="space-y-2">
              <Label>Sportart</Label>
              <SportSelect value={sport} onChange={setSport} className="flex" />
              {sportChanged ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-sm text-amber-400">
                    Der Court zählt nach dem Speichern als {SPORT_LABEL[sport]}-Court:
                    Preise und Auswertungen werden {SPORT_LABEL[sport]} zugeordnet.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bestimmt Preise, Auswertungen und die angezeigte Standort-Ansicht.
                </p>
              )}
            </div>

            {/* Court Name */}
            <div className="space-y-2">
              <Label htmlFor="court-name">Court Name</Label>
              <Input
                id="court-name"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
                className="bg-background border-border"
              />
            </div>

            {/* Court Label */}
            <div className="space-y-2">
              <Label htmlFor="court-label">Kurz-Label (optional)</Label>
              <Input
                id="court-label"
                value={courtLabel}
                onChange={(e) => setCourtLabel(e.target.value)}
                placeholder="z.B. Outdoor · Flutlicht"
                className="bg-background border-border"
              />
              <p className="text-xs text-muted-foreground">Wird bei der Court-Auswahl im Booking angezeigt.</p>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
              <Label htmlFor="court-active" className="text-sm font-medium">
                Court ist online
              </Label>
              <Switch
                id="court-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Speichern
              </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
