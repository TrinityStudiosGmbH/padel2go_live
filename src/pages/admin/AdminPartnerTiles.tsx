import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { usePartnerTiles, type PartnerTile } from "@/hooks/usePartnerTiles";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TranslatableField } from "@/components/admin/TranslatableField";
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
import { toast } from "sonner";
import { AlertTriangle, Upload, Trash2, Plus, ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";

const AdminPartnerTiles = () => {
  const { data: tiles, isLoading, uploadLogoMutation, updateMutation, createMutation, deleteMutation } = usePartnerTiles(false);
  const { translateRow } = useTranslateContent();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PartnerTile | null>(null);

  const runTranslate = (id: string) => {
    translateRow({ table: "partner_tiles", id, fields: ["description"] }).then((result) => {
      toastTranslateResult(result);
      queryClient.invalidateQueries({ queryKey: ["partner-tiles"] });
    });
  };

  const handleLogoUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogoMutation.mutateAsync({ id, file });
      toast.success("Logo hochgeladen");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleColorChange = async (id: string, color: string) => {
    try {
      await updateMutation.mutateAsync({ id, bg_color: color } as any);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, is_active } as any);
      toast.success(is_active ? "Aktiviert" : "Deaktiviert");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSortChange = async (id: string, sort_order: number) => {
    try {
      await updateMutation.mutateAsync({ id, sort_order } as any);
    } catch (err: any) {
      toast.error("Sortierung konnte nicht gespeichert werden: " + err.message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) {
      toast.error("Name und Slug erforderlich");
      return;
    }
    try {
      await createMutation.mutateAsync({ name: newName, slug: newSlug });
      setNewName("");
      setNewSlug("");
      toast.success("Partner hinzugefügt");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Partner gelöscht");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="text-sm text-muted-foreground">
          Partner-Logos und Hintergrundfarben auf der Homepage verwalten — Logo, Farbe, Website und Sortierung speichern sofort, die Beschreibung über „Speichern“.
        </p>

        {/* Neuen Partner hinzufügen */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-3.5">
            <h3 className="font-display text-[15px] font-bold tracking-tight text-foreground">
              Neuen Partner hinzufügen
            </h3>
            <div className="flex flex-wrap items-end gap-[11px]">
              <div className="flex min-w-[min(180px,100%)] flex-1 flex-col gap-[7px]">
                <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Name<span className="text-primary"> *</span>
                </label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="z. B. Red Bull"
                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                />
              </div>
              <div className="flex min-w-[min(180px,100%)] flex-1 flex-col gap-[7px]">
                <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Slug<span className="text-primary"> *</span>
                </label>
                <Input
                  value={newSlug}
                  onChange={e => setNewSlug(e.target.value)}
                  placeholder="z. B. redbull"
                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="h-10 gap-[7px] rounded-[10px] px-[17px] text-[13px] font-bold"
              >
                <Plus className="h-[15px] w-[15px]" /> Hinzufügen
              </Button>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex flex-col gap-[11px]">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-[11px]">
            {tiles?.map(tile => (
              <Card key={tile.id} className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
                <div className="flex flex-col gap-[15px]">
                  <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3.5 xl:grid-cols-[80px_minmax(0,1.1fr)_176px_minmax(0,1fr)_auto_74px_auto]">
                    {/* Logo preview */}
                    <div
                      className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-[14px]"
                      style={{ backgroundColor: tile.bg_color || "#FFFFFF" }}
                    >
                      {tile.logo_url ? (
                        <img src={tile.logo_url} alt={tile.name} className="h-14 w-auto object-contain" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Name & slug & logo upload */}
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <p className="truncate font-display text-base font-bold tracking-tight text-foreground">{tile.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{tile.slug}</p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={el => { fileInputRefs.current[tile.id] = el; }}
                        onChange={e => handleLogoUpload(tile.id, e)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRefs.current[tile.id]?.click()}
                        className="mt-[5px] h-7 gap-1.5 self-start rounded-lg border-[hsl(0_0%_16%)] bg-white/5 px-[11px] text-[11.5px] font-bold text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                      >
                        <Upload className="h-3 w-3" /> Logo
                      </Button>
                    </div>

                    <div className="max-xl:col-span-full max-xl:flex max-xl:flex-wrap max-xl:items-end max-xl:gap-3.5 xl:contents">
                      {/* Website URL */}
                      <div className="flex min-w-0 flex-col gap-1.5 max-xl:min-w-[min(220px,100%)] max-xl:flex-1">
                        <label className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Website-URL</label>
                        <Input
                          type="url"
                          placeholder="https://…"
                          defaultValue={tile.website_url || ""}
                          onBlur={e => {
                            const val = e.target.value.trim() || null;
                            if (val !== (tile.website_url || null)) {
                              updateMutation.mutate({ id: tile.id, website_url: val } as any);
                            }
                          }}
                          className="h-9 rounded-[9px] border-[hsl(0_0%_16%)] bg-white/5 text-[12.5px]"
                        />
                      </div>

                      {/* Color picker */}
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">BG-Farbe</label>
                        <div className="flex h-9 items-center gap-[7px] rounded-[9px] border border-[hsl(0_0%_16%)] bg-white/5 px-2">
                          <input
                            type="color"
                            value={tile.bg_color || "#FFFFFF"}
                            onChange={e => handleColorChange(tile.id, e.target.value)}
                            className="h-5 w-5 flex-none cursor-pointer appearance-none rounded-[5px] border border-white/[0.18] bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-none"
                          />
                          <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_78%)]">
                            {(tile.bg_color || "#FFFFFF").toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Sort order */}
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Sort</label>
                        <Input
                          key={`${tile.id}-${tile.sort_order ?? 0}`}
                          type="number"
                          defaultValue={tile.sort_order ?? 0}
                          onBlur={e => {
                            const v = parseInt(e.target.value) || 0;
                            if (v !== (tile.sort_order ?? 0)) handleSortChange(tile.id, v);
                          }}
                          className="h-9 w-16 rounded-[9px] border-[hsl(0_0%_16%)] bg-white/5 text-center font-mono text-[13px] font-bold"
                        />
                      </div>

                      {/* Active toggle + delete */}
                      <div className="flex flex-none items-center gap-[11px] max-xl:ml-auto">
                        <Switch
                          checked={tile.is_active ?? true}
                          onCheckedChange={v => handleToggleActive(tile.id, v)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(tile)}
                          className="h-[34px] w-[34px] flex-none rounded-[9px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] p-0 text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Description for ALL partner types — translatable DE+EN */}
                  <div className="flex flex-col gap-2.5 border-t border-[hsl(0_0%_12%)] pt-3.5">
                    <div className="min-w-0">
                      <PartnerDescriptionEditor
                        tile={tile}
                        onSave={async (payload) => {
                          await updateMutation.mutateAsync({ id: tile.id, ...payload } as any);
                          runTranslate(tile.id);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Partner wirklich löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              Der Partner <strong className="text-foreground">{pendingDelete?.name}</strong>{" "}
              verschwindet von der Homepage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) confirmDelete(pendingDelete.id);
              }}
              className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

interface DescriptionPayload {
  description: string | null;
  description_en: string | null;
  description_en_locked: boolean;
}

const PartnerDescriptionEditor = ({
  tile,
  onSave,
}: {
  tile: PartnerTile;
  onSave: (payload: DescriptionPayload) => Promise<void>;
}) => {
  const [de, setDe] = useState(tile.description || "");
  const [en, setEn] = useState(tile.description_en || "");
  const [locked, setLocked] = useState(!!tile.description_en_locked);
  const [saving, setSaving] = useState(false);

  const hasChanged =
    de !== (tile.description || "") ||
    en !== (tile.description_en || "") ||
    locked !== !!tile.description_en_locked;

  const handleSave = async () => {
    if (!hasChanged) return;
    setSaving(true);
    try {
      await onSave({
        description: de.trim() || null,
        description_en: en.trim() || null,
        description_en_locked: locked,
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <TranslatableField
        label="Beschreibung"
        deValue={de}
        onDeChange={setDe}
        enValue={en}
        onEnChange={setEn}
        locked={locked}
        onLockedChange={setLocked}
        placeholder="Beschreibung des Partners..."
        multiline
        rows={3}
        disabled={saving}
      />
      {hasChanged && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 rounded-lg px-3 text-xs font-bold">
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminPartnerTiles;
