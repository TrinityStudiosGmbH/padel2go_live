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

export interface Brand {
  id?: string;
  name: string;
  brand_type: string;
  logo_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  sort_order: number;
}

interface BrandManagerProps {
  brands: Brand[];
  onChange: (brands: Brand[]) => void;
}

const BRAND_TYPES = [
  { value: "sponsor", label: "Sponsor" },
  { value: "partner", label: "Partner" },
  { value: "media_partner", label: "Medienpartner" },
  { value: "equipment", label: "Equipment-Partner" },
  { value: "food_drinks", label: "Food & Drinks" },
  { value: "other", label: "Sonstige" },
];

export function BrandManager({ brands, onChange }: BrandManagerProps) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const addBrand = () => {
    onChange([
      ...brands,
      {
        name: "",
        brand_type: "sponsor",
        logo_url: null,
        website_url: null,
        instagram_url: null,
        sort_order: brands.length,
      },
    ]);
  };

  const removeBrand = (index: number) => {
    const updated = brands.filter((_, i) => i !== index);
    onChange(updated.map((b, i) => ({ ...b, sort_order: i })));
  };

  const updateBrand = (index: number, field: keyof Brand, value: string | null) => {
    const updated = [...brands];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleLogoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIndex(index);
    try {
      const url = await uploadMediaFile(file, `brands/${Date.now()}-${index}`);
      updateBrand(index, "logo_url", url);
      toast.success("Logo hochgeladen");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Hochladen");
    } finally {
      setUploadingIndex(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[15px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[17px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="font-display text-sm font-bold tracking-tight text-foreground">Partner & Brands</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addBrand}
          className="h-8 gap-1.5 rounded-[9px] border-primary/30 bg-primary/[0.09] px-3 text-[12.5px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Brand hinzufügen
        </Button>
      </div>

      {brands.length === 0 ? (
        <div className="rounded-[13px] border border-dashed border-[hsl(0_0%_20%)] py-8 text-center text-sm text-muted-foreground">
          Noch keine Brands hinzugefügt
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {brands.map((brand, index) => (
            <div
              key={index}
              className="flex flex-col gap-4 rounded-[13px] border border-[hsl(0_0%_13%)] bg-white/[0.03] p-[13px]"
            >
              <div className="flex items-start gap-3">

                {/* Logo Upload */}
                <div className="shrink-0">
                  {brand.logo_url ? (
                    <div className="relative h-16 w-16 overflow-hidden rounded-[11px] bg-[#F5F5F3] p-1">
                      <img
                        src={brand.logo_url}
                        alt={brand.name}
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => updateBrand(index, "logo_url", null)}
                        className="absolute right-0 top-0 rounded-bl-[9px] bg-[#FF6B6B] p-1 text-[#0A0A0A]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-[11px] bg-[#F5F5F3] transition-opacity hover:opacity-85">
                      {uploadingIndex === index ? (
                        <div className="animate-pulse text-xs text-[hsl(0_0%_45%)]">...</div>
                      ) : (
                        <ImageIcon className="h-5 w-5 text-[hsl(0_0%_45%)]" />
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(index, e)}
                        disabled={uploadingIndex === index}
                      />
                    </label>
                  )}
                </div>

                {/* Name & Type */}
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-[6px]">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Name<span className="text-primary"> *</span>
                    </Label>
                    <Input
                      placeholder="Brand Name"
                      value={brand.name}
                      onChange={(e) => updateBrand(index, "name", e.target.value)}
                      className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]"
                    />
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Typ</Label>
                    <Select
                      value={brand.brand_type}
                      onValueChange={(v) => updateBrand(index, "brand_type", v)}
                    >
                      <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
                        {BRAND_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                  onClick={() => removeBrand(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Links */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:pl-11">
                <div className="flex flex-col gap-[6px]">
                  <Label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Globe className="h-3 w-3" /> Website
                  </Label>
                  <Input
                    placeholder="https://..."
                    value={brand.website_url || ""}
                    onChange={(e) => updateBrand(index, "website_url", e.target.value || null)}
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]"
                  />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <Label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Instagram className="h-3 w-3" /> Instagram
                  </Label>
                  <Input
                    placeholder="@brandname"
                    value={brand.instagram_url || ""}
                    onChange={(e) => updateBrand(index, "instagram_url", e.target.value || null)}
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
