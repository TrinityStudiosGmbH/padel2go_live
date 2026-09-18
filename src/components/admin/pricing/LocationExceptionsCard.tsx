import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  useLocationPriceExceptions,
  useUpsertLocationPriceException,
  useDeleteLocationPriceException,
  type LocationPriceException,
} from "@/hooks/useCourtPrices";
import { SPORT_LABEL, SPORT_CHIP_CLASSES, type CourtSport } from "@/components/admin/courts/types";
import { SportSelect } from "@/components/admin/courts/SportSelect";

const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
const INPUT_CLASS =
  "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13.5px] font-bold";

const centsToInput = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** Leer bleibt leer (= globaler Wert gilt). "invalid" bei kaputter Eingabe. */
const parseEuro = (raw: string): number | null | "invalid" => {
  const value = raw.trim().replace(",", ".");
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "invalid";
  return Math.round(numeric * 100);
};

const parseCount = (raw: string): number | null | "invalid" => {
  const value = raw.trim();
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "invalid";
  return Math.round(numeric);
};

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
}

/**
 * Standortspezifische Ausnahmen von Preis und Punkten. Jedes leer gelassene Feld
 * faellt auf den globalen Wert zurueck; die ganze Zeile zu loeschen stellt
 * ueberall wieder den Standard her.
 */
