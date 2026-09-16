import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MapPin, X, Image as ImageIcon, Clock, Trophy, Brain, ShoppingCart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "sonner";
import { Location, WEEKDAYS } from "./types";
import { COURT_FEATURES, extractFeatures, type CourtFeatureKey } from "@/lib/courtFeatures";

interface LocationFormProps {
  location?: Location;
  onSuccess: () => void;
}

export function LocationForm({ location, onSuccess }: LocationFormProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: location?.name || "",
    slug: location?.slug || "",
    description: location?.description || "",
    whatsapp_group_url: location?.whatsapp_group_url || "",
    address: location?.address || "",
    postal_code: location?.postal_code || "",
    city: location?.city || "",
    country: location?.country || "DE",
    is_online: location?.is_online || false,
    is_24_7: location?.is_24_7 || false,
    opening_hours_json: location?.opening_hours_json || {
      monday: { open: "06:00", close: "23:00" },
      tuesday: { open: "06:00", close: "23:00" },
      wednesday: { open: "06:00", close: "23:00" },
      thursday: { open: "06:00", close: "23:00" },
      friday: { open: "06:00", close: "23:00" },
      saturday: { open: "06:00", close: "23:00" },
      sunday: { open: "06:00", close: "23:00" },
    },
    rewards_enabled: location?.rewards_enabled ?? true,
    ai_analysis_enabled: location?.ai_analysis_enabled ?? true,
    vending_enabled: location?.vending_enabled ?? false,
    features_json: extractFeatures(location?.features_json as Record<string, unknown> | null),
  });
  const [mainImageUrl, setMainImageUrl] = useState(location?.main_image_url || "");
  const [tennisImageUrl, setTennisImageUrl] = useState(location?.tennis_image_url || "");
  const [uploading, setUploading] = useState(false);
  

  const isEditing = !!location;

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[äöüß]/g, (char) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[char] || char))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleNameChange = (name: string) => {
    setFormData((p) => ({
      ...p,
      name,
      slug: isEditing ? p.slug : generateSlug(name),
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const wa = formData.whatsapp_group_url.trim();
      if (wa && !wa.startsWith("https://")) {
        throw new Error("WhatsApp-Link muss mit https:// beginnen");
      }
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        whatsapp_group_url: formData.whatsapp_group_url.trim() || null,
        address: formData.address || null,
        postal_code: formData.postal_code || null,
        city: formData.city || null,
        country: formData.country,
        is_online: formData.is_online,
        is_24_7: formData.is_24_7,
        opening_hours_json: formData.opening_hours_json,
        main_image_url: mainImageUrl || null,
        tennis_image_url: tennisImageUrl || null,
        rewards_enabled: formData.rewards_enabled,
        ai_analysis_enabled: formData.ai_analysis_enabled,
        vending_enabled: formData.vending_enabled,
        features_json: formData.features_json,
        // `tennis_image_url` fehlt noch in den generierten Supabase-Typen
        // (Migration 20260812100000) — daher der Cast wie bei `label` in courts.
      } as any;

      if (isEditing) {
        const { error } = await supabase
          .from("locations")
          .update(payload)
          .eq("id", location.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("locations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Standort aktualisiert" : "Standort erstellt");
      // Mirror the change into every view that reads location data so the
      // club manager panel ("Ausstattung & Merkmale") and public booking
      // pages reflect the new state without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["club-court-features"] });
      queryClient.invalidateQueries({ queryKey: ["booking-location"] });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error.message || "Fehler beim Speichern");
    },
  });

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "main" | "tennis"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMediaFile(file, `locations/${Date.now()}`);

      if (type === "main") {
        setMainImageUrl(url);
      } else {
        setTennisImageUrl(url);
      }
      toast.success("Bild hochgeladen");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Hochladen");
    } finally {
      setUploading(false);
    }
  };



  const updateOpeningHours = (day: string, field: "open" | "close", value: string) => {
    setFormData((p) => ({
      ...p,
      opening_hours_json: {
        ...p.opening_hours_json,
        [day]: {
          ...p.opening_hours_json[day],
          [field]: value,
        },
      },
    }));
  };

  const isValid = formData.name.trim() && formData.slug.trim();

  return (
    <div className="space-y-6">
      {/* Standort-Ansichten: Hauptbild = Padel, Tennis-Bild = Tennis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Hauptbild (Padel-Ansicht)</Label>
          {mainImageUrl ? (
            <div className="relative w-full h-48 rounded-lg overflow-hidden">
              <img src={mainImageUrl} alt="Padel-Ansicht" className="w-full h-full object-cover" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => setMainImageUrl("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <div className="animate-pulse text-muted-foreground">Hochladen...</div>
                ) : (
                  <>
                    <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Hauptbild hochladen</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, "main")}
                disabled={uploading}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Standardbild des Standorts — wird für Padel-Courts gezeigt.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Tennis-Bild (Tennis-Ansicht)</Label>
          {tennisImageUrl ? (
            <div className="relative w-full h-48 rounded-lg overflow-hidden">
              <img src={tennisImageUrl} alt="Tennis-Ansicht" className="w-full h-full object-cover" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => setTennisImageUrl("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <div className="animate-pulse text-muted-foreground">Hochladen...</div>
                ) : (
                  <>
                    <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Tennis-Bild hochladen</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, "tennis")}
                disabled={uploading}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Wird für Tennis-Courts gezeigt. Ohne Tennis-Bild gilt das Hauptbild.
          </p>
        </div>
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Standortname"
            className="bg-background border-border"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug *</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData((p) => ({ ...p, slug: e.target.value }))}
            placeholder="standort-slug"
            className="bg-background border-border"
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          placeholder="Beschreibung des Standorts..."
          className="bg-background border-border min-h-[100px]"
        />
      </div>

      {/* WhatsApp-Gruppe */}
      <div className="space-y-2">
        <Label htmlFor="whatsapp_group_url">WhatsApp-Gruppe (Einladungslink)</Label>
        <Input
          id="whatsapp_group_url"
          value={formData.whatsapp_group_url}
          onChange={(e) => setFormData((p) => ({ ...p, whatsapp_group_url: e.target.value }))}
          placeholder="https://chat.whatsapp.com/..."
          className="bg-background border-border"
        />
        <p className="text-xs text-muted-foreground">
          Erscheint als WhatsApp-Button auf der Standort-Kachel und in der Buchungsmaske. Leer lassen = kein Button.
        </p>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Adresse
        </h3>
        <div className="space-y-2">
          <Label htmlFor="address">Straße und Hausnummer</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
            placeholder="Musterstraße 123"
            className="bg-background border-border"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="postal_code">PLZ</Label>
            <Input
              id="postal_code"
              value={formData.postal_code}
              onChange={(e) => setFormData((p) => ({ ...p, postal_code: e.target.value }))}
              placeholder="12345"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Stadt</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
              placeholder="Musterstadt"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Land</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      {/* Status Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="is_online" className="text-foreground">Online</Label>
            <p className="text-xs text-muted-foreground">Im Frontend sichtbar</p>
          </div>
          <Switch
            id="is_online"
            checked={formData.is_online}
            onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_online: checked }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="is_24_7" className="text-foreground">24/7 geöffnet</Label>
            <p className="text-xs text-muted-foreground">Rund um die Uhr verfügbar</p>
          </div>
          <Switch
            id="is_24_7"
            checked={formData.is_24_7}
            onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_24_7: checked }))}
          />
        </div>
      </div>

      {/* Feature Toggles - Main Platform Features */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4" /> Plattform-Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-secondary/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <Label htmlFor="rewards_enabled" className="text-foreground">Rewards</Label>
            </div>
            <Switch
              id="rewards_enabled"
              checked={formData.rewards_enabled}
              onCheckedChange={(checked) => setFormData((p) => ({ ...p, rewards_enabled: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-400" />
              <Label htmlFor="ai_analysis_enabled" className="text-foreground">KI-Analyse</Label>
            </div>
            <Switch
              id="ai_analysis_enabled"
              checked={formData.ai_analysis_enabled}
              onCheckedChange={(checked) => setFormData((p) => ({ ...p, ai_analysis_enabled: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-orange-400" />
              <Label htmlFor="vending_enabled" className="text-foreground">Automaten</Label>
            </div>
            <Switch
              id="vending_enabled"
              checked={formData.vending_enabled}
              onCheckedChange={(checked) => setFormData((p) => ({ ...p, vending_enabled: checked }))}
            />
          </div>
        </div>
      </div>

      {/* Court Features from central definition */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Ausstattung & Merkmale
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-secondary/50 rounded-lg">
          {COURT_FEATURES.map(({ key, label, icon: Icon, description }) => (
            <div key={key} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/80 transition-colors">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor={`feature-${key}`} className="text-foreground text-sm cursor-pointer">{label}</Label>
                  <p className="text-xs text-muted-foreground hidden md:block">{description}</p>
                </div>
              </div>
              <Switch
                id={`feature-${key}`}
                checked={formData.features_json[key as CourtFeatureKey] || false}
                onCheckedChange={(checked) => setFormData((p) => ({ 
                  ...p, 
                  features_json: { ...p.features_json, [key]: checked } 
                }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Opening Hours */}
      {!formData.is_24_7 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Öffnungszeiten
          </h3>
          <div className="space-y-2">
            {WEEKDAYS.map((day) => (
              <div key={day.key} className="grid grid-cols-3 gap-2 items-center">
                <Label className="text-sm">{day.label}</Label>
                <Input
                  type="time"
                  value={formData.opening_hours_json[day.key]?.open || "06:00"}
                  onChange={(e) => updateOpeningHours(day.key, "open", e.target.value)}
                  className="bg-background border-border"
                />
                <Input
                  type="time"
                  value={formData.opening_hours_json[day.key]?.close || "23:00"}
                  onChange={(e) => updateOpeningHours(day.key, "close", e.target.value)}
                  className="bg-background border-border"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <Button
        className="w-full bg-primary text-primary-foreground"
        onClick={() => saveMutation.mutate()}
        disabled={!isValid || saveMutation.isPending}
      >
        {saveMutation.isPending ? "Speichern..." : isEditing ? "Aktualisieren" : "Erstellen"}
      </Button>
    </div>
  );
}
