import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Instagram, Globe, Image as ImageIcon, X } from "lucide-react";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "sonner";

export interface Artist {
  id?: string;
  name: string;
  role: string;
  image_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
  sort_order: number;
}

interface ArtistManagerProps {
  artists: Artist[];
  onChange: (artists: Artist[]) => void;
}

const ARTIST_ROLES = [
  { value: "DJ", label: "DJ" },
  { value: "live_act", label: "Live Act" },
  { value: "host", label: "Host / Moderator" },
  { value: "trainer", label: "Trainer / Coach" },
  { value: "pro_player", label: "Pro-Spieler" },
  { value: "influencer", label: "Influencer" },
  { value: "other", label: "Sonstige" },
];

export function ArtistManager({ artists, onChange }: ArtistManagerProps) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const addArtist = () => {
    onChange([
      ...artists,
      {
        name: "",
        role: "DJ",
        image_url: null,
        instagram_url: null,
        website_url: null,
        sort_order: artists.length,
      },
    ]);
  };

  const removeArtist = (index: number) => {
    const updated = artists.filter((_, i) => i !== index);
    onChange(updated.map((a, i) => ({ ...a, sort_order: i })));
  };

  const updateArtist = (index: number, field: keyof Artist, value: string | null) => {
    const updated = [...artists];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIndex(index);
    try {
      const url = await uploadMediaFile(file, `artists/${Date.now()}-${index}`);
      updateArtist(index, "image_url", url);
      toast.success("Bild hochgeladen");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Hochladen");
    } finally {
      setUploadingIndex(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[15px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[17px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="font-display text-sm font-bold tracking-tight text-foreground">Artists & Performer</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addArtist}
          className="h-8 gap-1.5 rounded-[9px] border-primary/30 bg-primary/[0.09] px-3 text-[12.5px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Artist hinzufügen
        </Button>
      </div>

      {artists.length === 0 ? (
        <div className="rounded-[13px] border border-dashed border-[hsl(0_0%_20%)] py-8 text-center text-sm text-muted-foreground">
          Noch keine Artists hinzugefügt
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {artists.map((artist, index) => (
            <div
              key={index}
              className="flex flex-col gap-4 rounded-[13px] border border-[hsl(0_0%_13%)] bg-white/[0.03] p-[13px]"
            >
              <div className="flex items-start gap-3">

                {/* Image Upload */}
                <div className="shrink-0">
                  {artist.image_url ? (
                    <div className="relative h-16 w-16 overflow-hidden rounded-[11px] border border-[hsl(0_0%_16%)]">
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => updateArtist(index, "image_url", null)}
                        className="absolute right-0 top-0 rounded-bl-[9px] bg-[#FF6B6B] p-1 text-[#0A0A0A]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-[11px] border border-dashed border-[hsl(0_0%_20%)] bg-white/5 transition-colors hover:border-primary/50">
                      {uploadingIndex === index ? (
                        <div className="animate-pulse text-xs text-muted-foreground">...</div>
                      ) : (
                        <ImageIcon className="h-5 w-5 text-[hsl(0_0%_55%)]" />
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(index, e)}
                        disabled={uploadingIndex === index}
                      />
                    </label>
                  )}
                </div>

                {/* Name & Role */}
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-[6px]">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Name<span className="text-primary"> *</span>
                    </Label>
                    <Input
                      placeholder="Artist Name"
                      value={artist.name}
                      onChange={(e) => updateArtist(index, "name", e.target.value)}
                      className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]"
                    />
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Rolle</Label>
                    <Select
                      value={artist.role}
                      onValueChange={(v) => updateArtist(index, "role", v)}
                    >
                      <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                        {ARTIST_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-[30px] w-[30px] shrink-0 rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                  onClick={() => removeArtist(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Social Links */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:pl-11">
                <div className="flex flex-col gap-[6px]">
                  <Label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Instagram className="h-3 w-3" /> Instagram
                  </Label>
                  <Input
                    placeholder="@username"
                    value={artist.instagram_url || ""}
                    onChange={(e) => updateArtist(index, "instagram_url", e.target.value || null)}
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]"
                  />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <Label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Globe className="h-3 w-3" /> Website
                  </Label>
                  <Input
                    placeholder="https://..."
                    value={artist.website_url || ""}
                    onChange={(e) => updateArtist(index, "website_url", e.target.value || null)}
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