export function LocationExceptionsCard() {
  const { data: exceptions = [], isLoading } = useLocationPriceExceptions();
  const upsert = useUpsertLocationPriceException();
  const remove = useDeleteLocationPriceException();

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-pricing-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name, city").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LocationRow[];
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LocationPriceException | null>(null);
  const [formLocation, setFormLocation] = useState("");
  const [formSport, setFormSport] = useState<CourtSport>("padel");
  const [formPrice60, setFormPrice60] = useState("");
  const [formPrice90, setFormPrice90] = useState("");
  const [formPrice120, setFormPrice120] = useState("");
  const [formPoints, setFormPoints] = useState("");
  const [formNote, setFormNote] = useState("");

  const locationLabel = useMemo(() => {
    const map = new Map(locations.map((l) => [l.id, l.city ? `${l.name} · ${l.city}` : l.name]));
    return (id: string) => map.get(id) ?? "Unbekannter Standort";
  }, [locations]);

  const openCreate = () => {
    setEditing(null);
    setFormLocation(locations[0]?.id ?? "");
    setFormSport("padel");
    setFormPrice60("");
    setFormPrice90("");
    setFormPrice120("");
    setFormPoints("");
    setFormNote("");
    setDialogOpen(true);
  };

  const openEdit = (row: LocationPriceException) => {
    setEditing(row);
    setFormLocation(row.location_id);
    setFormSport(row.sport);
    setFormPrice60(centsToInput(row.price_60_cents));
    setFormPrice90(centsToInput(row.price_90_cents));
    setFormPrice120(centsToInput(row.price_120_cents));
    setFormPoints(row.payback_points_60 === null ? "" : String(row.payback_points_60));
    setFormNote(row.note ?? "");
    setDialogOpen(true);
  };

  const save = () => {
    if (!formLocation) {
      toast.error("Bitte einen Standort wählen");
      return;
    }

    // Je Standort und Sportart gibt es genau eine Ausnahme. Ohne diese Pruefung
    // wuerde das Anlegen eine vorhandene stillschweigend ueberschreiben.
    const clash = exceptions.find(
      (row) => row.location_id === formLocation && row.sport === formSport && row.id !== editing?.id,
    );
    if (clash) {
      toast.error("Ausnahme existiert bereits", {
        description: `Für ${locationLabel(formLocation)} (${SPORT_LABEL[formSport]}) gibt es schon eine. Sie wird jetzt zum Bearbeiten geöffnet.`,
      });
      openEdit(clash);
      return;
    }

    const isTennis = formSport === "tennis";
    const p60 = parseEuro(formPrice60);
    const p90 = isTennis ? null : parseEuro(formPrice90);
    const p120 = isTennis ? null : parseEuro(formPrice120);
    const points = isTennis ? null : parseCount(formPoints);

    if (p60 === "invalid" || p90 === "invalid" || p120 === "invalid") {
      toast.error("Preis ist ungültig", { description: "Nur Beträge ab 0,00 € oder leer lassen." });
      return;
    }
    if (points === "invalid") {
      toast.error("Punkte sind ungültig", { description: "Nur ganze Zahlen ab 0 oder leer lassen." });
      return;
    }
    if (p60 === null && p90 === null && p120 === null && points === null) {
      toast.error("Die Ausnahme ist leer", {
        description: "Mindestens ein Preis oder die Punktzahl muss gesetzt sein.",
      });
      return;
    }

    upsert.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        location_id: formLocation,
        sport: formSport,
        price_60_cents: p60,
        price_90_cents: p90,
        price_120_cents: p120,
        payback_points_60: points,
        note: formNote.trim() || null,
      },
      { onSuccess: () => setDialogOpen(false) },
    );
  };

  const valueOrDefault = (cents: number | null) =>
    cents === null ? (
      <span className="font-mono text-[12px] text-[hsl(0_0%_45%)]">Standard</span>
    ) : (
      <span className="font-mono text-[12.5px] font-bold text-foreground">
        {(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
      </span>
    );

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                Ausnahmen je Standort{" "}
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  ({exceptions.length})
                </span>
              </h2>
              <span className="text-xs leading-snug text-muted-foreground">
                Nützlich für Events. Löschen stellt überall wieder den Standardpreis her.
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={openCreate}
            disabled={locations.length === 0}
            className="h-9 gap-[7px] rounded-[10px] border-primary/30 bg-primary/[0.09] px-[15px] text-[13px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Ausnahme hinzufügen
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : exceptions.length === 0 ? (
          <p className="py-8 text-center text-[13.5px] text-muted-foreground">
            Keine Ausnahmen. Überall gilt der Standardpreis.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {exceptions.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-[13px]"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold text-foreground">
                      {locationLabel(row.location_id)}
                    </span>
                    <span
                      className={`flex-none whitespace-nowrap rounded-full border px-[7px] py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SPORT_CHIP_CLASSES[row.sport]}`}
                    >
                      {SPORT_LABEL[row.sport]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      60 Min {valueOrDefault(row.price_60_cents)}
                    </span>
                    {row.sport !== "tennis" && (
                      <>
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                          90 Min {valueOrDefault(row.price_90_cents)}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                          120 Min {valueOrDefault(row.price_120_cents)}
                        </span>
                      </>
                    )}
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      Punkte/60 Min{" "}
                      {row.payback_points_60 === null ? (
                        <span className="font-mono text-[12px] text-[hsl(0_0%_45%)]">Standard</span>
                      ) : (
                        <span className="font-mono text-[12.5px] font-bold text-primary">
                          {row.payback_points_60.toLocaleString("de-DE")}
                        </span>
                      )}
                    </span>
                  </div>
                  {row.note && (
                    <span className="text-[12px] italic text-muted-foreground">{row.note}</span>
                  )}
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-[#FF6B6B]">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ausnahme löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          An diesem Standort gelten danach wieder die Standardpreise und die globale
                          Punktzahl.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(row.id)}>
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Ausnahme bearbeiten" : "Ausnahme hinzufügen"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-[7px]">
              <Label className={FIELD_LABEL}>
                Standort<span className="text-primary"> *</span>
              </Label>
              <Select value={formLocation} onValueChange={setFormLocation} disabled={!!editing}>
                <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
                  <SelectValue placeholder="Standort wählen" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {locationLabel(location.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-[7px]">
              <Label className={FIELD_LABEL}>Sportart</Label>
              <SportSelect
                value={formSport}
                onChange={(next) => {
                  setFormSport(next);
                  // Tennis kennt weder 90/120 Minuten noch Punkte — sonst bliebe
                  // ein Restwert aus der Padel-Eingabe stehen.
                  if (next === "tennis") {
                    setFormPrice90("");
                    setFormPrice120("");
                    setFormPoints("");
                  }
                }}
                className="self-start"
              />
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-3">
              {(formSport === "tennis"
                ? ([["Preis 60 Min", formPrice60, setFormPrice60]] as const)
                : ([
                    ["Preis 60 Min", formPrice60, setFormPrice60],
                    ["Preis 90 Min", formPrice90, setFormPrice90],
                    ["Preis 120 Min", formPrice120, setFormPrice120],
                  ] as const)
              ).map(([label, value, setter]) => (
                <div key={label} className="flex flex-col gap-[7px]">
                  <Label className={FIELD_LABEL}>{label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder="Standard"
                      className={`${INPUT_CLASS} min-w-0 flex-1`}
                    />
                    <span className="flex-none text-muted-foreground">€</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-[7px]">
              <Label className={FIELD_LABEL}>Punkte pro 60 Min.</Label>
              <Input
                inputMode="numeric"
                value={formPoints}
                onChange={(e) => setFormPoints(e.target.value)}
                placeholder="Standard"
                className={INPUT_CLASS}
                disabled={formSport === "tennis"}
              />
              <span className="text-[11.5px] leading-relaxed text-[hsl(0_0%_58%)]">
                {formSport === "tennis"
                  ? "Tennis sammelt keine Punkte."
                  : "90 Min. ergibt automatisch das 1,5-fache, 120 Min. das Doppelte."}
              </span>
            </div>

            <div className="flex flex-col gap-[7px]">
              <Label className={FIELD_LABEL}>Notiz</Label>
              <Input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="z. B. Sommer-Event 2026"
                className={INPUT_CLASS}
              />
            </div>

            <p className="text-[11.5px] leading-relaxed text-[hsl(0_0%_58%)]">
              Leere Felder übernehmen den globalen Wert.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Abbrechen</Button>
            </DialogClose>
            <Button onClick={save} disabled={upsert.isPending} className="gap-2">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
