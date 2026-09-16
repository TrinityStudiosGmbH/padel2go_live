import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Plus, Building2, BarChart3, Video } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LocationForm, QUERY_KEY, Location, AdminLocationCard } from "@/components/admin/courts";
import { AdminCourtCard } from "@/components/admin/courts/AdminCourtCard";
import { LocationAnalyticsTab } from "@/components/admin/courts/LocationAnalyticsTab";
import { courtSport } from "@/components/admin/courts/types";
import { SportScopeTabs, type SportScope } from "@/components/admin/SportScopeTabs";
import { CameraApiKeysTab, CameraSessionsTab, CameraTestSimulator } from "@/components/admin/cameras";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const TAB_TRIGGER_CLASSES =
  "-mb-px gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-sm font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

const TAB_COUNT_CLASSES =
  "rounded-full bg-white/[0.07] px-[7px] py-[2px] font-mono text-[10.5px] font-normal leading-none";

export default function AdminCourts() {
  const { isSuperAdmin } = useAdminAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("standorte");
  const [courtScope, setCourtScope] = useState<SportScope>("all");

  const { data: locations, isLoading } = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select(`
          id,
          name,
          slug,
          address,
          description,
          is_online,
          is_24_7,
          postal_code,
          city,
          country,
          main_image_url,
          tennis_image_url,
          whatsapp_group_url,
          opening_hours_json,
          rewards_enabled,
          ai_analysis_enabled,
          vending_enabled,
          features_json,
          courts (id, name, is_active, location_id, label, sport)
        `)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Location[];
    },
  });

  // Flatten all courts with their location info
  const allCourts = locations?.flatMap(location =>
    (location.courts || []).map(court => ({
      court,
      location: {
        id: location.id,
        name: location.name,
        main_image_url: location.main_image_url,
        tennis_image_url: location.tennis_image_url,
        city: location.city,
      }
    }))
  ) || [];

  const totalLocations = locations?.length || 0;
  const onlineLocations = locations?.filter(l => l.is_online).length || 0;
  const totalCourts = allCourts.length;
  const activeCourts = allCourts.filter(c => c.court.is_active).length;
  const tennisCourts = allCourts.filter(c => courtSport(c.court) === "tennis").length;
  const padelCourts = totalCourts - tennisCourts;

  const visibleCourts =
    courtScope === "all"
      ? allCourts
      : allCourts.filter(c => courtSport(c.court) === courtScope);

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Kopfzeile: Zähler + Neuer Standort */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{totalLocations} Standorte</span>{" "}
            ({onlineLocations} online)
            <span className="mx-1.5">•</span>
            <span className="font-bold text-foreground">{totalCourts} Courts</span>{" "}
            ({activeCourts} aktiv)
            <span className="mx-1.5">·</span>
            <span className="font-bold text-primary">{padelCourts} Padel</span>
            <span className="mx-1.5">·</span>
            <span className="font-bold text-[#7FD4FF]">{tennisCourts} Tennis</span>
          </p>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 w-full gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] transition-opacity hover:opacity-90 sm:w-auto">
                <Plus className="h-[15px] w-[15px]" />
                Neuer Standort
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))]">
              <DialogHeader className="gap-[5px] space-y-0 text-left">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Standort
                </span>
                <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                  Neuer Standort
                </DialogTitle>
              </DialogHeader>
              <LocationForm
                onSuccess={() => {
                  setIsCreateDialogOpen(false);
                  queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-[hsl(0_0%_12%)] bg-transparent p-0 sm:gap-[22px]">
            <TabsTrigger value="standorte" className={TAB_TRIGGER_CLASSES}>
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Standorte</span>
              <span className="sm:hidden">Std.</span>
              <span className={TAB_COUNT_CLASSES}>{totalLocations}</span>
            </TabsTrigger>
            <TabsTrigger value="courts" className={TAB_TRIGGER_CLASSES}>
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Courts</span>
              <span className="sm:hidden">Cts.</span>
              <span className={TAB_COUNT_CLASSES}>{visibleCourts.length}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className={TAB_TRIGGER_CLASSES}>
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="cameras" className={TAB_TRIGGER_CLASSES}>
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">KI-Kameras</span>
              <span className="sm:hidden">Cam</span>
            </TabsTrigger>
          </TabsList>

          {/* Standorte Tab */}
          <TabsContent value="standorte" className="mt-5">
            {isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(370px,100%),1fr))] items-start gap-[18px]">
                {[...Array(2)].map((_, i) => (
                  <Card key={i} className="animate-pulse overflow-hidden rounded-2xl border-border bg-gradient-card">
                    <div className="h-[150px] bg-muted/60" />
                    <div className="space-y-4 p-5">
                      <div className="h-5 w-3/4 rounded bg-muted" />
                      <div className="h-4 w-1/2 rounded bg-muted" />
                      <div className="h-20 rounded-xl bg-muted" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : locations && locations.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(370px,100%),1fr))] items-start gap-[18px]">
                {locations.map((location) => (
                  <AdminLocationCard key={location.id} location={location} />
                ))}
              </div>
            ) : (
              <Card className="rounded-2xl border-border bg-gradient-card">
                <div className="flex flex-col items-center py-12 text-center">
                  <span className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-muted-foreground">Keine Standorte konfiguriert</p>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Courts Tab */}
          <TabsContent value="courts" className="mt-5">
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">
                  {visibleCourts.length} Courts
                </span>{" "}
                ({visibleCourts.filter(c => c.court.is_active).length} aktiv)
              </p>
              <SportScopeTabs value={courtScope} onChange={setCourtScope} />
            </div>
            {isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(290px,100%),1fr))] items-start gap-[18px]">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="animate-pulse overflow-hidden rounded-2xl border-border bg-gradient-card">
                    <div className="aspect-[21/9] bg-muted/60" />
                    <div className="space-y-3 p-4">
                      <div className="h-5 w-3/4 rounded bg-muted" />
                      <div className="h-4 w-1/2 rounded bg-muted" />
                      <div className="h-8 rounded-[10px] bg-muted" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : visibleCourts.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(290px,100%),1fr))] items-start gap-[18px]">
                {visibleCourts.map(({ court, location }, index) => (
                  <AdminCourtCard
                    key={court.id}
                    court={court}
                    location={location}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <Card className="rounded-2xl border-border bg-gradient-card">
                <div className="flex flex-col items-center py-12 text-center">
                  <span className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_72%)]">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {courtScope === "tennis"
                      ? "Keine Tennis-Courts konfiguriert"
                      : courtScope === "padel"
                        ? "Keine Padel-Courts konfiguriert"
                        : "Keine Courts konfiguriert"}
                  </p>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-5">
            {isLoading ? (
              <Card className="animate-pulse rounded-2xl border-border bg-gradient-card">
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="h-10 w-1/3 rounded-[10px] bg-muted" />
                  <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-6">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-muted" />
                    ))}
                  </div>
                </div>
              </Card>
            ) : locations ? (
              <LocationAnalyticsTab locations={locations} />
            ) : null}
          </TabsContent>

          {/* KI-Kameras Tab */}
          <TabsContent
            value="cameras"
            className="mt-5 grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
          >
            <div className="flex min-w-0 flex-col gap-[18px]">
              <CameraSessionsTab />
              {/* Schreibt Zufalls-Matches in echte Wallets — nur fuer den Superadmin. */}
              {isSuperAdmin && <CameraTestSimulator />}
            </div>
            <div className="min-w-0">
              <CameraApiKeysTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
