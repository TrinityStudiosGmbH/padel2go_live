import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Loader2, Plus, Trash2, Check, X, Pencil, ImagePlus, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { uploadMediaFile } from "@/lib/uploadMedia";
import {
  useAdminCatalogCategories,
  useAdminCatalogBrands,
  useUpsertTaxonomy,
  useDeleteTaxonomy,
  slugify,
  type MarketplaceCategoryRow,
  type MarketplaceBrandRow,
} from "@/hooks/useMarketplaceCatalog";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";

interface Props {
  kind: "category" | "brand";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Row = MarketplaceCategoryRow | MarketplaceBrandRow;

// ── Styling-Tokens des neuen Designs (identisch zu AdminMarketplace.tsx) ──
const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
const FIELD_INPUT = "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]";
const ICON_BTN =
  "h-7 w-7 rounded-lg border border-[hsl(0_0%_16%)] bg-white/[0.05] text-[hsl(0_0%_78%)] hover:border-primary/40 hover:bg-white/[0.05] hover:text-primary";
const ICON_BTN_DANGER =
  "h-7 w-7 rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]";

export function CatalogManagerDialog({ kind, open, onOpenChange }: Props) {
  const isCategory = kind === "category";
  const catQuery = useAdminCatalogCategories();
  const brandQuery = useAdminCatalogBrands();
  const query = isCategory ? catQuery : brandQuery;
  const rows: Row[] = (query.data as Row[]) ?? [];

  const upsert = useUpsertTaxonomy(kind);
  const del = useDeleteTaxonomy(kind);
  const { translateRow } = useTranslateContent();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [logoUploadId, setLogoUploadId] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const pickLogo = (rowId: string) => {
    setLogoUploadId(rowId);
    logoInputRef.current?.click();
  };

  const saveLogo = (row: Row, logoUrl: string | null) =>
    upsert.mutate({
      id: row.id,
      name: row.name,
      slug: row.slug,
      sort_order: row.sort_order,
      is_active: row.is_active,
      logo_url: logoUrl,
    });

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const row = rows.find((r) => r.id === logoUploadId);
    setLogoUploadId(null);
    if (!file || !row) return;
    setLogoUploading(true);
    try {
      const url = await uploadMediaFile(file, `marketplace/brand-logos/${Date.now()}`).catch(
        (error: Error) => {
          toast.error("Fehler beim Hochladen: " + error.message);
          return null;
        },
      );
      if (url) saveLogo(row, url);
    } finally {
      setLogoUploading(false);
    }
  };

  // Category names are shown to the public (filter chips, breadcrumbs) → auto-translate to EN.
  // Brand names are proper nouns and stay untouched.
  const translateCategory = (id: string) => {
    if (!isCategory) return;
    translateRow({ table: "marketplace_categories", id, fields: ["name"] }).then(toastTranslateResult);
  };

  const title = isCategory ? "Kategorien verwalten" : "Marken verwalten";
  const placeholder = isCategory ? "z.B. Schläger" : "z.B. Adidas";

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    upsert.mutate(
      { name, slug: slugify(name), sort_order: rows.length + 1, is_active: true },
      {
        onSuccess: (id: string) => {
          setNewName("");
          translateCategory(id);
        },
      },
    );
  };

  const startEdit = (row: Row) => {
    setEditingId(row.id);
    setEditName(row.name);
  };

  const saveEdit = (row: Row) => {
    const name = editName.trim();
    if (!name) return;
    upsert.mutate(
      { id: row.id, name, slug: slugify(name), sort_order: row.sort_order, is_active: row.is_active },
      {
        onSuccess: () => {
          setEditingId(null);
          translateCategory(row.id);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-[18px] overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
        <DialogHeader className="gap-[5px] space-y-0 text-left">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Katalog</span>
          <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-normal text-muted-foreground">
            {isCategory
              ? "Produktkategorien für den Shop (z.B. Schläger, Bälle, Bekleidung)."
              : "Marken für die Produkte (z.B. Adidas, Babolat, Bullpadel). Klick auf den Kreis lädt ein Logo hoch — es erscheint auf den Produktkarten und der Produktseite."}
          </DialogDescription>
        </DialogHeader>

        {!isCategory && (
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        )}

        {/* Add new */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className={FIELD_LABEL}>Neuer Eintrag</Label>
            <Input
              value={newName}
              placeholder={placeholder}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={FIELD_INPUT}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={!newName.trim() || upsert.isPending}
            className="h-10 w-10 flex-none rounded-[10px] bg-gradient-lime p-0 text-primary-foreground transition-opacity hover:opacity-90"
          >
            {upsert.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2">
          {query.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Einträge.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-xl border border-[hsl(0_0%_12%)] bg-white/[0.028] px-3 py-[11px]"
              >
                {editingId === row.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(row)}
                      className="h-9 flex-1 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/[0.18] hover:text-primary"
                      onClick={() => saveEdit(row)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={ICON_BTN}
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    {!isCategory && (
                      <button
                        type="button"
                        onClick={() => pickLogo(row.id)}
                        disabled={logoUploading}
                        title="Logo hochladen/ändern"
                        className="flex h-[34px] w-[34px] flex-none items-center justify-center overflow-hidden rounded-full bg-[#F5F5F3] text-[hsl(0_0%_45%)] transition-shadow hover:ring-2 hover:ring-primary/50 disabled:opacity-60"
                      >
                        {(row as MarketplaceBrandRow).logo_url ? (
                          <img src={(row as MarketplaceBrandRow).logo_url!} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-foreground">{row.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">/{row.slug}</div>
                    </div>
                    {!isCategory && (row as MarketplaceBrandRow).logo_url && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={ICON_BTN}
                        title="Logo entfernen"
                        onClick={() => saveLogo(row, null)}
                      >
                        <ImageOff className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(checked) =>
                        upsert.mutate({
                          id: row.id,
                          name: row.name,
                          slug: row.slug,
                          sort_order: row.sort_order,
                          is_active: checked,
                        })
                      }
                    />
                    <Button size="icon" variant="ghost" className={ICON_BTN} onClick={() => startEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={ICON_BTN_DANGER}
                      onClick={() => setPendingDelete(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Lösch-Bestätigung — rendert via Radix-Portal über dem offenen Dialog */}
        <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
          <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <AlertDialogHeader className="space-y-[7px] text-left">
              <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
                {isCategory ? "Kategorie wirklich löschen?" : "Marke wirklich löschen?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
                <strong className="text-foreground">{pendingDelete?.name}</strong> wird dauerhaft aus dem
                Katalog entfernt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2.5">
              <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                Abbrechen
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (pendingDelete) del.mutate(pendingDelete.id); }}
                className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
