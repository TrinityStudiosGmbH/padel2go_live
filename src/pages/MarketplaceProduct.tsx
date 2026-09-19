import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation, Trans } from "react-i18next";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, Coins, Gift, Minus, Plus, Zap, Truck, RotateCcw, ShieldCheck,
  Loader2, PackageX, ArrowRight, Flame, ArrowLeft,
} from "lucide-react";
import { useMarketplaceProduct } from "@/hooks/useMarketplaceProduct";
import { useCatalogCategories, useCatalogBrands } from "@/hooks/useMarketplaceCatalog";
import { useAuth } from "@/hooks/useAuth";
import { useP2GPoints } from "@/hooks/useP2GPoints";
import { usePointsValue } from "@/hooks/usePointsValue";
import { eur, ptsFmt, discountPct, maxRedeemablePoints, productPointsCap } from "@/lib/marketplace";
import { localized } from "@/lib/localized";
import type { MarketplaceItem } from "@/hooks/useMarketplaceItems";
import { StorageImage } from "@/components/StorageImage";

const MarketplaceProduct = () => {
  const sectionColor = useSectionTheme("market");
  const { t, i18n } = useTranslation("marketplace");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMarketplaceProduct(slug);
  const { data: categories } = useCatalogCategories();
  const { data: brands } = useCatalogBrands();
  const { user } = useAuth();
  const { summary } = useP2GPoints();
  const { centsPerPoint, maxPercent, enabled: pointsEnabled } = usePointsValue();

  const [qty, setQty] = useState(1);
  const [mainIdx, setMainIdx] = useState(0);

  const product = data?.product ?? null;
  const gallery = data?.gallery ?? [];

  const images = useMemo(() => {
    const urls = [product?.image_url, ...gallery.map((g) => g.url)].filter(Boolean) as string[];
    return urls.length ? urls : ["/placeholder.svg"];
  }, [product, gallery]);

  // § 11 PAngV: lowest effective price of the trailing 30 days, only relevant
  // while a strike price (UVP) is advertised.
  const { data: lowest30d } = useQuery({
    queryKey: ["marketplace-lowest-price-30d", product?.id],
    enabled: !!product?.id && !!product?.compare_at_price_cents,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("marketplace_lowest_price_30d", {
        p_item_id: product!.id,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
  });

  if (isLoading) {
    return (
      <>
        <Navigation />
        <main
          className="min-h-screen bg-background flex items-center justify-center pt-20"
          style={sectionThemeVars(sectionColor)}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <Navigation />
        <main
          className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 pt-20 px-5 text-center"
          style={sectionThemeVars(sectionColor)}
        >
          <span className="w-16 h-16 rounded-full bg-white/5 border border-border flex items-center justify-center text-muted-foreground">
            <PackageX className="w-8 h-8" />
          </span>
          <h1 className="text-2xl font-bold font-display">{t("product.notFound")}</h1>
          <Button variant="lime" onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t("product.backToShop")}
          </Button>
        </main>
        <Footer />
      </>
    );
  }

  const brandName = brands?.find((b) => b.id === product.brand_id)?.name ?? product.partner_name ?? "P2G";
  const brandLogoUrl = brands?.find((b) => b.id === product.brand_id)?.logo_url ?? null;
  const categoryRow = categories?.find((c) => c.id === product.category_id);
  const categoryName = categoryRow ? localized(categoryRow, "name", i18n.language) : t("product.categoryFallback");
  const price = product.price_cents ?? 0;
  const uvp = product.compare_at_price_cents ?? null;
  const off = discountPct(price, uvp);
  const soldOut = product.stock_quantity !== null && (product.stock_quantity ?? 0) <= 0;
  const low = !soldOut && product.stock_quantity !== null && (product.stock_quantity ?? 0) <= 5;
  const qtyMax = Math.min(product.stock_quantity ?? 5, 5);

  const balance = summary?.redeemable_balance ?? 0;
  // Obergrenze des Produkts: rein aus Preis, Kurs und Prozentsatz gerechnet.
  const pointsCap = productPointsCap(price * qty, centsPerPoint, maxPercent);
  const pointsCapCents = Math.floor(pointsCap * centsPerPoint);
  const maxRedeem = maxRedeemablePoints(price * qty, balance, centsPerPoint, maxPercent);
  const maxSaveCents = Math.floor(maxRedeem * centsPerPoint);

  // New DB columns not yet in generated types.ts
  const ext = product as any;
  const deliveryMin = ext.delivery_days_min ?? 2;
  const deliveryMax = ext.delivery_days_max ?? 4;

  const specs = Array.isArray(product.specs) ? product.specs : [];
  const descParas = (localized(product, "long_description", i18n.language) || localized(product, "description", i18n.language) || "")
    .split(/\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const stockCol = soldOut ? "text-red-400" : low ? "text-amber-400" : "text-primary";
  const stockDot = soldOut ? "bg-red-400" : low ? "bg-amber-400" : "bg-primary";

  const buyNow = () => navigate(`/marketplace/${product.slug}/checkout?qty=${qty}`);

  return (
    <>
      <Helmet>
        <title>{product.meta_title || t("product.metaTitle", { name: localized(product, "name", i18n.language) })}</title>
        <meta name="description" content={product.meta_description || localized(product, "description", i18n.language) || ""} />
      </Helmet>

      <Navigation />

      <main
        className="relative min-h-screen bg-background pt-[92px] pb-24"
        style={sectionThemeVars(sectionColor)}
      >
        <SectionShaderBackdrop color={sectionColor} />
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative z-[1] mx-auto max-w-[1200px] px-5 flex flex-col gap-6"
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 flex-wrap text-[13.5px]">
            <button onClick={() => navigate("/marketplace")} className="text-muted-foreground hover:text-primary">
              {t("breadcrumb.root")}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-muted-foreground">{categoryName}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="font-semibold text-foreground">{localized(product, "name", i18n.language)}</span>
          </div>

          {/* Detail grid — schmalere Bildspalte, Buy-Box streckt sich auf Galeriehöhe */}
          <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
            {/* Hauptbild + weitere Bilder direkt darunter */}
            <div className="flex flex-col gap-3">
              <div className="relative rounded-[20px] overflow-hidden border border-border/80 bg-gradient-to-br from-white/[0.04] to-black aspect-[2/3]">
                <StorageImage src={images[mainIdx]} renderWidth={1200} alt={localized(product, "name", i18n.language)} className="w-full h-full object-cover absolute inset-0" />
                {brandLogoUrl && (
                  <span className="absolute top-4 left-4 w-12 h-12 rounded-full overflow-hidden border border-white/20 bg-black/70 backdrop-blur shadow-lg">
                    <StorageImage src={brandLogoUrl} renderWidth={200} alt={brandName} className="w-full h-full object-cover" />
                  </span>
                )}
                {soldOut && (
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex rounded-full border border-border bg-black/80 px-5 py-2 text-sm font-bold backdrop-blur">
                    {t("stock.soldOut")}
                  </span>
                )}
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setMainIdx(i)}
                      className={`aspect-[2/3] rounded-2xl overflow-hidden border bg-gradient-to-br from-white/[0.04] to-black transition-colors ${
                        i === mainIdx ? "border-primary" : "border-border/80 hover:border-primary/50"
                      }`}
                    >
                      <StorageImage src={src} renderWidth={300} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Buy-Box + technische Details untereinander; die untere Karte füllt die Spalte auf */}
            <div className="flex flex-col gap-6">
            <div className={`rounded-2xl border border-border/60 bg-gradient-card p-[26px] flex flex-col gap-4 ${specs.length === 0 ? "flex-1" : ""}`}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-stat text-[11px] tracking-[0.14em] uppercase text-primary bg-primary/[0.08] border border-primary/25 rounded-full px-3 py-1">
                  {brandName}
                </span>
                {product.is_featured && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11.5px] font-bold text-primary">
                    <Flame className="w-3 h-3" />
                    {t("card.bestseller")}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h1 className="font-display font-extrabold tracking-tight text-[clamp(26px,3.4vw,34px)] leading-[1.12]">
                  {localized(product, "name", i18n.language)}
                </h1>
                {product.subtitle && (
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{localized(product, "subtitle", i18n.language)}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-stat font-bold text-[34px] text-primary leading-none">{eur(price)}</span>
                  {uvp && <span className="font-stat text-[14.5px] text-muted-foreground/70 line-through">{t("product.rrp", { price: eur(uvp) })}</span>}
                  {off > 0 && (
                    <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 font-stat text-[12px] font-bold text-primary">
                      −{off}%
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{t("product.taxShipping")}</span>
                {uvp && (lowest30d ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t("product.lowestPrice30d", { price: eur(lowest30d!) })}
                  </span>
                )}
                {ext.base_price_quantity && ext.base_price_unit && (
                  <span className="text-xs text-muted-foreground">
                    {t("product.basePrice", { price: eur(Math.round(price / ext.base_price_quantity)), unit: ext.base_price_unit })}
                  </span>
                )}
              </div>

              {pointsEnabled && (user ? (
                <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-3.5 py-3">
                  <Coins className="w-[18px] h-[18px] text-primary shrink-0" />
                  <span className="text-[13px] leading-snug text-foreground/80">
                    <Trans
                      i18nKey="marketplace:product.pointsUser"
                      values={{ points: ptsFmt(pointsCap), amount: eur(maxSaveCents) }}
                      components={{
                        1: <span className="font-stat font-bold text-primary" />,
                        2: <span className="font-stat font-bold text-primary" />,
                      }}
                    />
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-3.5 py-3">
                  <Gift className="w-[17px] h-[17px] text-primary shrink-0" />
                  <span className="text-[12.5px] leading-snug text-muted-foreground">
                    <Trans
                      i18nKey="marketplace:product.pointsGuest"
                      values={{ points: ptsFmt(pointsCap), amount: eur(pointsCapCents) }}
                      components={{
                        1: <span className="font-stat font-bold text-primary" />,
                        2: <button onClick={() => navigate("/auth")} className="font-bold text-primary underline" />,
                      }}
                    />
                  </span>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${stockDot}`} />
                <span className={`text-[13.5px] font-bold ${stockCol}`}>
                  {soldOut
                    ? t("stock.soldOut")
                    : low
                      ? t("stock.lowLong", { count: product.stock_quantity })
                      : t("stock.inStock")}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {soldOut ? t("product.restockNote") : t("product.deliveryNoteDynamic", { min: deliveryMin, max: deliveryMax })}
                </span>
              </div>

              {soldOut ? (
                <Button variant="outline" size="xl" className="w-full" disabled>
                  {t("product.unavailableCta")}
                </Button>
              ) : (
                <div className="flex gap-3 items-stretch">
                  <div className="flex items-center gap-0.5 rounded-2xl border border-border bg-black/40 p-1 shrink-0">
                    <button
                      onClick={() => setQty((v) => Math.max(1, v - 1))}
                      disabled={qty <= 1}
                      className="w-[38px] h-[38px] rounded-xl flex items-center justify-center disabled:text-muted-foreground/40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-stat font-bold text-base w-9 text-center">{qty}</span>
                    <button
                      onClick={() => setQty((v) => Math.min(qtyMax, v + 1))}
                      disabled={qty >= qtyMax}
                      className="w-[38px] h-[38px] rounded-xl flex items-center justify-center disabled:text-muted-foreground/40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <Button variant="hero" size="xl" className="flex-1" onClick={buyNow}>
                    <Zap className="w-4 h-4 mr-1" />
                    {t("product.buyNow")}
                  </Button>
                </div>
              )}

              <div className="flex flex-col gap-2.5 pt-0.5 mt-auto">
                <span className="inline-flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <Truck className="w-[15px] h-[15px] text-primary" />
                  {t("product.trustShipping")}
                </span>
                <span className="inline-flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <RotateCcw className="w-[15px] h-[15px] text-primary" />
                  {t("product.trustReturns")}
                </span>
                <span className="inline-flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <ShieldCheck className="w-[15px] h-[15px] text-primary" />
                  {t("product.trustPayment")}
                </span>
              </div>
            </div>

            {specs.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-gradient-card p-6 flex-1">
                <h3 className="font-display font-bold text-[17px] mb-2">{t("product.specsHeading")}</h3>
                <div className="flex flex-col">
                  {specs.map((sp, i) => (
                    <div
                      key={i}
                      className={`flex justify-between items-baseline gap-4 py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}
                    >
                      <span className="text-[13.5px] text-muted-foreground">{sp.label}</span>
                      <span className="text-[13.5px] font-semibold text-right">{sp.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Herstellerinfos (GPSR) — vollbreite Pflichtangaben */}
          {ext.manufacturer_name && (
            <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
              <h3 className="font-display font-bold text-[17px] mb-3">{t("product.manufacturerHeading")}</h3>
              <div className="flex flex-col gap-3 text-[13.5px]">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{ext.manufacturer_name}</span>
                  {ext.manufacturer_address && (
                    <span className="whitespace-pre-line text-muted-foreground">{ext.manufacturer_address}</span>
                  )}
                  {ext.manufacturer_email && (
                    <span className="text-muted-foreground">{ext.manufacturer_email}</span>
                  )}
                </div>
                {ext.eu_responsible_name && (
                  <div className="flex flex-col gap-0.5 pt-2.5 border-t border-border/60">
                    <span className="font-semibold">{t("product.euResponsibleHeading")}</span>
                    <span className="text-muted-foreground">{ext.eu_responsible_name}</span>
                    {ext.eu_responsible_address && (
                      <span className="whitespace-pre-line text-muted-foreground">{ext.eu_responsible_address}</span>
                    )}
                    {ext.eu_responsible_email && (
                      <span className="text-muted-foreground">{ext.eu_responsible_email}</span>
                    )}
                  </div>
                )}
                {ext.product_identifier && (
                  <span className="text-muted-foreground">{t("product.productIdentifier", { value: ext.product_identifier })}</span>
                )}
                {ext.safety_warnings && (
                  <div className="flex flex-col gap-0.5 pt-2.5 border-t border-border/60">
                    <span className="font-semibold">{t("product.safetyWarningsHeading")}</span>
                    <span className="whitespace-pre-line text-muted-foreground">{ext.safety_warnings}</span>
                  </div>
                )}
                {ext.textile_composition && (
                  <span className="text-muted-foreground">{t("product.textileComposition", { value: ext.textile_composition })}</span>
                )}
              </div>
            </div>
          )}

          {/* Beschreibung — vollbreit als Abschluss der Produktinfos */}
          {descParas.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
              <h3 className="font-display font-bold text-[17px] mb-3">{t("product.descriptionHeading")}</h3>
              <div className="flex flex-col gap-3">
                {descParas.map((text, i) => (
                  <p key={i} className="text-[14.5px] leading-relaxed text-foreground/70">{text}</p>
                ))}
              </div>
            </div>
          )}

          {/* Related */}
          {(data?.related.length || 0) > 0 && (
            <div className="flex flex-col gap-4 mt-2">
              <h3 className="font-display font-bold text-[21px] tracking-tight">{t("product.relatedHeading")}</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-[18px]">
                {data!.related.map((r) => (
                  <RelatedCard
                    key={r.id}
                    p={r}
                    brand={brands?.find((b) => b.id === r.brand_id)?.name ?? r.partner_name ?? "P2G"}
                    logo={brands?.find((b) => b.id === r.brand_id)?.logo_url ?? null}
                    onOpen={() => {
                      setQty(1);
                      setMainIdx(0);
                      navigate(`/marketplace/${r.slug}`);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </main>

      <Footer />
    </>
  );
};

function RelatedCard({ p, brand, logo, onOpen }: { p: MarketplaceItem; brand: string; logo?: string | null; onOpen: () => void }) {
  const { t, i18n } = useTranslation("marketplace");
  const price = p.price_cents ?? 0;
  const uvp = p.compare_at_price_cents ?? null;
  const off = discountPct(price, uvp);
  const soldOut = p.stock_quantity !== null && (p.stock_quantity ?? 0) <= 0;

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-2xl border border-border/60 bg-gradient-card overflow-hidden flex flex-col transition-colors hover:border-primary/50"
    >
      <div className="relative overflow-hidden">
        <div className={`aspect-[2/3] ${soldOut ? "opacity-45 grayscale" : ""}`}>
          <StorageImage src={p.image_url || "/placeholder.svg"} renderWidth={800} alt={localized(p, "name", i18n.language)} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        </div>
        {logo && (
          <span className="absolute top-3 left-3 w-8 h-8 rounded-full overflow-hidden border border-white/20 bg-black/70 backdrop-blur shadow-md">
            <img src={logo} alt={brand} className="w-full h-full object-cover" />
          </span>
        )}
        {off > 0 && (
          <span className="absolute top-3 right-3 inline-flex items-center rounded-full border border-white/15 bg-black/70 px-2.5 py-1 font-stat text-[11.5px] font-bold backdrop-blur">−{off}%</span>
        )}
        {soldOut && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex rounded-full border border-border bg-black/80 px-4 py-1.5 text-[12.5px] font-bold backdrop-blur">{t("stock.soldOut")}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-[16px_18px_18px] flex-1">
        <div className="flex flex-col gap-0.5">
          <span className="font-stat text-[10.5px] tracking-[0.14em] uppercase text-muted-foreground/80">{brand}</span>
          <h3 className="font-display font-bold text-[16.5px] leading-tight tracking-tight line-clamp-2">{localized(p, "name", i18n.language)}</h3>
        </div>
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-baseline gap-2">
            <span className="font-stat font-bold text-[17.5px]">{eur(price)}</span>
            {uvp && <span className="font-stat text-[12.5px] text-muted-foreground/70 line-through">{eur(uvp)}</span>}
          </div>
          <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}

export default MarketplaceProduct;
