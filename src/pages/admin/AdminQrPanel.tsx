import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { TranslatableField } from "@/components/admin/TranslatableField";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";
import {
  useQrSections,
  uploadQrFile,
  deleteQrFile,
  validateFile,
  type QrSection,
  type QrLang,
} from "@/hooks/useQrSections";
import { toast } from "sonner";
import {
  AlertTriangle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  FileText,
  ExternalLink,
  X,
  Save,
  Loader2,
} from "lucide-react";

const TRANSLATABLE_FIELDS = ["title", "description"];

const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

interface SectionEditorState {
  title: string;
  title_en: string;
  title_en_locked: boolean;
  description: string;
  description_en: string;
  description_en_locked: boolean;
}

const SectionEditor = ({
  section,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  section: QrSection;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) => {
  const { updateSection } = useQrSections(true);
  const { translateRow } = useTranslateContent();

  const [state, setState] = useState<SectionEditorState>({
    title: section.title ?? "",
    title_en: section.title_en ?? "",
    title_en_locked: section.title_en_locked,
    description: section.description ?? "",
    description_en: section.description_en ?? "",
    description_en_locked: section.description_en_locked,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLang, setUploadingLang] = useState<QrLang | null>(null);
  const [pendingRemoveFile, setPendingRemoveFile] = useState<QrLang | null>(null);
  const fileInputDe = useRef<HTMLInputElement | null>(null);
  const fileInputEn = useRef<HTMLInputElement | null>(null);

  const runTranslate = (id: string) => {
    translateRow({ table: "qr_sections", id, fields: TRANSLATABLE_FIELDS }).then(toastTranslateResult);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSection.mutateAsync({
        id: section.id,
        title: state.title.trim(),
        title_en: state.title_en.trim() || null,
        title_en_locked: state.title_en_locked,
        description: state.description.trim() || null,
        description_en: state.description_en.trim() || null,
        description_en_locked: state.description_en_locked,
      });
      toast.success("Gespeichert");
      runTranslate(section.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisible = async (next: boolean) => {
    try {
      await updateSection.mutateAsync({ id: section.id, is_visible: next });
      toast.success(next ? "Sichtbar" : "Versteckt");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleUpload = async (lang: QrLang, file: File | null | undefined) => {
    if (!file) return;
    const v = validateFile(file);
    if (!v.ok) {
      toast.error("reason" in v ? v.reason : "Ungültige Datei");
      return;
    }
    setUploadingLang(lang);
    try {
      const uploaded = await uploadQrFile(section, lang, file);
      const previousUrl = lang === "de" ? section.file_de_url : section.file_en_url;
      await updateSection.mutateAsync(
        lang === "de"
          ? {
              id: section.id,
              file_de_url: uploaded.url,
              file_de_name: uploaded.name,
              file_de_size_bytes: uploaded.size,
            }
          : {
              id: section.id,
              file_en_url: uploaded.url,
              file_en_name: uploaded.name,
              file_en_size_bytes: uploaded.size,
            },
      );
      if (previousUrl && previousUrl !== uploaded.url) {
        await deleteQrFile(previousUrl).catch(() => null);
      }
      toast.success(`Datei (${lang.toUpperCase()}) hochgeladen`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingLang(null);
      if (lang === "de" && fileInputDe.current) fileInputDe.current.value = "";
      if (lang === "en" && fileInputEn.current) fileInputEn.current.value = "";
    }
  };

  const handleRemoveFile = (lang: QrLang) => {
    const url = lang === "de" ? section.file_de_url : section.file_en_url;
    if (!url) return;
    setPendingRemoveFile(lang);
  };

  const confirmRemoveFile = async (lang: QrLang) => {
    const url = lang === "de" ? section.file_de_url : section.file_en_url;
    if (!url) return;
    try {
      await updateSection.mutateAsync(
        lang === "de"
          ? { id: section.id, file_de_url: null, file_de_name: null, file_de_size_bytes: null }
          : { id: section.id, file_en_url: null, file_en_name: null, file_en_size_bytes: null },
      );
      await deleteQrFile(url).catch(() => null);
      toast.success(`Datei (${lang.toUpperCase()}) entfernt`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-[17px]">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-[11px]">
            <code className="whitespace-nowrap rounded-lg border border-primary/[0.26] bg-primary/[0.09] px-[11px] py-[5px] font-mono text-[12.5px] font-bold text-primary">
              /{section.slug}
            </code>
            <label className="inline-flex cursor-pointer items-center gap-2.5">
              <Switch
                checked={section.is_visible}
                onCheckedChange={handleToggleVisible}
              />
              <span
                className={`whitespace-nowrap text-xs font-bold ${
                  section.is_visible ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {section.is_visible ? "Sichtbar" : "Versteckt"}
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={isFirst}
              onClick={onMoveUp}
              title="Nach oben"
              className="h-8 w-8 rounded-[9px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={isLast}
              onClick={onMoveDown}
              title="Nach unten"
              className="h-8 w-8 rounded-[9px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Sektion löschen"
              className="h-8 w-8 rounded-[9px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Translatable fields */}
        <div className="flex flex-col gap-[11px]">
          <TranslatableField
            label="Titel"
            deValue={state.title}
            onDeChange={(v) => setState((s) => ({ ...s, title: v }))}
            enValue={state.title_en}
            onEnChange={(v) => setState((s) => ({ ...s, title_en: v }))}
            locked={state.title_en_locked}
            onLockedChange={(v) => setState((s) => ({ ...s, title_en_locked: v }))}
            placeholder="z. B. Für Vereine"
          />
          <TranslatableField
            label="Beschreibung"
            multiline
            rows={3}
            deValue={state.description}
            onDeChange={(v) => setState((s) => ({ ...s, description: v }))}
            enValue={state.description_en}
            onEnChange={(v) => setState((s) => ({ ...s, description_en: v }))}
            locked={state.description_en_locked}
            onLockedChange={(v) => setState((s) => ({ ...s, description_en_locked: v }))}
            placeholder="Worum geht es in dieser Sektion?"
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="h-9 self-start rounded-[10px] px-[15px] text-[12.5px] font-bold"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Texte speichern
          </Button>
        </div>

        {/* File uploads */}
        <div className="flex flex-col gap-[11px] border-t border-[hsl(0_0%_12%)] pt-[15px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Downloads
            </span>
            <span className="text-[11.5px] text-muted-foreground/80">
              PDF / PNG / JPG / WEBP · max. 25 MB
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["de", "en"] as const).map((lang) => {
              const url = lang === "de" ? section.file_de_url : section.file_en_url;
              const name = lang === "de" ? section.file_de_name : section.file_en_name;
              const size = lang === "de" ? section.file_de_size_bytes : section.file_en_size_bytes;
              const ref = lang === "de" ? fileInputDe : fileInputEn;
              return (
                <div
                  key={lang}
                  className="flex flex-col gap-[9px] rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.028] p-3.5"
                >
                  <span
                    className={`self-start whitespace-nowrap rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] uppercase tracking-[0.16em] ${
                      lang === "de"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] text-[#7FD4FF]"
                    }`}
                  >
                    {lang.toUpperCase()}
                  </span>
                  {url ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-[11px] rounded-[11px] border border-[hsl(0_0%_15%)] bg-white/[0.04] px-3 py-[11px]">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/[0.28] bg-primary/10 text-primary">
                          <FileText className="h-[15px] w-[15px]" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="truncate text-[12.5px] font-semibold text-foreground" title={name ?? ""}>
                            {name ?? "Datei"}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                            {formatSize(size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(lang)}
                          title="Entfernen"
                          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] transition-colors hover:bg-[hsl(0_100%_71%/0.16)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                        >
                          Öffnen
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ref.current?.click()}
                          disabled={uploadingLang === lang}
                          className="h-7 rounded-lg border-[hsl(0_0%_16%)] bg-white/5 px-[11px] text-[11.5px] font-bold text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                        >
                          {uploadingLang === lang ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="mr-1.5 h-3 w-3" />
                          )}
                          Ersetzen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => ref.current?.click()}
                      disabled={uploadingLang === lang}
                      className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-[11px] border border-dashed border-[hsl(0_0%_20%)] bg-white/[0.028] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-white/[0.028] hover:text-muted-foreground"
                    >
                      {uploadingLang === lang ? (
                        <Loader2 className="h-[18px] w-[18px] animate-spin" />
                      ) : (
                        <Upload className="h-[18px] w-[18px]" />
                      )}
                      <span className="text-xs">PDF hochladen (max. 25 MB)</span>
                    </Button>
                  )}
                  <Input
                    ref={ref}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleUpload(lang, e.target.files?.[0])}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!pendingRemoveFile}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveFile(null);
        }}
      >
        <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Datei wirklich entfernen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              Die Datei{" "}
              <strong className="text-foreground">
                {(pendingRemoveFile === "de" ? section.file_de_name : section.file_en_name) ?? "Datei"}
              </strong>{" "}
              ({pendingRemoveFile?.toUpperCase()}) wird aus dieser Sektion entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoveFile) confirmRemoveFile(pendingRemoveFile);
              }}
              className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const AdminQrPanel = () => {
  const { data: sections = [], isLoading, createSection, deleteSection, reorderSections } =
    useQrSections(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QrSection | null>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createSection.mutateAsync({ title: newTitle.trim() });
      setNewTitle("");
      toast.success("Sektion angelegt");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const ordered = [...sections];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    try {
      await reorderSections.mutateAsync(ordered.map((s) => s.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const confirmDelete = async (section: QrSection) => {
    try {
      await deleteSection.mutateAsync(section);
      toast.success("Sektion gelöscht");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <div className="flex flex-wrap items-center gap-[11px]">
          <p className="max-w-[640px] text-sm text-muted-foreground">
            Inhalte für die Visitenkarten-Landingpage{" "}
            <code className="font-mono text-[13px] text-primary">/qr</code> — Sektionen, Texte und
            PDFs verwalten.
          </p>
          <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-primary/[0.28] bg-primary/[0.09] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
            <span className="h-[5px] w-[5px] rounded-full bg-primary" />
            Sofort live
          </span>
          <a
            href="/qr"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 px-[13px] text-[12.5px] font-bold text-[hsl(0_0%_85%)] transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Live-Seite öffnen
          </a>
        </div>

        {/* Add new */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-[11px]">
            <label className="flex min-w-[min(240px,100%)] flex-1 flex-col gap-[7px]">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Neue Sektion<span className="text-primary"> *</span>
              </span>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Neue Sektion (z. B. „Pressekit“)"
                className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </label>
            <Button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="h-10 rounded-[10px] px-[17px] text-[13px] font-bold"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Hinzufügen
            </Button>
          </div>
        </Card>

        {/* Sections list */}
        {isLoading ? (
          <div className="flex flex-col gap-3.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-64 animate-pulse rounded-2xl border-border bg-muted/30" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <Card className="rounded-2xl border-border bg-gradient-card p-10 text-center text-sm text-muted-foreground">
            Noch keine Sektion. Leg oben eine an.
          </Card>
        ) : (
          <div className="flex flex-col gap-3.5">
            {sections.map((section, index) => (
              <SectionEditor
                key={section.id}
                section={section}
                isFirst={index === 0}
                isLast={index === sections.length - 1}
                onMoveUp={() => handleMove(index, -1)}
                onMoveDown={() => handleMove(index, 1)}
                onDelete={() => setPendingDelete(section)}
              />
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
              Sektion wirklich löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              Die Sektion <strong className="text-foreground">„{pendingDelete?.title}“</strong> wird
              gelöscht. Hochgeladene Dateien werden mit entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) confirmDelete(pendingDelete);
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

export default AdminQrPanel;
