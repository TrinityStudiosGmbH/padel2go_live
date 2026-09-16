import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, User, LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSectionThemes } from "@/hooks/useSectionThemes";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { TubelightNavBar } from "@/components/ui/tubelight-navbar";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import DashboardNavigation from "@/components/DashboardNavigation";
import LanguageSwitch from "@/components/LanguageSwitch";
import wordmark from "@/assets/padel2go-wordmark-light.png";

const Navigation = () => {
  const { user } = useAuth();

  // If user is logged in, show Dashboard Navigation instead
  if (user) {
    return <DashboardNavigation />;
  }

  // Public Navigation for non-authenticated users
  return <PublicNavigation />;
};

const PublicNavigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminAuth();
  const { canSee } = useFeatureToggles();
  const { t } = useTranslation("common");
  const sectionThemes = useSectionThemes();

  // Nav-Links folgen derselben Sichtbarkeit wie die Routen (Admin → Sichtbarkeit).
  const navItems = [
    { label: t("nav.home"), href: "/", show: true },
    { label: t("nav.bookCourt"), href: "/booking", color: sectionThemes.booking, show: canSee("booking") },
    { label: t("nav.marketplace"), href: "/marketplace", color: sectionThemes.market, show: canSee("marketplace") },
    { label: t("nav.events"), href: "/events", color: sectionThemes.events, show: canSee("events") },
    { label: t("nav.news"), href: "/news", color: sectionThemes.news, show: true },
    { label: t("nav.players"), href: "/fuer-spieler", show: true },
    { label: t("nav.clubs"), href: "/fuer-vereine", show: true },
  ].filter((item) => item.show);

  const tubelightItems = navItems.map(item => ({
    name: item.label,
    url: item.href,
    color: item.color,
  }));

  const handleLogout = async () => {
    await signOut();
    setActiveDropdown(null);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <NavLink to="/" className="flex items-center shrink-0">
            <img 
              src={wordmark} 
              alt="PADEL2GO" 
              className="h-6 md:h-8 w-auto"
            />
          </NavLink>

          {/* Desktop Navigation - Tubelight Style */}
          <div className="hidden lg:flex items-center gap-2">
            <TubelightNavBar items={tubelightItems} />
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setActiveDropdown(activeDropdown === 'user' ? null : 'user')}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all duration-300
                    text-muted-foreground hover:text-primary
                    bg-background/60 backdrop-blur-xl border border-border/50
                    hover:bg-primary/10
                  `}
                >
                  <User className="w-4 h-4" />
                  {t("nav.account")}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${activeDropdown === 'user' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'user' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full right-0 mt-3 py-2 w-52 bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl"
                    >
                      <NavLink
                        to="/account"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 mx-2 rounded-lg"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <User className="w-4 h-4" /> {t("nav.myAccount")}
                      </NavLink>
                      {isAdmin && (
                        <NavLink
                          to="/admin"
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 mx-2 rounded-lg"
                          onClick={() => setActiveDropdown(null)}
                        >
                          <Settings className="w-4 h-4" /> {t("nav.admin")}
                        </NavLink>
                      )}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 mx-2 rounded-lg"
                        style={{ width: 'calc(100% - 16px)' }}
                      >
                        <LogOut className="w-4 h-4" /> {t("nav.logout")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="rounded-full px-4 border border-border/50 bg-background/60 backdrop-blur-xl hover:bg-primary/10 hover:text-primary"
              >
                <NavLink to="/auth">{t("nav.login")}</NavLink>
              </Button>
            )}
            {canSee("booking") && (
              <Button
                variant="lime"
                size="sm"
                asChild
                className="rounded-full px-5 shadow-lg shadow-primary/25"
              >
                <NavLink to="/booking">{t("nav.bookCourt")}</NavLink>
              </Button>
            )}
            <LanguageSwitch variant="navigation" />
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-foreground rounded-full hover:bg-primary/10 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
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
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.href}
                  className="px-4 py-3 min-h-[48px] flex items-center text-muted-foreground hover:text-primary transition-all duration-200 rounded-xl hover:bg-primary/10 font-medium"
                  activeClassName="text-primary bg-primary/15"
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-border/50">
                {user ? (
                  <>
                    <Button variant="ghost" className="w-full justify-start rounded-xl hover:bg-primary/10 hover:text-primary" asChild>
                      <NavLink to="/account" onClick={() => setIsOpen(false)}>
                        <User className="w-4 h-4 mr-2" /> {t("nav.myAccount")}
                      </NavLink>
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" className="w-full justify-start rounded-xl hover:bg-primary/10 hover:text-primary" asChild>
                        <NavLink to="/admin" onClick={() => setIsOpen(false)}>
                          <Settings className="w-4 h-4 mr-2" /> {t("nav.admin")}
                        </NavLink>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-xl hover:bg-primary/10 hover:text-primary"
                      onClick={() => { handleLogout(); setIsOpen(false); }}
                    >
                      <LogOut className="w-4 h-4 mr-2" /> {t("nav.logout")}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" className="w-full justify-start rounded-xl hover:bg-primary/10 hover:text-primary" asChild>
                    <NavLink to="/auth" onClick={() => setIsOpen(false)}>{t("nav.login")}</NavLink>
                  </Button>
                )}
                {canSee("booking") && (
                  <Button variant="lime" className="w-full rounded-xl shadow-lg shadow-primary/25" asChild>
                    <NavLink to="/booking" onClick={() => setIsOpen(false)}>{t("nav.bookCourt")}</NavLink>
                  </Button>
                )}
                <div className="flex justify-center pt-2">
                  <LanguageSwitch variant="navigation" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navigation;
