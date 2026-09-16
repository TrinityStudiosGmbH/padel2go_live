import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "sonner";
import { ArtistManager, BrandManager, HighlightsInput } from "@/components/admin/events";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";
import type { Artist } from "./ArtistManager";
import type { Brand } from "./BrandManager";

export const EVENT_TRANSLATE_FIELDS = ["title", "description", "price_label", "highlights"];

export interface Event {
  id: string;
  location_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  ticket_url: string;
  is_published: boolean;
  featured: boolean;
  venue_name: string | null;
  event_type: string | null;
  price_label: string | null;
  price_cents: number | null;
  capacity: number | null;
  highlights: string[] | null;
  created_at: string;
  updated_at: string;
  locations?: { id: string; name: string } | null;
}

export interface Location {
  id: string;
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

export const EVENT_TYPES = [
  { value: "party", label: "Party / Social Event" },
  { value: "open_play", label: "Open-Play-Night" },
  { value: "tournament", label: "Turnier" },
  { value: "corporate", label: "Corporate Event" },
  { value: "workshop", label: "Workshop / Clinic" },
  { value: "season_opening", label: "Season Opening" },
  { value: "popup", label: "Pop-Up Event" },
  { value: "other", label: "Sonstiges" },
];

interface EventFormProps {
  event?: Event;
  locations: Location[];
  onSuccess: () => void;
}

export function EventForm({ event, locations, onSuccess }: EventFormProps) {
  const queryClient = useQueryClient();
  const { translateRow } = useTranslateContent();
  const [formData, setFormData] = useState({
    location_id: event?.location_id || "",
    title: event?.title || "",
    venue_name: event?.venue_name || "",
    description: event?.description || "",
    address_line1: event?.address_line1 || "",
    postal_code: event?.postal_code || "",
    city: event?.city || "",
    start_at: event?.start_at ? event.start_at.slice(0, 16) : "",
    end_at: event?.end_at ? event.end_at.slice(0, 16) : "",
    ticket_url: event?.ticket_url || "",
    is_published: event?.is_published || false,
    featured: event?.featured || false,
    event_type: event?.event_type || "party",
    price_label: event?.price_label || "",
    capacity: event?.capacity?.toString() || "",
  });
  const [imageUrl, setImageUrl] = useState(event?.image_url || "");
  const [highlights, setHighlights] = useState<string[]>(event?.highlights || []);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const isEditing = !!event;

  // Load artists and brands when editing
  useEffect(() => {
    if (event?.id) {
      setLoadingRelated(true);
      Promise.all([
        supabase
          .from("event_artists")
          .select("*")
          .eq("event_id", event.id)
          .order("sort_order"),
        supabase
          .from("event_brands")
          .select("*")
          .eq("event_id", event.id)
          .order("sort_order"),
      ])
        .then(([artistsRes, brandsRes]) => {
          if (artistsRes.data) setArtists(artistsRes.data);
          if (brandsRes.data) setBrands(brandsRes.data);
        })
        .finally(() => setLoadingRelated(false));
    }
  }, [event?.id]);

  const createEventMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        location_id: formData.location_id,
        title: formData.title,
        venue_name: formData.venue_name || null,
        description: formData.description || null,
        address_line1: formData.address_line1 || null,
        postal_code: formData.postal_code || null,
        city: formData.city || null,
        ticket_url: formData.ticket_url || null,
        is_published: formData.is_published,
        featured: formData.featured,
        event_type: formData.event_type,
        price_label: formData.price_label || null,
        image_url: imageUrl || null,
        start_at: formData.start_at ? new Date(formData.start_at).toISOString() : null,
        end_at: formData.end_at ? new Date(formData.end_at).toISOString() : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        highlights: highlights.length > 0 ? highlights : null,
      };

      let eventId = event?.id;

