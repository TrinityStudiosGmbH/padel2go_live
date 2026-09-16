import { Link, Outlet } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Loader2, EyeOff, ArrowLeft } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles, FEATURE_LABELS, type FeatureName } from "@/hooks/useFeatureToggles";

interface RequireFeatureProps {
  feature: FeatureName;
}

/**
 * Der eine Guard für Funktions-Sichtbarkeit (visible / demo / hidden).
 * - lädt → Spinner
 * - sichtbar → Route rendern; im Demo-Zustand zusätzlich der Admin-Vorschau-Hinweis
 * - sonst → immer dieselbe „Bald verfügbar"-Seite, nie ein stiller Redirect
 */
export function RequireFeature({ feature }: RequireFeatureProps) {
  const { canSee, isPreview, isLoading } = useFeatureToggles();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canSee(feature)) {
    return <FeatureComingSoon feature={feature} />;
  }

  return (
    <>
      {isPreview(feature) && <AdminPreviewPill feature={feature} />}
      <Outlet />
    </>
  );
}

/** Einheitliche „Bald verfügbar"-Seite für jede verborgene Funktion. */
export function FeatureComingSoon({ feature }: RequireFeatureProps) {
  const { t } = useTranslation("common");
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>{`${t("featureComingSoon.title")} | PADEL2GO`}</title>
      </Helmet>
      <Navigation />
      <main className="min-h-screen bg-background pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md text-center py-20">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-4">
            <EyeOff className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t("featureComingSoon.title")}</h1>
          <p className="text-muted-foreground mb-6">{t(`featureComingSoon.${feature}`)}</p>
          <Button variant="outline" asChild>
            <Link to={user ? "/dashboard" : "/"}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("featureComingSoon.back")}
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Fester Hinweis unten links, solange ein Admin eine Demo-Funktion sieht. */
function AdminPreviewPill({ feature }: RequireFeatureProps) {
  return (
    <Link
      to="/admin/features"
      className="fixed bottom-4 left-4 z-[60] inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-blue-500/40 bg-[hsl(0_0%_6%/0.92)] px-3.5 py-2 text-xs font-semibold text-blue-300 shadow-lg backdrop-blur-md transition-colors hover:border-blue-400/70"
    >
      <EyeOff className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Admin-Vorschau: {FEATURE_LABELS[feature]} · nur Admins sehen das</span>
    </Link>
  );
}
