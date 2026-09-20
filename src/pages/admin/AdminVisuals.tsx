import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useSiteVisuals, useUploadVisual, useDeleteVisualImage, useSetVisualUrl } from "@/hooks/useSiteVisuals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, Loader2, Image as ImageIcon, Check, Play, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { visualSize, formatVisualSize } from "@/lib/visualSizes";

// Keys that accept a URL (YouTube / Vimeo / direct video) instead of / in addition to file upload
// (matches only ".video"/".video-N" as last segment, not keys that merely contain "video")
const isVideoKey = (key: string) => /\.video(-\d+)?$/.test(key);

export default function AdminVisuals() {
  const { data: visuals, isLoading } = useSiteVisuals();
  const uploadMutation = useUploadVisual();
  const deleteMutation = useDeleteVisualImage();
  const setUrlMutation = useSetVisualUrl();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Group visuals by category
  // app.theme.*-Zeilen sind Farbwerte (Admin -> Farben), keine Bilder
  const imageVisuals = visuals?.filter((v) => !v.key.startsWith("app.theme."));
  const groupedVisuals = imageVisuals?.reduce((acc, visual) => {
    if (!acc[visual.category]) {
      acc[visual.category] = [];
    }
    acc[visual.category].push(visual);
    return acc;
  }, {} as Record<string, typeof visuals>);

  const handleFileSelect = async (key: string, file: File) => {
    setUploadingKey(key);
    try {
      await uploadMutation.mutateAsync({ key, file });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleDelete = async (key: string) => {
    await deleteMutation.mutateAsync(key);
  };

  const handleSaveUrl = async (key: string) => {
    // Gleicher Fallback wie die Input-Anzeige — sonst löscht "OK" ohne Eingabe die gespeicherte URL
    const current = visuals?.find((v) => v.key === key);
    const url = urlInputs[key] ?? (current?.image_url || "");
    await setUrlMutation.mutateAsync({ key, url });
    setUrlInputs(prev => ({ ...prev, [key]: "" }));
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="max-w-[700px] text-sm leading-normal text-muted-foreground">
          Alle Bilder auf der Website verwalten. Lade neue Bilder hoch oder setze sie auf den
          Placeholder zurück. Bei jedem Slot steht die empfohlene Größe und das Seitenverhältnis —
          die Maße entsprechen der tatsächlich gerenderten Fläche, doppelt aufgelöst für scharfe
          Darstellung. Bilder werden mittig eingepasst und an den Rändern beschnitten, wenn das
          Verhältnis abweicht. Farbwelten liegen unter{" "}
          <Link to="/admin/farben" className="text-primary transition-colors hover:text-primary/80">
            Farben
          </Link>
          .
        </p>

        {groupedVisuals && Object.entries(groupedVisuals).map(([category, categoryVisuals]) => (
          <Card key={category} className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  {category}
                </h2>
                <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                  {categoryVisuals?.length ?? 0} Slots · {categoryVisuals?.filter((v) => !!v.image_url).length ?? 0} aktiv
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5">
                {categoryVisuals?.map((visual) => {
                  const isUploading = uploadingKey === visual.key;
                  const hasImage = !!visual.image_url;
                  const imageUrl = visual.image_url || visual.placeholder_url;
                  const spec = visualSize(visual.key);
                  // Die Maßangabe stand frueher im Beschreibungstext. Steht dort
                  // noch eine, wird sie entfernt, damit sie nicht doppelt und
                  // womoeglich widersprüchlich erscheint.
                  const cleanDescription = (visual.description ?? "")
                    .replace(/Empfohlene\s+Gr(ö|oe)(ß|ss)e:\s*[^.]*\.?/i, "")
                    .trim();

                  return (
                    <div key={visual.id} className="flex flex-col gap-2.5">
                      {/* Image / Video Preview */}
                      <div className="group relative aspect-square overflow-hidden rounded-[14px] border border-[hsl(0_0%_14%)] bg-white/[0.03]">
                        {isVideoKey(visual.key) && hasImage ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-[11px] bg-[#0A0A0A] p-3.5">
                            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] border border-primary/30 bg-primary/10 text-primary">
                              <Play className="h-[18px] w-[18px]" />
                            </span>
                            <p className="line-clamp-3 break-all text-center font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
                              {visual.image_url}
                            </p>
                          </div>
                        ) : (
                          <img
                            src={imageUrl}
                            alt={visual.label}
                            className={cn("h-full w-full object-cover", !hasImage && "opacity-40")}
                          />
                        )}

                        {/* Status badge */}
                        <span
                          className={cn(
                            "absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/70 px-[9px] py-1 text-[10px] font-bold uppercase tracking-[0.05em] backdrop-blur-[10px]",
                            hasImage
                              ? "border-primary/40 text-primary"
                              : "border-white/[0.18] text-[hsl(0_0%_70%)]"
                          )}
                        >
                          {hasImage ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : (
                            <ImageIcon className="h-2.5 w-2.5" />
                          )}
                          {hasImage ? "Aktiv" : "Placeholder"}
                        </span>

                        {/* Loading overlay */}
                        {isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        )}
                      </div>

                      {/* Label & Description */}
                      <div className="flex flex-col gap-[5px]">
                        <h4 className="text-[13px] font-semibold leading-[1.35] text-foreground">
                          {visual.label}
                        </h4>
                        <div className="flex flex-wrap items-center gap-[7px]">
                          {spec && (
                            <span
                              title={spec.note}
                              className="whitespace-nowrap rounded-md border border-primary/30 bg-primary/10 px-[7px] py-0.5 font-mono text-[9.5px] font-bold tracking-[0.06em] text-primary"
                            >
                              {formatVisualSize(spec)}
                            </span>
                          )}
                          {spec && (
                            <span className="whitespace-nowrap rounded-md border border-[hsl(0_0%_15%)] bg-white/5 px-[7px] py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-[hsl(0_0%_72%)]">
                              {spec.ratio}
                            </span>
                          )}
                          <span className="max-w-full truncate font-mono text-[9.5px] text-muted-foreground/70">
                            {visual.key}
                          </span>
                        </div>
                        {(spec?.note || cleanDescription) && (
                          <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">
                            {spec?.note || cleanDescription}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {isVideoKey(visual.key) ? (
                        /* Video — URL input OR direct file upload */
                        <div className="flex flex-col gap-2">
                          {/* URL */}
                          <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                            <LinkIcon className="h-3 w-3" /> Link (YouTube, Vimeo, .mp4-URL)
                          </p>
                          <div className="flex gap-[7px]">
                            <Input
                              placeholder="https://youtu.be/…"
                              value={urlInputs[visual.key] ?? (visual.image_url || "")}
                              onChange={(e) =>
                                setUrlInputs(prev => ({ ...prev, [visual.key]: e.target.value }))
                              }
                              className="h-8 min-w-0 flex-1 rounded-lg border-[hsl(0_0%_16%)] bg-white/5 px-2.5 font-mono text-[11px]"
                            />
                            <Button
                              size="sm"
                              className="h-8 flex-none rounded-lg px-3 text-[11.5px] font-bold"
                              onClick={() => handleSaveUrl(visual.key)}
                              disabled={setUrlMutation.isPending}
                            >
                              OK
                            </Button>
                          </div>

                          {/* Divider */}
                          <span className="text-center text-[10px] text-muted-foreground/70">oder</span>

                          {/* Direct file upload */}
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[`${visual.key}__video`] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelect(visual.key, file);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full rounded-lg border-dashed border-[hsl(0_0%_20%)] bg-white/5 text-[11.5px] font-bold text-[hsl(0_0%_82%)] hover:border-primary/50 hover:bg-white/5 hover:text-primary"
                            onClick={() => fileInputRefs.current[`${visual.key}__video`]?.click()}
                            disabled={isUploading}
                          >
                            <Upload className="mr-1 h-3 w-3" />
                            {isUploading ? "Wird hochgeladen…" : "Video hochladen (.mp4, .webm)"}
                          </Button>

                          {hasImage && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full rounded-lg border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[11.5px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                              onClick={() => handleDelete(visual.key)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Zurücksetzen
                            </Button>
                          )}
                        </div>
                      ) : (
                        /* Image upload mode */
                        <div className="flex gap-[7px]">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[visual.key] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelect(visual.key, file);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 flex-1 rounded-lg border-[hsl(0_0%_16%)] bg-white/5 text-[11.5px] font-bold text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                            onClick={() => fileInputRefs.current[visual.key]?.click()}
                            disabled={isUploading}
                          >
                            <Upload className="mr-1 h-3 w-3" />
                            {hasImage ? "Ersetzen" : "Hochladen"}
                          </Button>
                          {hasImage && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Auf Placeholder zurücksetzen"
                              className="h-8 w-8 flex-none rounded-lg border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] p-0 text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                              onClick={() => handleDelete(visual.key)}
                              disabled={isUploading || deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        ))}

        {(!groupedVisuals || Object.keys(groupedVisuals).length === 0) && (
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]">
                <ImageIcon className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">Keine Visuals gefunden</p>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
