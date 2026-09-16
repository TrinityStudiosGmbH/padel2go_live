import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { useAllLocationTeasers, type LocationTeaser } from "@/hooks/useLocationTeasers";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { TranslatableField } from "@/components/admin/TranslatableField";
import { WhatsAppIcon } from "@/components/WhatsAppBusiness";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin, Image as ImageIcon, ImagePlus, CalendarClock, AlertTriangle } from "lucide-react";

interface TeaserForm {
  title: string;
  title_en: string;
  title_en_locked: boolean;
  city: string;
  city_en: string;
  city_en_locked: boolean;
  description: string;
  description_en: string;
  description_en_locked: boolean;
  expected_date: string;
  expected_date_en: string;
  expected_date_en_locked: boolean;
  sort_order: number;
  is_active: boolean;
  image_url: string;
  club_url: string;
  whatsapp_group_url: string;
}

const emptyForm: TeaserForm = {
  title: "",
  title_en: "",
  title_en_locked: false,
  city: "",
  city_en: "",
  city_en_locked: false,
  description: "",
  description_en: "",
  description_en_locked: false,
  expected_date: "",
  expected_date_en: "",
  expected_date_en_locked: false,
  sort_order: 0,
  is_active: true,
  image_url: "",
  club_url: "",
  whatsapp_group_url: "",
};

const TRANSLATABLE_FIELDS = ["title", "description", "city", "expected_date"];

