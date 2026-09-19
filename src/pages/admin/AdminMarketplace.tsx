import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Euro,
  Coins,
  Users,
  Tag,
  FolderTree,
  Package,
  Truck,
  ShoppingBag,
  ArrowUp,
  ArrowDown,
  X,
  Star,
  Languages,
  Download,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePointsValue } from "@/hooks/usePointsValue";
import { ptsFmt, productPointsCap } from "@/lib/marketplace";
import { useTranslation } from "react-i18next";
import {
  useAdminMarketplaceItems,
  useCreateMarketplaceItem,
  useUpdateMarketplaceItem,
  useDeleteMarketplaceItem,
  useToggleMarketplaceItemStatus,
  MarketplaceItemInput,
} from "@/hooks/useAdminMarketplace";
import {
  useAdminCatalogCategories,
  useAdminCatalogBrands,
  useSyncItemImages,
  slugify,
} from "@/hooks/useMarketplaceCatalog";
import { CatalogManagerDialog } from "@/components/admin/marketplace/CatalogManagerDialog";
import { MarketplaceOrdersSection } from "@/components/admin/marketplace/MarketplaceOrdersSection";
import type { MarketplaceItem, MarketplaceCategory } from "@/hooks/useMarketplaceItems";
import { useTranslateContent, toastTranslateResult } from "@/hooks/useTranslateContent";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "sonner";

const PRODUCT_TRANSLATE_FIELDS = ["name", "subtitle", "description", "long_description", "meta_title", "meta_description"];

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  courtbooking: "Courtbuchung",
  equipment: "Equipment",
  other: "Sonstiges",
  events: "Events",
};

// ── Wiederkehrende Styling-Tokens des neuen Designs ──
const TAB_TRIGGER_CLASSES =
  "-mb-px gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-sm font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";
const TAB_COUNT_CLASSES =
  "rounded-full bg-white/[0.07] px-[7px] py-[2px] font-mono text-[10.5px] font-normal leading-none";
const BTN_NEUTRAL =
  "h-9 gap-1.5 rounded-[10px] border-[hsl(0_0%_16%)] bg-white/[0.05] px-3.5 text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/[0.05] hover:text-primary";
const BTN_LIME =
  "h-9 gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] transition-opacity hover:opacity-90";
const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
const FIELD_INPUT = "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]";
const FIELD_FILE = "rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]";
const FIELD_AREA = "rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]";
const SUB_BOX = "flex flex-col gap-3 rounded-[15px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-4";
const TH = "h-auto whitespace-nowrap pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]";
const PILL_LIVE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary";
const PILL_DRAFT =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-2.5 py-1 text-[11px] font-bold text-[#FFC44D]";
const ICON_BTN_NEUTRAL =
  "h-[30px] w-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/[0.05] text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/[0.05] hover:text-primary";
const ICON_BTN_DANGER =
  "h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]";

interface GalleryImage {
  url: string;
  alt: string;
}
interface SpecRow {
  label: string;
  value: string;
}

interface MarketplaceReferrer {
  user_id: string;
  display_name: string | null;
  username: string | null;
  referred_count: number;
  points: number;
  eur_value_cents: number;
}

interface MarketplaceAnalytics {
  revenue_cents: number;
  order_count: number;
  points_redeemed: number;
  credits_per_euro: number;
  cents_per_point: number;
  referrers: MarketplaceReferrer[];
}

const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (cents || 0) / 100,
  );

const emptyForm = (): Partial<MarketplaceItemInput> => ({
  name: "",
  category: "equipment",
  price_cents: 0,
  compare_at_price_cents: null,
  tax_rate: 19,
  description: "",
  subtitle: "",
  long_description: "",
  image_url: "",
  slug: "",
  category_id: null,
  brand_id: null,
  partner_name: "",
  stock_quantity: null,
  sort_order: 0,
  is_featured: false,
  status: "published",
  meta_title: "",
  meta_description: "",
  manufacturer_name: "",
  manufacturer_address: "",
  manufacturer_email: "",
  eu_responsible_name: "",
  eu_responsible_address: "",
  eu_responsible_email: "",
  product_identifier: "",
  safety_warnings: "",
  textile_composition: "",
  delivery_days_min: 2,
  delivery_days_max: 4,
  base_price_quantity: null,
  base_price_unit: "",
});