      if (isEditing) {
        const { error } = await supabase
          .from("events")
          .update(payload)
          .eq("id", event.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        eventId = data.id;
      }

      // Sync artists
      if (eventId) {
        // Delete existing artists
        await supabase.from("event_artists").delete().eq("event_id", eventId);

        // Insert new artists
        if (artists.length > 0) {
          const artistPayload = artists
            .filter((a) => a.name.trim())
            .map((a, i) => ({
              event_id: eventId,
              name: a.name,
              role: a.role,
              image_url: a.image_url,
              instagram_url: a.instagram_url,
              website_url: a.website_url,
              sort_order: i,
            }));
          if (artistPayload.length > 0) {
            const { error: artistError } = await supabase
              .from("event_artists")
              .insert(artistPayload);
            if (artistError) console.error("Artist insert error:", artistError);
          }
        }

        // Delete existing brands
        await supabase.from("event_brands").delete().eq("event_id", eventId);

        // Insert new brands
        if (brands.length > 0) {
          const brandPayload = brands
            .filter((b) => b.name.trim())
            .map((b, i) => ({
              event_id: eventId,
              name: b.name,
              brand_type: b.brand_type,
              logo_url: b.logo_url,
              website_url: b.website_url,
              instagram_url: b.instagram_url,
              sort_order: i,
            }));
          if (brandPayload.length > 0) {
            const { error: brandError } = await supabase
              .from("event_brands")
              .insert(brandPayload);
            if (brandError) console.error("Brand insert error:", brandError);
          }
        }
      }

      return eventId;
    },
    onSuccess: (eventId) => {
      toast.success(isEditing ? "Event aktualisiert" : "Event erstellt");
      queryClient.invalidateQueries({ queryKey: ["public-events"] });
      if (eventId) {
        translateRow({ table: "events", id: eventId, fields: EVENT_TRANSLATE_FIELDS }).then((result) => {
          toastTranslateResult(result);
          queryClient.invalidateQueries({ queryKey: ["public-events"] });
          queryClient.invalidateQueries({ queryKey: ["admin-events"] });
        });
      }
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error.message || "Fehler beim Speichern");
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      setImageUrl(await uploadMediaFile(file, `events/${Date.now()}`));
      toast.success("Bild hochgeladen");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Hochladen");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUrl("");
  };

  const isValid = formData.title.trim() && formData.location_id;

  return (
    <div className="flex flex-col gap-[22px]">
      {/* Image Upload */}
      <div className="flex flex-col gap-[9px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Event-Bild
        </Label>
        {imageUrl ? (
          <div className="relative h-48 w-full overflow-hidden rounded-[15px] border border-[hsl(0_0%_14%)]">
            <img src={imageUrl} alt="Event" className="h-full w-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-[9px] bg-[#FF6B6B] text-[#0A0A0A] hover:bg-[#FF6B6B]/90"
              onClick={removeImage}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label className="flex h-[130px] w-full cursor-pointer items-center justify-center gap-[11px] rounded-[15px] border border-dashed border-[hsl(0_0%_20%)] bg-white/[0.028] transition-colors hover:border-primary/50">
            {uploading ? (
              <div className="animate-pulse text-[13px] text-muted-foreground">Hochladen...</div>
            ) : (
              <>
                <ImagePlus className="h-5 w-5 text-[hsl(0_0%_58%)]" />
                <p className="text-[13px] text-[hsl(0_0%_65%)]">Klicken zum Hochladen</p>
              </>
            )}
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[13px]">
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="location" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Standort<span className="text-primary"> *</span>
          </Label>
          <Select
            value={formData.location_id}
            onValueChange={(v) => {
              const loc = locations.find((l) => l.id === v);
              setFormData((p) => ({
                ...p,
                location_id: v,
                // Auto-fill the event address from the selected location (Verein),
                // if the location has one stored. Fields stay editable.
                venue_name: p.venue_name || loc?.name || "",
                address_line1: loc?.address ?? p.address_line1,
                postal_code: loc?.postal_code ?? p.postal_code,
                city: loc?.city ?? p.city,
              }));
            }}
          >
            <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
              <SelectValue placeholder="Standort wählen" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="event_type" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Event-Typ
          </Label>
          <Select
            value={formData.event_type}
            onValueChange={(v) => setFormData((p) => ({ ...p, event_type: v }))}
          >
            <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
              {EVENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="title" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Titel<span className="text-primary"> *</span>
          </Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            placeholder="Event-Titel"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
        {isEditing && event?.slug && (
          <div className="flex flex-col gap-[7px]">
            <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Slug (auto-generiert)
            </Label>
            <Input
              value={event.slug}
              readOnly
              className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[12.5px] text-muted-foreground"
            />
          </div>
        )}
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="venue_name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Venue / Location Name
          </Label>
          <Input
            id="venue_name"
            value={formData.venue_name}
            onChange={(e) => setFormData((p) => ({ ...p, venue_name: e.target.value }))}
            placeholder="z.B. Padel Club Berlin"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="address" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Adresse
          </Label>
          <Input
            id="address"
            value={formData.address_line1}
            onChange={(e) => setFormData((p) => ({ ...p, address_line1: e.target.value }))}
            placeholder="Straße und Hausnummer"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="postal_code" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            PLZ
          </Label>
          <Input
            id="postal_code"
            value={formData.postal_code}
            onChange={(e) => setFormData((p) => ({ ...p, postal_code: e.target.value }))}
            placeholder="12345"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="city" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Stadt
          </Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
            placeholder="Stadt"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="start_at" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Startdatum
          </Label>
          <Input
            id="start_at"
            type="datetime-local"
            value={formData.start_at}
            onChange={(e) => setFormData((p) => ({ ...p, start_at: e.target.value }))}
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="end_at" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Enddatum
          </Label>
          <Input
            id="end_at"
            type="datetime-local"
            value={formData.end_at}
            onChange={(e) => setFormData((p) => ({ ...p, end_at: e.target.value }))}
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="ticket_url" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Externer Ticket-Link (optional)
          </Label>
          <Input
            id="ticket_url"
            type="url"
            value={formData.ticket_url}
            onChange={(e) => setFormData((p) => ({ ...p, ticket_url: e.target.value }))}
            placeholder="Leer lassen = Buchung über die Plattform"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
          <p className="text-[11.5px] leading-snug text-[hsl(0_0%_58%)]">
            Ohne Link wird das Event direkt über PADEL2GO gebucht (kein externer Anbieter).
          </p>
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="capacity" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Kapazität
          </Label>
          <Input
            id="capacity"
            type="number"
            value={formData.capacity}
            onChange={(e) => setFormData((p) => ({ ...p, capacity: e.target.value }))}
            placeholder="100"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="price_label" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Preis-Anzeige
          </Label>
          <Input
            id="price_label"
            value={formData.price_label}
            onChange={(e) => setFormData((p) => ({ ...p, price_label: e.target.value }))}
            placeholder="z.B. €15 / Gratis für Members"
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
          />
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-[7px]">
        <Label htmlFor="description" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Beschreibung
        </Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          placeholder="Beschreibung des Events..."
          className="min-h-[100px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] leading-relaxed"
        />
      </div>

      {/* Highlights */}
      <HighlightsInput highlights={highlights} onChange={setHighlights} />

      {/* Artists */}
      {loadingRelated ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Lade Artists & Brands...</div>
      ) : (
        <>
          <ArtistManager artists={artists} onChange={setArtists} />

          {/* Brands */}
          <BrandManager brands={brands} onChange={setBrands} />
        </>
      )}

      {/* Featured & Published */}
      <div className="flex flex-col gap-[11px]">
        <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.028] px-[15px] py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Label htmlFor="featured" className="text-[13.5px] font-bold text-foreground">Featured Event</Label>
            <p className="text-xs text-muted-foreground">
              Wird als Haupt-Event auf der Events-Seite hervorgehoben
            </p>
          </div>
          <Switch
            id="featured"
            checked={formData.featured}
            onCheckedChange={(checked) => setFormData((p) => ({ ...p, featured: checked }))}
          />
        </div>
        <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.028] px-[15px] py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Label htmlFor="is_published" className="text-[13.5px] font-bold text-foreground">Veröffentlicht</Label>
            <p className="text-xs text-muted-foreground">
              Event wird im Frontend angezeigt
            </p>
          </div>
          <Switch
            id="is_published"
            checked={formData.is_published}
            onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_published: checked }))}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="border-t border-[hsl(0_0%_12%)] pt-[18px]">
        <Button
          className="h-[42px] w-full rounded-[11px] bg-gradient-lime text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] hover:opacity-90"
          onClick={() => createEventMutation.mutate()}
          disabled={!isValid || createEventMutation.isPending}
        >
          {createEventMutation.isPending
            ? "Speichern..."
            : isEditing
            ? "Event aktualisieren"
            : "Event erstellen"}
        </Button>
      </div>
    </div>
  );
}