export default function AdminLocationTeasers() {
  const { data: teasers, isLoading } = useAllLocationTeasers();
  const queryClient = useQueryClient();
  const { translateRow } = useTranslateContent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TeaserForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LocationTeaser | null>(null);

  const runTranslate = (id: string) => {
    translateRow({ table: "location_teasers", id, fields: TRANSLATABLE_FIELDS }).then((result) => {
      toastTranslateResult(result);
      queryClient.invalidateQueries({ queryKey: ["location-teasers"] });
      queryClient.invalidateQueries({ queryKey: ["location-teasers-all"] });
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: TeaserForm & { id?: string }): Promise<string> => {
      const payload = {
        title: data.title,
        title_en: data.title_en.trim() || null,
        title_en_locked: data.title_en_locked,
        city: data.city || null,
        city_en: data.city_en.trim() || null,
        city_en_locked: data.city_en_locked,
        description: data.description || null,
        description_en: data.description_en.trim() || null,
        description_en_locked: data.description_en_locked,
        expected_date: data.expected_date || null,
        expected_date_en: data.expected_date_en.trim() || null,
        expected_date_en_locked: data.expected_date_en_locked,
        sort_order: data.sort_order,
        is_active: data.is_active,
        image_url: data.image_url || null,
        club_url: data.club_url || null,
        whatsapp_group_url: data.whatsapp_group_url.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (data.id) {
        const { error } = await (supabase as any)
          .from("location_teasers")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
        return data.id;
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("location_teasers")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return inserted.id as string;
      }
    },
    onSuccess: (insertedId) => {
      toast.success(editId ? "Teaser aktualisiert" : "Teaser erstellt");
      setDialogOpen(false);
      if (insertedId) runTranslate(insertedId);
      queryClient.invalidateQueries({ queryKey: ["location-teasers"] });
      queryClient.invalidateQueries({ queryKey: ["location-teasers-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("location_teasers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-teasers"] });
      queryClient.invalidateQueries({ queryKey: ["location-teasers-all"] });
      toast.success("Teaser gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: LocationTeaser) => {
    setEditId(t.id);
    setForm({
      title: t.title,
      title_en: t.title_en || "",
      title_en_locked: !!t.title_en_locked,
      city: t.city || "",
      city_en: t.city_en || "",
      city_en_locked: !!t.city_en_locked,
      description: t.description || "",
      description_en: t.description_en || "",
      description_en_locked: !!t.description_en_locked,
      expected_date: t.expected_date || "",
      expected_date_en: t.expected_date_en || "",
      expected_date_en_locked: !!t.expected_date_en_locked,
      sort_order: t.sort_order,
      is_active: t.is_active,
      image_url: t.image_url || "",
      club_url: t.club_url || "",
      whatsapp_group_url: t.whatsapp_group_url || "",
    });
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMediaFile(file, `location-teasers/${crypto.randomUUID()}`);
      setForm((f) => ({ ...f, image_url: url }));
    } catch {
      toast.error("Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Kopfzeile: Beschreibung + Neuer Teaser */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Kommende Standorte („Bald bei dir“) auf der Homepage verwalten — Sortierung über das
            Zahlenfeld im Dialog.
          </p>
          <Button
            onClick={openCreate}
            className="h-9 w-full gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] transition-opacity hover:opacity-90 sm:w-auto"
          >
            <Plus className="h-[15px] w-[15px]" /> Neuer Teaser
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : !teasers?.length ? (
          <Card className="rounded-2xl border-border bg-gradient-card p-8 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            Noch keine Teaser vorhanden.
          </Card>
        ) : (
          <div className="flex flex-col gap-[11px]">
            {teasers.map((t) => (
              <Card key={t.id} className="rounded-2xl border-border bg-gradient-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="hidden w-[22px] flex-none text-center font-mono text-xs font-bold text-muted-foreground sm:block">
                    {t.sort_order}
                  </span>
                  <div className="h-14 w-20 flex-none overflow-hidden rounded-[9px] border border-[hsl(0_0%_15%)] bg-white/[0.04]">
                    {t.image_url ? (
                      <img src={t.image_url} alt={t.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-[190px] flex-1 flex-col gap-[5px]">
                    <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
                      <span className="font-display text-base font-bold tracking-tight text-foreground">
                        {t.title}
                      </span>
                      {t.city && <span className="text-[13px] text-muted-foreground">· {t.city}</span>}
                      {!t.is_active && (
                        <span className="whitespace-nowrap rounded-full border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] px-[9px] py-[3px] text-[10.5px] font-bold text-[#FF6B6B]">
                          Inaktiv
                        </span>
                      )}
                      {t.title_en && (
                        <span className="whitespace-nowrap rounded-full border border-[hsl(200_100%_75%/0.28)] bg-[hsl(200_100%_75%/0.1)] px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#7FD4FF]">
                          EN
                        </span>
                      )}
                      {t.whatsapp_group_url && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#25D366]">
                          <WhatsAppIcon className="h-3 w-3" /> WhatsApp
                        </span>
                      )}
                    </div>
                    {t.expected_date && (
                      <span className="inline-flex items-center gap-[7px] font-mono text-[11.5px] text-muted-foreground">
                        <CalendarClock className="h-[13px] w-[13px] flex-none" />
                        {t.expected_date}
                      </span>
                    )}
                    {t.description && (
                      <span className="max-w-[520px] text-[12.5px] leading-relaxed text-muted-foreground">
                        {t.description}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-none gap-[9px]">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-[10px] border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-[15px] w-[15px]" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-[10px] border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                      onClick={() => setPendingDelete(t)}
                    >
                      <Trash2 className="h-[15px] w-[15px]" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
          <DialogHeader className="gap-[5px] space-y-0 text-left">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              Teaser
            </span>
            <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
              {editId ? "Teaser bearbeiten" : "Neuer Teaser"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-[15px]"
            onSubmit={(e) => {
              e.preventDefault();
              const wa = form.whatsapp_group_url.trim();
              if (wa && !wa.startsWith("https://")) {
                toast.error("WhatsApp-Link muss mit https:// beginnen");
                return;
              }
              saveMutation.mutate({ ...form, id: editId || undefined });
            }}
          >
            <div className="flex flex-col gap-[9px]">
              <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Bild
              </Label>
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Preview"
                  className="h-32 w-full rounded-[14px] border border-[hsl(0_0%_15%)] object-cover"
                />
              )}
              <label
                className={`flex h-[88px] cursor-pointer items-center justify-center gap-[11px] rounded-[14px] border border-dashed border-[hsl(0_0%_20%)] bg-white/[0.028] transition-colors hover:border-primary/50 ${
                  uploading ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <ImagePlus className="h-[19px] w-[19px] flex-none text-muted-foreground" />
                <span className="text-[13px] text-muted-foreground">
                  Bild auswählen — lädt sofort hoch
                </span>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploading && <p className="text-xs text-muted-foreground">Hochladen…</p>}
            </div>

            <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[15px]">
              <TranslatableField
                label="Titel *"
                deValue={form.title}
                onDeChange={(v) => setForm((f) => ({ ...f, title: v }))}
                enValue={form.title_en}
                onEnChange={(v) => setForm((f) => ({ ...f, title_en: v }))}
                locked={form.title_en_locked}
                onLockedChange={(v) => setForm((f) => ({ ...f, title_en_locked: v }))}
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[15px]">
              <TranslatableField
                label="Stadt"
                deValue={form.city}
                onDeChange={(v) => setForm((f) => ({ ...f, city: v }))}
                enValue={form.city_en}
                onEnChange={(v) => setForm((f) => ({ ...f, city_en: v }))}
                locked={form.city_en_locked}
                onLockedChange={(v) => setForm((f) => ({ ...f, city_en_locked: v }))}
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[15px]">
              <TranslatableField
                label="Beschreibung"
                deValue={form.description}
                onDeChange={(v) => setForm((f) => ({ ...f, description: v }))}
                enValue={form.description_en}
                onEnChange={(v) => setForm((f) => ({ ...f, description_en: v }))}
                locked={form.description_en_locked}
                onLockedChange={(v) => setForm((f) => ({ ...f, description_en_locked: v }))}
                multiline
                rows={3}
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[15px]">
              <TranslatableField
                label="Erwartetes Datum"
                deValue={form.expected_date}
                onDeChange={(v) => setForm((f) => ({ ...f, expected_date: v }))}
                enValue={form.expected_date_en}
                onEnChange={(v) => setForm((f) => ({ ...f, expected_date_en: v }))}
                locked={form.expected_date_en_locked}
                onLockedChange={(v) => setForm((f) => ({ ...f, expected_date_en_locked: v }))}
                placeholder="z.B. Sommer 2026"
                disabled={saveMutation.isPending}
              />
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Vereins-Website (URL)
                </Label>
                <Input
                  value={form.club_url}
                  onChange={(e) => setForm((f) => ({ ...f, club_url: e.target.value }))}
                  placeholder="https://..."
                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  WhatsApp-Gruppe (Einladungslink)
                </Label>
                <Input
                  value={form.whatsapp_group_url}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp_group_url: e.target.value }))}
                  placeholder="https://chat.whatsapp.com/..."
                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Sortierung
                </Label>
                <Input
                  type="number"
                  value={form.sort_order === 0 ? "" : form.sort_order}
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.028] px-[15px] py-[14px]">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Label className="text-[13.5px] font-bold text-foreground">Aktiv</Label>
                <span className="text-xs text-muted-foreground">Auf der Homepage sichtbar.</span>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            <div className="flex justify-end border-t border-[hsl(0_0%_12%)] pt-4">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90"
              >
                {saveMutation.isPending ? "Speichern…" : "Speichern"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Teaser wirklich löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              <strong className="text-foreground">{pendingDelete?.title}</strong> wird gelöscht und
              verschwindet von der Homepage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
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
}