const AdminMarketplace = () => {
  const { data: items, isLoading } = useAdminMarketplaceItems();
  const createMutation = useCreateMarketplaceItem();
  const updateMutation = useUpdateMarketplaceItem();
  const deleteMutation = useDeleteMarketplaceItem();
  const toggleStatusMutation = useToggleMarketplaceItemStatus();
  const syncImages = useSyncItemImages();
  const { translateRow } = useTranslateContent();
  const queryClient = useQueryClient();
  const { t } = useTranslation("common");
  const { centsPerPoint, maxPercent, enabled: pointsEnabled } = usePointsValue();
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const { data: categories } = useAdminCatalogCategories();
  const { data: brands } = useAdminCatalogBrands();

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });
    queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
  };

  // Backfill: translate every product AND category's DE copy into its *_en columns. Sequential
  // to respect DeepL rate limits; locked/empty fields are skipped server-side, so it is idempotent.
  const translateAll = async () => {
    const jobs = [
      ...(items ?? []).map((i) => ({ table: "marketplace_items", id: i.id, fields: PRODUCT_TRANSLATE_FIELDS })),
      ...(categories ?? []).map((c) => ({ table: "marketplace_categories", id: c.id, fields: ["name"] })),
    ];
    if (!jobs.length) return;
    setBulk({ done: 0, total: jobs.length });
    let ok = 0;
    for (const job of jobs) {
      const result = await translateRow(job);
      if (!result.error) ok++;
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBulk(null);
    invalidateItems();
    queryClient.invalidateQueries({ queryKey: ["admin-catalog-categories"] });
    queryClient.invalidateQueries({ queryKey: ["catalog-categories"] });
    toast.success(t("admin.translateAllDone", { count: ok }));
  };

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["admin-marketplace-analytics"],
    queryFn: async (): Promise<MarketplaceAnalytics> => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "marketplace_analytics" },
      });
      if (error) throw error;
      return data as MarketplaceAnalytics;
    },
  });

  // Offene Vorgänge für die Tab-Pille: bezahlte, noch nicht versendete Bestellungen
  // plus angemeldete Retouren. Leichte head:true-Counts; die Query-Keys teilen das
  // Präfix der Listen-Queries, damit die bestehenden Invalidierungen der Mutations
  // (Versand, Storno, Retouren-Update) die Pille automatisch mit aktualisieren.
  const { data: openOrderCount } = useQuery({
    queryKey: ["admin-marketplace-redemptions", "open-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("marketplace_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "success")
        .eq("fulfillment_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: openReturnCount } = useQuery({
    queryKey: ["admin-marketplace-returns", "open-count"],
    queryFn: async () => {
      // marketplace_returns is not yet in generated types.ts
      const { count, error } = await (supabase as any)
        .from("marketplace_returns")
        .select("*", { count: "exact", head: true })
        .in("status", ["requested", "received"]);
      if (error) throw error;
      return (count as number | null) ?? 0;
    },
  });
  const openOrdersTabCount = (openOrderCount ?? 0) + (openReturnCount ?? 0);

  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarketplaceItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MarketplaceItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [exportingReceipts, setExportingReceipts] = useState(false);

  const [formData, setFormData] = useState<Partial<MarketplaceItemInput>>(emptyForm());
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [aiUrl, setAiUrl] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const resetForm = () => {
    setFormData(emptyForm());
    setSpecs([]);
    setGallery([]);
    setSlugTouched(false);
    setEditingItem(null);
    setAiUrl("");
  };

  // AI-Import: eine Produkt-URL oder eine hochgeladene PDF/HTML-Datei reicht — die Edge
  // Function extrahiert den Inhalt und füllt das Formular vor. Alles bleibt danach manuell
  // anpassbar, nichts wird gespeichert.
  const runAiImport = async (payload: Record<string, unknown>) => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-product-from-url", {
        body: {
          ...payload,
          categories: (categories ?? []).map((c) => c.name),
          brands: (brands ?? []).map((b) => b.name),
        },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string; product?: Record<string, unknown>; images?: string[] };
      if (!res?.ok || !res.product) throw new Error(res?.error || "Import fehlgeschlagen");

      const p = res.product;
      const images = Array.isArray(res.images) ? res.images : [];
      const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const eurToCents = (v: unknown) =>
        typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 100) : null;

      const brandId =
        brands?.find((b) => b.name.toLowerCase() === norm(p.brand_name).toLowerCase())?.id ?? null;
      const categoryId =
        categories?.find((c) => c.name.toLowerCase() === norm(p.category_name).toLowerCase())?.id ?? null;

      const name = norm(p.name);
      const titleImage = formData.image_url || images[0] || "";
      setFormData((f) => ({
        ...f,
        name: name || f.name,
        slug: slugTouched ? f.slug : slugify(name || f.name || ""),
        subtitle: norm(p.subtitle) || f.subtitle,
        description: norm(p.description) || f.description,
        long_description: norm(p.long_description) || f.long_description,
        meta_title: norm(p.meta_title) || f.meta_title,
        meta_description: norm(p.meta_description) || f.meta_description,
        price_cents: eurToCents(p.price_eur) ?? f.price_cents,
        compare_at_price_cents: eurToCents(p.compare_at_price_eur) ?? f.compare_at_price_cents,
        brand_id: brandId ?? f.brand_id,
        category_id: categoryId ?? f.category_id,
        product_identifier: norm(p.product_identifier) || f.product_identifier,
        manufacturer_name: norm(p.manufacturer_name) || f.manufacturer_name,
        safety_warnings: norm(p.safety_warnings) || f.safety_warnings,
        textile_composition: norm(p.textile_composition) || f.textile_composition,
        image_url: titleImage,
      }));

      const specRows = (Array.isArray(p.specs) ? (p.specs as { label?: unknown; value?: unknown }[]) : [])
        .map((s) => ({ label: norm(s?.label), value: norm(s?.value) }))
        .filter((s) => s.label && s.value);
      if (specRows.length) setSpecs(specRows);

      if (gallery.length === 0) {
        const rest = images.filter((u) => u !== titleImage).slice(0, 5);
        if (rest.length) setGallery(rest.map((u) => ({ url: u, alt: name })));
      }

      toast.success("Produktdaten übernommen – bitte prüfen, Credits & Preis kontrollieren");
    } catch (err: unknown) {
      toast.error("AI-Import fehlgeschlagen: " + ((err as Error)?.message ?? ""));
    } finally {
      setAiLoading(false);
    }
  };

  const importFromUrl = () => {
    const url = aiUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast.error("Bitte eine gültige Produkt-URL eingeben (https://…)");
      return;
    }
    runAiImport({ url });
  };

  const importFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const lower = f.name.toLowerCase();
    const kind = lower.endsWith(".pdf") || f.type === "application/pdf"
      ? "pdf"
      : lower.endsWith(".html") || lower.endsWith(".htm") || f.type === "text/html"
        ? "html"
        : null;
    if (!kind) {
      toast.error("Bitte eine PDF- oder HTML-Datei auswählen");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 15 MB)");
      return;
    }
    let data: string;
    try {
      data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
        reader.readAsDataURL(f);
      });
    } catch (err: unknown) {
      toast.error((err as Error).message);
      return;
    }
    runAiImport({ file: { name: f.name, kind, data } });
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = async (item: MarketplaceItem) => {
    setEditingItem(item);
    setSlugTouched(true);
    setAiUrl("");
    setFormData({
      name: item.name,
      category: item.category,
      price_cents: item.price_cents ?? 0,
      compare_at_price_cents: item.compare_at_price_cents ?? null,
      // tax_rate fehlt noch in den generierten Supabase-Typen -> Cast wie anderswo im Repo.
      tax_rate: Number((item as any).tax_rate ?? 19),
      description: item.description || "",
      subtitle: item.subtitle || "",
      long_description: item.long_description || "",
      image_url: item.image_url || "",
      slug: item.slug || "",
      category_id: item.category_id ?? null,
      brand_id: item.brand_id ?? null,
      partner_name: item.partner_name || "",
      stock_quantity: item.stock_quantity,
      sort_order: item.sort_order,
      is_featured: !!item.is_featured,
      status: (item.status as "draft" | "published") || "published",
      meta_title: item.meta_title || "",
      meta_description: item.meta_description || "",
      // GPSR columns not yet in generated types.ts
      manufacturer_name: (item as any).manufacturer_name || "",
      manufacturer_address: (item as any).manufacturer_address || "",
      manufacturer_email: (item as any).manufacturer_email || "",
      eu_responsible_name: (item as any).eu_responsible_name || "",
      eu_responsible_address: (item as any).eu_responsible_address || "",
      eu_responsible_email: (item as any).eu_responsible_email || "",
      product_identifier: (item as any).product_identifier || "",
      safety_warnings: (item as any).safety_warnings || "",
      textile_composition: (item as any).textile_composition || "",
      delivery_days_min: (item as any).delivery_days_min ?? 2,
      delivery_days_max: (item as any).delivery_days_max ?? 4,
      base_price_quantity: (item as any).base_price_quantity ?? null,
      base_price_unit: (item as any).base_price_unit || "",
    });
    setSpecs(Array.isArray(item.specs) ? (item.specs as SpecRow[]) : []);
    setGallery([]);
    setDialogOpen(true);
    // Load existing gallery images for this product.
    const { data } = await (supabase as any)
      .from("marketplace_item_images")
      .select("url, alt")
      .eq("item_id", item.id)
      .order("sort_order", { ascending: true });
    setGallery(((data as { url: string; alt: string | null }[]) ?? []).map((d) => ({ url: d.url, alt: d.alt ?? "" })));
  };

  const setName = (name: string) =>
    setFormData((f) => ({
      ...f,
      name,
      slug: slugTouched ? f.slug : slugify(name),
    }));

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      return await uploadMediaFile(file, `marketplace/${Date.now()}-${Math.floor(performance.now())}`);
    } catch (error) {
      toast.error("Fehler beim Hochladen: " + (error as Error).message);
      return null;
    }
  };

  const handleTitleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file);
    if (url) {
      setFormData((f) => ({ ...f, image_url: url }));
      toast.success("Titelbild hochgeladen");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const url = await uploadFile(file);
      if (url) setGallery((g) => [...g, { url, alt: "" }]);
    }
    setUploading(false);
    e.target.value = "";
  };

  const moveGallery = (index: number, dir: -1 | 1) => {
    setGallery((g) => {
      const next = [...g];
      const target = index + dir;
      if (target < 0 || target >= next.length) return g;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.description || !formData.image_url) {
      toast.error("Bitte fülle alle Pflichtfelder aus (Name, Beschreibung, Titelbild)");
      return;
    }
    if (!formData.price_cents || formData.price_cents <= 0) {
      toast.error("Bitte gib einen gültigen Preis in Euro an");
      return;
    }

    const data: MarketplaceItemInput = {
      name: formData.name,
      category: (formData.category as MarketplaceCategory) || "equipment",
      price_cents: formData.price_cents,
      compare_at_price_cents: formData.compare_at_price_cents || null,
      tax_rate: Number(formData.tax_rate ?? 19),
      description: formData.description,
      subtitle: formData.subtitle || null,
      long_description: formData.long_description || null,
      image_url: formData.image_url,
      slug: (formData.slug || slugify(formData.name || "")) || null,
      category_id: formData.category_id || null,
      brand_id: formData.brand_id || null,
      partner_name: formData.partner_name || undefined,
      stock_quantity: formData.stock_quantity,
      sort_order: formData.sort_order || 0,
      product_type: "purchase",
      is_featured: !!formData.is_featured,
      status: (formData.status as "draft" | "published") || "published",
      specs: specs.filter((s) => s.label.trim() || s.value.trim()),
      meta_title: formData.meta_title || null,
      meta_description: formData.meta_description || null,
      manufacturer_name: formData.manufacturer_name || null,
      manufacturer_address: formData.manufacturer_address || null,
      manufacturer_email: formData.manufacturer_email || null,
      eu_responsible_name: formData.eu_responsible_name || null,
      eu_responsible_address: formData.eu_responsible_address || null,
      eu_responsible_email: formData.eu_responsible_email || null,
      product_identifier: formData.product_identifier || null,
      safety_warnings: formData.safety_warnings || null,
      textile_composition: formData.textile_composition || null,
      delivery_days_min: formData.delivery_days_min ?? 2,
      delivery_days_max: formData.delivery_days_max ?? 4,
      base_price_quantity: formData.base_price_quantity || null,
      base_price_unit: formData.base_price_unit || null,
    };

    setSaving(true);
    try {
      let itemId: string;
      if (editingItem) {
        await updateMutation.mutateAsync({ id: editingItem.id, ...data });
        itemId = editingItem.id;
      } else {
        const created = await createMutation.mutateAsync(data);
        itemId = (created as { id: string }).id;
      }
      await syncImages.mutateAsync({
        itemId,
        images: gallery.filter((g) => g.url).map((g) => ({ url: g.url, alt: g.alt || null })),
      });
      // Auto-translate the German product copy into *_en (fire-and-forget; DE stays visible
      // immediately, EN fills in once DeepL returns).
      translateRow({ table: "marketplace_items", id: itemId, fields: PRODUCT_TRANSLATE_FIELDS }).then((result) => {
        toastTranslateResult(result);
        invalidateItems();
      });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error("Fehler beim Speichern: " + (err?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  const exportReceipts = async () => {
    setExportingReceipts(true);
    try {
      const { data, error } = await (supabase as any)
        .from("receipts")
        .select("*")
        .order("receipt_number", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) {
        toast.info("Keine Belege vorhanden");
        return;
      }
      const num = (cents: unknown) => (((cents as number) ?? 0) / 100).toFixed(2).replace(".", ",");
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = "Belegnummer;Typ;Datum;Beschreibung;Brutto;Rabatt;Zahlbetrag;Netto;USt-Satz;USt-Betrag;Währung";
      const lines = rows.map((r) =>
        [
          esc(r.receipt_number),
          esc(r.receipt_type),
          r.issued_at ? new Date(r.issued_at as string).toLocaleDateString("de-DE") : "",
          esc(r.description),
          num(r.gross_cents),
          num(r.discount_cents),
          num(r.paid_cents),
          num(r.net_cents),
          String(r.tax_rate ?? 0).replace(".", ","),
          num(r.tax_cents),
          esc(r.currency ?? "EUR"),
        ].join(";"),
      );
      // BOM, damit deutsches Excel Umlaute korrekt liest
      const csv = "\uFEFF" + [header, ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `p2g-belege-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Export fehlgeschlagen: " + (err?.message ?? ""));
    } finally {
      setExportingReceipts(false);
    }
  };

  const handleDelete = () => {
    if (!itemToDelete) return;
    deleteMutation.mutate(itemToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setItemToDelete(null);
      },
    });
  };

  const categoryName = (id?: string | null) => categories?.find((c) => c.id === id)?.name;
  const brandName = (id?: string | null) => brands?.find((b) => b.id === id)?.name;

  const filteredItems =
    items?.filter((item) => {
      if (filterCategory !== "all" && item.category_id !== filterCategory) return false;
      if (filterActive === "active" && !item.is_active) return false;
      if (filterActive === "inactive" && item.is_active) return false;
      return true;
    }) || [];

  const kpiCards = [
    { icon: Euro, label: "Umsatz (bezahlt)", value: formatEuro(analytics?.revenue_cents ?? 0) },
    { icon: ShoppingBag, label: "Bestellungen", value: String(analytics?.order_count ?? 0) },
    { icon: Coins, label: "Eingelöste Punkte", value: (analytics?.points_redeemed ?? 0).toLocaleString("de-DE") },
  ];

  return (
    <AdminLayout>
      <Helmet>
        <title>Marketplace | Admin</title>
      </Helmet>

      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Kopfzeile: Beschreibung + Aktionen */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Produkte, Kategorien und Marken verwalten</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className={BTN_NEUTRAL} onClick={() => setCatManagerOpen(true)}>
              <FolderTree className="h-3.5 w-3.5" />
              Kategorien
            </Button>
            <Button variant="outline" className={BTN_NEUTRAL} onClick={() => setBrandManagerOpen(true)}>
              <Tag className="h-3.5 w-3.5" />
              Marken
            </Button>
            {(!!items?.length || !!categories?.length) && (
              <Button variant="outline" className={BTN_NEUTRAL} onClick={translateAll} disabled={!!bulk}>
                {bulk ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("admin.translateAllRunning", { done: bulk.done, total: bulk.total })}
                  </>
                ) : (
                  <>
                    <Languages className="h-3.5 w-3.5" /> {t("admin.translateAll")}
                  </>
                )}
              </Button>
            )}
            <Button onClick={openCreateDialog} className={`shrink-0 ${BTN_LIME}`}>
              <Plus className="h-[15px] w-[15px]" />
              Neues Produkt
            </Button>
          </div>
        </div>

        {/* KPI-Karten */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
          {kpiCards.map((card) => (
            <Card key={card.label} className="rounded-2xl border-border bg-gradient-card p-5">
              <div className="flex flex-col gap-3.5">
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-primary/30 bg-primary/10 text-primary">
                  <card.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="flex flex-col gap-1">
                  {analyticsLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="font-mono text-[28px] font-bold leading-none text-foreground">
                      {card.value}
                    </span>
                  )}
                  <span className="text-[13px] text-muted-foreground">{card.label}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs: Produkte / Bestellungen & Retouren */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "products" | "orders")}>
          <TabsList className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-[hsl(0_0%_12%)] bg-transparent p-0 sm:gap-[22px]">
            <TabsTrigger value="products" className={TAB_TRIGGER_CLASSES}>
              <Package className="h-4 w-4" />
              Produkte
              <span className={TAB_COUNT_CLASSES}>{items?.length ?? 0}</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className={TAB_TRIGGER_CLASSES}>
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">Bestellungen &amp; Retouren</span>
              <span className="sm:hidden">Bestellungen</span>
              {openOrdersTabCount > 0 && (
                <span className={TAB_COUNT_CLASSES}>{openOrdersTabCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ═══ Produkte ═══ */}
        <div className={activeTab === "products" ? "flex flex-col gap-[18px]" : "hidden"}>
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Produkte{" "}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    ({filteredItems.length})
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2.5">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger
                      aria-label="Kategorie filtern"
                      className="h-9 w-auto min-w-[150px] gap-2 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Kategorien</SelectItem>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterActive} onValueChange={setFilterActive}>
                    <SelectTrigger
                      aria-label="Status filtern"
                      className="h-9 w-auto min-w-[110px] gap-2 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px] font-semibold"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="inactive">Inaktiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Keine Produkte gefunden.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[880px]">
                    <TableHeader>
                      <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                        <TableHead className={TH}>Produkt</TableHead>
                        <TableHead className={TH}>Kategorie</TableHead>
                        <TableHead className={TH}>Marke</TableHead>
                        <TableHead className={`${TH} text-right`}>Preis</TableHead>
                        <TableHead className={`${TH} text-right`}>Max. Points</TableHead>
                        <TableHead className={TH}>Status</TableHead>
                        <TableHead className={TH}>Aktiv</TableHead>
                        <TableHead className={`${TH} text-right`}>Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.022]">
                          <TableCell className="py-3 pr-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 flex-none overflow-hidden rounded-[10px] border border-[hsl(0_0%_15%)] bg-muted">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  {item.is_featured && (
                                    <Star className="h-3.5 w-3.5 flex-none fill-primary text-primary" />
                                  )}
                                  <span className="max-w-[240px] truncate text-[13.5px] font-bold text-foreground">
                                    {item.name}
                                  </span>
                                </div>
                                {item.subtitle && (
                                  <span className="max-w-[240px] truncate text-[11.5px] text-muted-foreground">
                                    {item.subtitle}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 pr-3.5">
                            <span className="inline-flex whitespace-nowrap rounded-full border border-[hsl(0_0%_16%)] bg-white/5 px-2.5 py-1 text-[11.5px] font-semibold text-[hsl(0_0%_82%)]">
                              {categoryName(item.category_id) || CATEGORY_LABELS[item.category] || item.category}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 pr-3.5 text-[13.5px] text-[hsl(0_0%_78%)]">
                            {brandName(item.brand_id) || item.partner_name || "-"}
                          </TableCell>
                          <TableCell className="py-3 pr-3.5 text-right">
                            <span className="whitespace-nowrap font-mono text-[13px] font-bold text-foreground">
                              {formatEuro(item.price_cents ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 pr-3.5 text-right">
                            <span
                              className={`whitespace-nowrap font-mono text-[12.5px] ${
                                pointsEnabled ? "text-primary" : "text-[hsl(0_0%_55%)]"
                              }`}
                            >
                              {ptsFmt(productPointsCap(item.price_cents ?? 0, centsPerPoint, maxPercent))}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 pr-3.5">
                            <span className={item.status === "draft" ? PILL_DRAFT : PILL_LIVE}>
                              <span className="h-[5px] w-[5px] rounded-full bg-current" />
                              {item.status === "draft" ? "Entwurf" : "Live"}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 pr-3.5">
                            <Switch
                              checked={item.is_active}
                              onCheckedChange={(checked) =>
                                toggleStatusMutation.mutate({ id: item.id, is_active: checked })
                              }
                            />
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <div className="flex justify-end gap-[7px]">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={ICON_BTN_NEUTRAL}
                                onClick={() => openEditDialog(item)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={ICON_BTN_DANGER}
                                onClick={() => {
                                  setItemToDelete(item);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Card>

          {/* Empfehlungen (Referrals) */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]">
                  <Users className="h-[15px] w-[15px]" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 className="font-display text-[15px] font-bold tracking-tight text-foreground">
                    Empfehlungen (Referrals)
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    Punkte-Gutschriften aus Weiterempfehlungen
                  </span>
                </div>
              </div>
              {analyticsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !analytics?.referrers.length ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Empfehlungen.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[480px]">
                    <TableHeader>
                      <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                        <TableHead className={TH}>Nutzer</TableHead>
                        <TableHead className={`${TH} text-right`}>Geworben</TableHead>
                        <TableHead className={`${TH} text-right`}>Punkte</TableHead>
                        <TableHead className={`${TH} text-right`}>Wert (€)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.referrers.map((r) => {
                        const refName = r.display_name || r.username || r.user_id.slice(0, 8);
                        const initials = refName
                          .split(/\s+/)
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        return (
                          <TableRow key={r.user_id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.022]">
                            <TableCell className="py-3 pr-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-primary/[0.26] bg-primary/10 font-display text-[10.5px] font-extrabold text-primary">
                                  {initials}
                                </span>
                                <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
                                  {refName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 pr-3.5 text-right font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                              {r.referred_count}
                            </TableCell>
                            <TableCell className="py-3 pr-3.5 text-right font-mono text-[12.5px] text-primary">
                              {r.points.toLocaleString("de-DE")}
                            </TableCell>
                            <TableCell className="py-3 text-right font-mono text-[12.5px] text-foreground">
                              {formatEuro(r.eur_value_cents)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ═══ Bestellungen & Retouren ═══ */}
        <div className={activeTab === "orders" ? "flex flex-col gap-[18px]" : "hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">Bestellungen</h2>
            <Button
              variant="outline"
              size="sm"
              className={BTN_NEUTRAL}
              onClick={exportReceipts}
              disabled={exportingReceipts}
            >
              {exportingReceipts ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Belege exportieren (CSV)
            </Button>
          </div>
          <MarketplaceOrdersSection />
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
          <DialogHeader className="gap-[5px] space-y-0 text-left">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Produkt</span>
            <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
              {editingItem ? "Produkt bearbeiten" : "Neues Produkt erstellen"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Alle Felder mit * sind Pflichtfelder.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 py-2">
            {/* AI import via product URL — beim Bearbeiten als Neu-Generierung nutzbar */}
            <div className="flex flex-col gap-3 rounded-[15px] border border-primary/25 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.07),hsl(71_91%_51%/0.01))] p-4">
              <Label className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-primary/[0.32] bg-primary/[0.12] text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="font-display text-sm font-bold tracking-tight text-foreground">
                  {editingItem ? "Per URL oder Datei neu generieren (AI)" : "Per URL oder Datei ausfüllen (AI)"}
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="https://… Produktseite (Hersteller oder Shop)"
                  value={aiUrl}
                  onChange={(e) => setAiUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      importFromUrl();
                    }
                  }}
                  disabled={aiLoading}
                  className={`min-w-[min(240px,100%)] flex-1 ${FIELD_INPUT}`}
                />
                <Button
                  type="button"
                  onClick={importFromUrl}
                  disabled={aiLoading || !aiUrl.trim()}
                  className={BTN_LIME}
                >
                  {aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Ausfüllen
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Oder Produkt-Datei hochladen (PDF-Datenblatt / HTML-Seite):</p>
              <Input
                type="file"
                accept=".pdf,.html,.htm"
                onChange={importFromFile}
                disabled={aiLoading}
                className={FIELD_FILE}
              />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {editingItem
                  ? "Überschreibt die Felder mit den neuen Daten aus der Quelle (Slug, Titelbild und vorhandene Galerie bleiben erhalten — Galerie wird nur gefüllt, wenn sie leer ist). Nichts wird gespeichert, bis du unten speicherst."
                  : "Zieht Name, Beschreibung, Specs, Preis, Marke & Bilder automatisch aus der Produktseite bzw. dem Dokument. Alle Felder bleiben danach manuell anpassbar."}
              </p>
            </div>

            {/* Title image */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>
                Titelbild<span className="text-primary"> *</span>
              </Label>
              <div className="flex items-start gap-4">
                {formData.image_url && (
                  <div className="w-24 shrink-0 overflow-hidden rounded-[13px] border border-[hsl(0_0%_15%)] bg-muted aspect-[2/3]">
                    <img src={formData.image_url} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleTitleImageUpload}
                    disabled={uploading}
                    className={FIELD_FILE}
                  />
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    Empfohlenes Format: Hochformat 2:3 (z. B. 1200 × 1800 px) — Bilder werden im Shop in 2:3 zugeschnitten.
                  </p>
                  <p className="text-xs text-muted-foreground">Oder URL direkt eingeben:</p>
                  <Input
                    placeholder="https://..."
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
            </div>

            {/* Gallery */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Weitere Bilder (Galerie)</Label>
              {gallery.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {gallery.map((img, i) => (
                    <div
                      key={i}
                      className="group relative w-20 overflow-hidden rounded-[9px] border border-[hsl(0_0%_15%)] bg-muted aspect-[2/3]"
                    >
                      <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setGallery((g) => g.filter((_, idx) => idx !== i))}
                        className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 opacity-0 transition group-hover:opacity-100"
                        title="Entfernen"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                      <div className="absolute bottom-0.5 left-0.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => moveGallery(i, -1)}
                          className="rounded bg-black/70 p-0.5"
                          title="Nach vorne"
                        >
                          <ArrowUp className="h-3 w-3 text-white" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGallery(i, 1)}
                          className="rounded bg-black/70 p-0.5"
                          title="Nach hinten"
                        >
                          <ArrowDown className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryUpload}
                disabled={uploading}
                className={FIELD_FILE}
              />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Mehrere Bilder möglich. Reihenfolge steuert die Galerie auf der Produktseite (Titelbild zuerst).
                Empfohlenes Format: Hochformat 2:3.
              </p>
            </div>

            {/* Name + slug */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>
                Name<span className="text-primary"> *</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Produktname"
                className={FIELD_INPUT}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Slug (URL)</Label>
              <Input
                value={formData.slug ?? ""}
                onChange={(e) => {
                  setSlugTouched(true);
                  setFormData({ ...formData, slug: slugify(e.target.value) });
                }}
                placeholder="produktname"
                className={FIELD_INPUT}
              />
              <p className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
                /marketplace/{formData.slug || "…"}
              </p>
            </div>

            {/* Subtitle */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Untertitel</Label>
              <Input
                value={formData.subtitle ?? ""}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Kurzer Zusatz, z.B. „Kontrolle & Power für Fortgeschrittene“"
                className={FIELD_INPUT}
              />
            </div>

            {/* Category + brand */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Produktkategorie</Label>
                <Select
                  value={formData.category_id ?? "none"}
                  onValueChange={(v) => setFormData({ ...formData, category_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className={FIELD_INPUT}>
                    <SelectValue placeholder="Kategorie wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— keine —</SelectItem>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {!c.is_active ? " (inaktiv)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Marke</Label>
                <Select
                  value={formData.brand_id ?? "none"}
                  onValueChange={(v) => {
                    const id = v === "none" ? null : v;
                    setFormData({ ...formData, brand_id: id, partner_name: brandName(id) ?? formData.partner_name });
                  }}
                >
                  <SelectTrigger className={FIELD_INPUT}>
                    <SelectValue placeholder="Marke wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— keine —</SelectItem>
                    {brands?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                        {!b.is_active ? " (inaktiv)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preis, UVP, Punkte-Rabatt, Steuersatz */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>
                  Preis (€)<span className="text-primary"> *</span>
                </Label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={formData.price_cents ? (formData.price_cents / 100).toFixed(2) : ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0,
                    })
                  }
                  placeholder="0.00"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>UVP (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.compare_at_price_cents ? (formData.compare_at_price_cents / 100).toFixed(2) : ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      compare_at_price_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null,
                    })
                  }
                  placeholder="Streichpreis"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Punkte-Rabatt (max.)</Label>
                <div className="flex h-[42px] items-center rounded-[11px] border border-[hsl(0_0%_15%)] bg-white/[0.02] px-3">
                  <Coins className="mr-2 h-4 w-4 shrink-0 text-primary" />
                  <span className="font-mono text-[15px] font-bold text-foreground">
                    {ptsFmt(productPointsCap(formData.price_cents ?? 0, centsPerPoint, maxPercent))} Points
                  </span>
                  <span className="ml-2 truncate text-[12px] text-muted-foreground">
                    = {formatEuro(Math.floor(((formData.price_cents ?? 0) * Math.min(100, Math.max(0, maxPercent))) / 100))}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Rechnet sich aus dem Preis: {maxPercent} % vom Warenwert beim Kurs{" "}
                  {ptsFmt(Math.round(100 / (centsPerPoint || 1)))} Points = 1 €. Beides wird global unter
                  Preise &amp; Punkte gesetzt, nicht je Produkt.
                </p>
                {!pointsEnabled && (
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#FFC44D]">
                    <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
                    Punkte-Zahlung ist global deaktiviert — im Shop ist derzeit kein Punkterabatt sichtbar.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Steuersatz (%)</Label>
                <Select
                  value={String(formData.tax_rate ?? 19)}
                  onValueChange={(v) => setFormData({ ...formData, tax_rate: Number(v) })}
                >
                  <SelectTrigger className={FIELD_INPUT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="19">19 % — Regelsatz</SelectItem>
                    <SelectItem value="7">7 % — ermäßigt</SelectItem>
                    <SelectItem value="0">0 % — steuerfrei</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Landet auf Beleg und Gutschrift. Bei einer Änderung gilt der neue Satz erst
                  für neue Bestellungen.
                </span>
              </div>
            </div>

            {/* Short description */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>
                Kurzbeschreibung<span className="text-primary"> *</span>
              </Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Kurze Beschreibung für Produktkarten..."
                rows={2}
                className={FIELD_AREA}
              />
            </div>

            {/* Long description */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Langbeschreibung</Label>
              <Textarea
                value={formData.long_description ?? ""}
                onChange={(e) => setFormData({ ...formData, long_description: e.target.value })}
                placeholder="Ausführliche Produktbeschreibung für die Produktseite..."
                rows={4}
                className={FIELD_AREA}
              />
            </div>

            {/* Specs */}
            <div className={SUB_BOX}>
              <span className="font-display text-sm font-bold tracking-tight text-foreground">Spezifikationen</span>
              <div className="flex flex-col gap-2">
                {specs.map((spec, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className={`flex-1 ${FIELD_INPUT} h-9`}
                      placeholder="Merkmal (z.B. Gewicht)"
                      value={spec.label}
                      onChange={(e) =>
                        setSpecs((s) => s.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)))
                      }
                    />
                    <Input
                      className={`flex-1 ${FIELD_INPUT} h-9 font-mono text-[12.5px]`}
                      placeholder="Wert (z.B. 365 g)"
                      value={spec.value}
                      onChange={(e) =>
                        setSpecs((s) => s.map((row, idx) => (idx === i ? { ...row, value: e.target.value } : row)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`shrink-0 ${ICON_BTN_DANGER}`}
                      onClick={() => setSpecs((s) => s.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 self-start gap-1.5 rounded-[9px] border-primary/30 bg-primary/[0.09] px-3 text-[12.5px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
                  onClick={() => setSpecs((s) => [...s, { label: "", value: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Merkmal hinzufügen
                </Button>
              </div>
            </div>

            {/* Partner name (legacy free-text, prefilled from brand) */}
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Marken-/Partner-Text (Anzeige)</Label>
              <Input
                value={formData.partner_name}
                onChange={(e) => setFormData({ ...formData, partner_name: e.target.value })}
                placeholder="z.B. Adidas, Babolat"
                className={FIELD_INPUT}
              />
            </div>

            {/* Stock + sort + status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Bestand (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.stock_quantity ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, stock_quantity: e.target.value ? parseInt(e.target.value) : null })
                  }
                  placeholder="Unbegrenzt"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Sortierung</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Status</Label>
                <Select
                  value={formData.status ?? "published"}
                  onValueChange={(v) => setFormData({ ...formData, status: v as "draft" | "published" })}
                >
                  <SelectTrigger className={FIELD_INPUT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Live</SelectItem>
                    <SelectItem value="draft">Entwurf</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Featured */}
            <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.028] px-[15px] py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Label className="cursor-pointer text-[13.5px] font-bold text-foreground">
                  Featured (hervorheben)
                </Label>
                <p className="text-xs text-muted-foreground">Zeigt das Produkt prominent im Shop.</p>
              </div>
              <Switch
                checked={!!formData.is_featured}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
            </div>

            {/* GPSR / Kennzeichnung */}
            <div className={SUB_BOX}>
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-bold tracking-tight text-foreground">
                  Produktsicherheit &amp; Kennzeichnung (GPSR)
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Hersteller Name</Label>
                  <Input
                    value={formData.manufacturer_name ?? ""}
                    onChange={(e) => setFormData({ ...formData, manufacturer_name: e.target.value })}
                    placeholder="z.B. Babolat VS S.A."
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Hersteller E-Mail</Label>
                  <Input
                    type="email"
                    value={formData.manufacturer_email ?? ""}
                    onChange={(e) => setFormData({ ...formData, manufacturer_email: e.target.value })}
                    placeholder="kontakt@hersteller.de"
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Hersteller Anschrift</Label>
                <Input
                  value={formData.manufacturer_address ?? ""}
                  onChange={(e) => setFormData({ ...formData, manufacturer_address: e.target.value })}
                  placeholder="Straße, PLZ Ort, Land"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="text-[11.5px] text-muted-foreground">
                  EU-Verantwortlicher: Nur nötig, wenn der Hersteller außerhalb der EU sitzt.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label className={FIELD_LABEL}>EU-Verantwortlicher Name</Label>
                    <Input
                      value={formData.eu_responsible_name ?? ""}
                      onChange={(e) => setFormData({ ...formData, eu_responsible_name: e.target.value })}
                      className={FIELD_INPUT}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className={FIELD_LABEL}>EU-Verantwortlicher E-Mail</Label>
                    <Input
                      type="email"
                      value={formData.eu_responsible_email ?? ""}
                      onChange={(e) => setFormData({ ...formData, eu_responsible_email: e.target.value })}
                      className={FIELD_INPUT}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>EU-Verantwortlicher Anschrift</Label>
                  <Input
                    value={formData.eu_responsible_address ?? ""}
                    onChange={(e) => setFormData({ ...formData, eu_responsible_address: e.target.value })}
                    placeholder="Straße, PLZ Ort, Land"
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Produkt-ID / Charge</Label>
                <Input
                  value={formData.product_identifier ?? ""}
                  onChange={(e) => setFormData({ ...formData, product_identifier: e.target.value })}
                  placeholder="z.B. Artikelnummer, GTIN oder Chargennummer"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Warnhinweise</Label>
                <Textarea
                  value={formData.safety_warnings ?? ""}
                  onChange={(e) => setFormData({ ...formData, safety_warnings: e.target.value })}
                  placeholder="Sicherheits- und Warnhinweise zum Produkt..."
                  rows={2}
                  className={FIELD_AREA}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Materialzusammensetzung</Label>
                <Input
                  value={formData.textile_composition ?? ""}
                  onChange={(e) => setFormData({ ...formData, textile_composition: e.target.value })}
                  placeholder="z.B. 90 % Polyester, 10 % Elasthan"
                  className={FIELD_INPUT}
                />
                <p className="text-[11px] text-muted-foreground">Pflicht bei Textilien.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Lieferzeit min (Werktage)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.delivery_days_min ?? 2}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_days_min: e.target.value ? parseInt(e.target.value) : 2 })
                    }
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Lieferzeit max (Werktage)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.delivery_days_max ?? 4}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_days_max: e.target.value ? parseInt(e.target.value) : 4 })
                    }
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Grundpreis-Menge</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={formData.base_price_quantity ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        base_price_quantity: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className={FIELD_LABEL}>Grundpreis-Einheit</Label>
                  <Input
                    value={formData.base_price_unit ?? ""}
                    onChange={(e) => setFormData({ ...formData, base_price_unit: e.target.value })}
                    placeholder="z.B. m, kg"
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Grundpreis: Nur bei Ware nach Maß/Gewicht.</p>
            </div>

            {/* SEO */}
            <div className={SUB_BOX}>
              <span className="font-display text-sm font-bold tracking-tight text-foreground">SEO (optional)</span>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Meta-Titel</Label>
                <Input
                  value={formData.meta_title ?? ""}
                  onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                  placeholder="Wird für Suchmaschinen/Teilen genutzt"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Meta-Beschreibung</Label>
                <Textarea
                  value={formData.meta_description ?? ""}
                  onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                  rows={2}
                  className={FIELD_AREA}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-[hsl(0_0%_12%)] pt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/[0.05] px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/[0.08] hover:text-foreground"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || uploading}
              className="h-10 gap-2 rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingItem ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
          <AlertDialogHeader className="gap-3 space-y-0 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <AlertDialogTitle className="font-display text-lg font-extrabold tracking-tight text-foreground">
              Produkt löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-relaxed text-[hsl(0_0%_68%)]">
              Möchtest du "{itemToDelete?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              Hat das Produkt bereits Bestellungen, wird es stattdessen nur deaktiviert – Bestellhistorie und
              Belege bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/[0.05] px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/[0.08] hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Taxonomy managers */}
      <CatalogManagerDialog kind="category" open={catManagerOpen} onOpenChange={setCatManagerOpen} />
      <CatalogManagerDialog kind="brand" open={brandManagerOpen} onOpenChange={setBrandManagerOpen} />
    </AdminLayout>
  );
};

export default AdminMarketplace;
