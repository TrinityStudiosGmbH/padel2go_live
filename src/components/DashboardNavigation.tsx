import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, User, Settings, Building2, Coins, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavLink } from "@/components/NavLink";
import { TubelightNavBar } from "@/components/ui/tubelight-navbar";
import { NotificationCenter } from "@/components/notifications";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useClubAuth } from "@/hooks/useClubAuth";
import { useChatRealtime } from "@/hooks/useChat";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useSectionThemes } from "@/hooks/useSectionThemes";
import { useAccountData } from "@/hooks/useAccountData";
import { usePointsValue } from "@/hooks/usePointsValue";
import wordmark from "@/assets/padel2go-wordmark.png";

const DashboardNavigation = () => {
  const { t, i18n } = useTranslation("dashboardnav");
  const numberLocale = i18n.language === "en" ? "en-US" : "de-DE";
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminAuth();
  const { isClubUser } = useClubAuth();
  const { canSee } = useFeatureToggles();
  const sectionThemes = useSectionThemes();
  const { wallet, profile } = useAccountData(user);
  const { centsPerPoint } = usePointsValue();

  // Live chat updates everywhere (chat page relies on this for realtime data,
  // even though the nav no longer surfaces a chat icon)
  useChatRealtime();

  const totalCredits = (wallet?.play_credits || 0) + (wallet?.reward_credits || 0);
  const balanceWorthEuro = (totalCredits * centsPerPoint / 100).toFixed(2);

  const accountName = profile.display_name || profile.username || user?.email || t("menu.account");
  const initials =
    accountName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  // Nav-Links folgen derselben Sichtbarkeit wie die Routen (Admin → Sichtbarkeit).
  const dashboardItems = [
    { name: t("nav.meinP2G"), url: "/dashboard/home", show: true, color: sectionThemes.home },
    { name: t("nav.booking"), url: "/booking", show: canSee("booking"), color: sectionThemes.booking },
    { name: t("nav.marketplace"), url: "/marketplace", show: canSee("marketplace"), color: sectionThemes.market },
    { name: t("nav.events"), url: "/dashboard/events", show: canSee("events"), color: sectionThemes.events },
    { name: t("nav.news"), url: "/news", show: true, color: sectionThemes.news },
  ]
    .filter((item) => item.show)
    .map(({ show, ...item }) => item);

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20 gap-2">
          {/* Logo */}
          <NavLink to="/dashboard/home" className="flex items-center shrink-0 will-change-transform">
            <img
              src={wordmark}
              alt="PADEL2GO"
              className="h-5 sm:h-6 md:h-8 w-auto"
              style={{ transform: "translateZ(0)" }}
            />
          </NavLink>

          {/* Desktop Navigation - Tubelight Style */}
          <div className="hidden lg:flex items-center">
            <TubelightNavBar items={dashboardItems} />
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* P2G points balance + its euro worth — always visible */}
            <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 sm:px-3 sm:py-1.5">
              <Coins className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-semibold tabular-nums leading-none">
                {totalCredits.toLocaleString(numberLocale)}
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap leading-none">
                {t("points.worth", { amount: balanceWorthEuro })}
              </span>
            </div>

            {/* Desktop-only icon actions */}
            <div className="hidden lg:flex items-center gap-2">
              <NotificationCenter />
            </div>

            {/* Profile menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shrink-0">
                  <Avatar className="w-9 h-9 border border-border/50">
                    <AvatarImage src={profile.avatar_url || undefined} alt={accountName} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{accountName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/booking" className="cursor-pointer">
                    <CalendarDays className="w-4 h-4 mr-2" />
                    {t("menu.myBookings")}
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <NavLink to="/account" className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    {t("menu.account")}
                  </NavLink>
                </DropdownMenuItem>
                {isClubUser && (
                  <DropdownMenuItem asChild>
                    <NavLink to="/club" className="cursor-pointer">
                      <Building2 className="w-4 h-4 mr-2" />
                      {t("actions.clubPortal")}
                    </NavLink>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <NavLink to="/admin" className="cursor-pointer">
                      <Settings className="w-4 h-4 mr-2" />
                      {t("actions.admin")}
                    </NavLink>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("actions.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 text-foreground rounded-full hover:bg-primary/10 transition-colors shrink-0"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border/50 overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
              {dashboardItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.url}
                  className="px-4 py-3 min-h-[48px] flex items-center text-muted-foreground hover:text-primary transition-all duration-200 rounded-xl hover:bg-primary/10 font-medium"
                  activeClassName="text-primary bg-primary/15"
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default DashboardNavigation;
