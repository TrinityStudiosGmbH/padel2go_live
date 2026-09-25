import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  ShieldCheck,
  ChartLine,
  Gauge,
  Calendar,
  MapPin,
  CalendarClock,
  Building2,
  Ticket,
  ShoppingBag,
  Tag,
  Megaphone,
  Images,
  Handshake,
  QrCode,
  Newspaper,
  Palette,
  Image,
  Users,
  Bell,
  Mail,
  Plug,
  ToggleRight,
  Settings,
  ExternalLink,
  LogOut,
  Search,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import p2gIcon from "@/assets/p2g-icon-clean.png";

const NAV_GROUPS = [
  {
    label: "Übersicht",
    items: [
      { title: "Overview", url: "/admin", icon: LayoutDashboard },
      { title: "Analytics", url: "/admin/analytics", icon: ChartLine },
      { title: "Auslastung", url: "/admin/utilization", icon: Gauge },
    ],
  },
  {
    label: "Betrieb",
    items: [
      { title: "Buchungen", url: "/admin/bookings", icon: Calendar },
      { title: "Courts & Standorte", url: "/admin/courts", icon: MapPin },
      { title: "Preise & Punkte", url: "/admin/pricing", icon: CalendarClock },
      { title: "Clubs", url: "/admin/clubs", icon: Building2 },
      { title: "Events", url: "/admin/events", icon: Ticket },
    ],
  },
  {
    label: "Commerce",
    items: [
      { title: "Marketplace", url: "/admin/marketplace", icon: ShoppingBag },
      { title: "Vouchers", url: "/admin/vouchers", icon: Tag },
      { title: "Belege", url: "/admin/belege", icon: FileText },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Location Teasers", url: "/admin/location-teasers", icon: Megaphone },
      { title: "SkyPadel Galerie", url: "/admin/skypadel-gallery", icon: Images },
      { title: "Partner-Kacheln", url: "/admin/partner-tiles", icon: Handshake },
      { title: "QR-Panel", url: "/admin/qr-panel", icon: QrCode },
      { title: "News / Artikel", url: "/admin/news", icon: Newspaper },
      { title: "Farben (App & Web)", url: "/admin/farben", icon: Palette },
      { title: "Visuals", url: "/admin/visuals", icon: Image },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Benutzer", url: "/admin/users", icon: Users },
      { title: "Rollen & Rechte", url: "/admin/roles", icon: ShieldCheck },
      { title: "Mitteilungen", url: "/admin/notifications", icon: Bell },
      { title: "Newsletter", url: "/admin/newsletter", icon: Mail },
      { title: "Integrationen", url: "/admin/integrations", icon: Plug },
      { title: "Sichtbarkeit", url: "/admin/features", icon: ToggleRight },
      { title: "Einstellungen", url: "/admin/settings", icon: Settings },
    ],
  },
];

export const menuItems = NAV_GROUPS.flatMap((group) => group.items);

const COUNT_HINTS: Record<string, string> = {
  "/admin/bookings": "Bestätigte Buchungen heute",
  "/admin/marketplace": "Offene Bestellungen",
};

export function AdminSidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, pages } = useAdminAuth();
  const [query, setQuery] = useState("");

  const isActive = (url: string) => {
    if (url === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(url);
  };

  const { data: navCounts } = useQuery({
    queryKey: ["admin-sidebar-counts"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const [bookingsRes, ordersRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("status", "confirmed")
          .gte("start_time", dayStart.toISOString())
          .lt("start_time", dayEnd.toISOString()),
        (supabase as any)
          .from("marketplace_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("status", "success")
          .eq("fulfillment_status", "pending"),
      ]);
      return {
        "/admin/bookings": bookingsRes.count ?? 0,
        "/admin/marketplace": ordersRes.count ?? 0,
      } as Record<string, number>;
    },
  });

  // Eine eigene Rolle sieht ausschließlich ihre Seiten — ein Link, der ohnehin
  // umleiten würde, gehört nicht ins Menü. Vollzugriff sieht alles.
  const allowedRoutes = new Set(pages.map((p) => p.route));
  const visibleGroups = isAdmin
    ? NAV_GROUPS
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => allowedRoutes.has(item.url)),
      })).filter((group) => group.items.length > 0);

  const q = query.trim().toLowerCase();
  const groups = q
    ? visibleGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.toLowerCase().includes(q)),
      })).filter((group) => group.items.length > 0)
    : visibleGroups;

  return (
    <Sidebar className="border-r border-[hsl(0_0%_12%)]">
      <SidebarHeader className="z-10 flex flex-col gap-3 border-b border-[hsl(0_0%_12%)] bg-[hsl(0_0%_4%/0.92)] px-[18px] pb-4 pt-[18px] backdrop-blur-xl">
        <Link to="/admin" className="flex items-center gap-2.5">
          <img src={p2gIcon} alt="PADEL2GO" className="h-7 w-auto" />
          <span className="font-display text-[15px] font-extrabold tracking-tight text-foreground">
            PADEL<span className="text-primary">2</span>GO
          </span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
            Admin
          </span>
        </Link>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-[11px] h-[15px] w-[15px] text-[hsl(0_0%_58%)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="h-[38px] w-full rounded-[11px] border border-[hsl(0_0%_14%)] bg-white/[0.04] pl-9 pr-3 font-sans text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </SidebarHeader>

      <SidebarContent className="gap-0 bg-gradient-to-b from-[hsl(0_0%_4%)] to-black pb-4">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-px pb-1 pt-3">
            <span className="px-[18px] pb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[hsl(0_0%_58%)]">
              {group.label}
            </span>
            {group.items.map((item) => {
              const active = isActive(item.url);
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  className={`flex items-center gap-[11px] border-l-2 px-[18px] py-[9px] text-[13.5px] font-semibold transition-colors ${
                    active
                      ? "border-primary bg-primary/[0.09] text-primary"
                      : "border-transparent text-[hsl(0_0%_62%)] hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 flex-none" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {(navCounts?.[item.url] ?? 0) > 0 && (
                    <span
                      title={COUNT_HINTS[item.url]}
                      className="flex-none rounded-full bg-primary/10 px-[7px] py-[2px] font-mono text-[10.5px] text-primary"
                    >
                      {navCounts![item.url]}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-2.5 border-t border-[hsl(0_0%_12%)] px-[18px] pb-5 pt-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[12.5px] font-semibold text-[hsl(0_0%_58%)] transition-colors hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Zur Homepage
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-[12.5px] font-semibold text-[hsl(0_0%_58%)] transition-colors hover:text-primary"
        >
          <LogOut className="h-3.5 w-3.5" />
          Abmelden
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
