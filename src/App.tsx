import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import GeoLanguageBanner from "@/components/GeoLanguageBanner";
import SeoHead from "@/components/SeoHead";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireFeature } from "@/components/RequireFeature";
import { RequireProfileComplete } from "@/components/RequireProfileComplete";
import { ClubLayout } from "./components/club/ClubLayout";

// Route-level code splitting: each page is its own lazy chunk so first-time
// marketing visitors no longer download the admin/club/dashboard bundles (or
// three.js). Loaded on demand behind the <Suspense> boundary below.
const Index = lazy(() => import("./pages/Index"));
const FuerSpieler = lazy(() => import("./pages/FuerSpieler"));
const FuerVereine = lazy(() => import("./pages/FuerVereine"));
const AppBooking = lazy(() => import("./pages/AppBooking"));
const League = lazy(() => import("./pages/League"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceProduct = lazy(() => import("./pages/MarketplaceProduct"));
const MarketplaceCheckout = lazy(() => import("./pages/MarketplaceCheckout"));
const MarketplaceSuccess = lazy(() => import("./pages/MarketplaceSuccess"));
const FaqKontakt = lazy(() => import("./pages/FaqKontakt"));
const Impressum = lazy(() => import("./pages/Impressum"));
const Auth = lazy(() => import("./pages/Auth"));
const Account = lazy(() => import("./pages/Account"));
const Play = lazy(() => import("./pages/Play"));
const Booking = lazy(() => import("./pages/Booking"));
const BookingLocation = lazy(() => import("./pages/BookingLocation"));
const BookingCheckout = lazy(() => import("./pages/BookingCheckout"));
const BookingSuccess = lazy(() => import("./pages/BookingSuccess"));
const BookingCancel = lazy(() => import("./pages/BookingCancel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const News = lazy(() => import("./pages/News"));
const NewsArticle = lazy(() => import("./pages/NewsArticle"));
const NewsletterConfirm = lazy(() => import("./pages/NewsletterConfirm"));
const NewsletterUnsubscribe = lazy(() => import("./pages/NewsletterUnsubscribe"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const Lobbies = lazy(() => import("./pages/Lobbies"));

// Dashboard Pages (Logged-In)
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const DashboardLeague = lazy(() => import("./pages/dashboard/DashboardLeague"));
const DashboardEvents = lazy(() => import("./pages/dashboard/DashboardEvents"));
const DashboardP2GPoints = lazy(() => import("./pages/dashboard/DashboardP2GPoints"));
const DashboardFriends = lazy(() => import("./pages/dashboard/DashboardFriends"));
const DashboardChat = lazy(() => import("./pages/dashboard/DashboardChat"));

// Club Pages
const ClubDashboard = lazy(() => import("./pages/club/ClubDashboard"));
const ClubBookings = lazy(() => import("./pages/club/ClubBookings"));
const ClubMembers = lazy(() => import("./pages/club/ClubMembers"));
const ClubCalendar = lazy(() => import("./pages/club/ClubCalendar"));
const ClubCourtFeatures = lazy(() => import("./pages/club/ClubCourtFeatures"));
const ClubUtilization = lazy(() => import("./pages/club/ClubUtilization"));

// Admin Pages
const Onboarding = lazy(() => import("./pages/Onboarding"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminBookings = lazy(() => import("./pages/admin/AdminBookings"));
const AdminCourts = lazy(() => import("./pages/admin/AdminCourts"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminRoles = lazy(() => import("./pages/admin/AdminRoles"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminUtilization = lazy(() => import("./pages/admin/AdminUtilization"));
const AdminVisuals = lazy(() => import("./pages/admin/AdminVisuals"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminMarketplace = lazy(() => import("./pages/admin/AdminMarketplace"));
const AdminP2GPoints = lazy(() => import("./pages/admin/AdminP2GPoints"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminFeatures = lazy(() => import("./pages/admin/AdminFeatures"));
const AdminClubs = lazy(() => import("./pages/admin/AdminClubs"));
const AdminVouchers = lazy(() => import("./pages/admin/AdminVouchers"));
const AdminLocationTeasers = lazy(() => import("./pages/admin/AdminLocationTeasers"));
const AdminSkyPadelGallery = lazy(() => import("./pages/admin/AdminSkyPadelGallery"));
const AdminPartnerTiles = lazy(() => import("./pages/admin/AdminPartnerTiles"));
const AdminQrPanel = lazy(() => import("./pages/admin/AdminQrPanel"));
const QrLanding = lazy(() => import("./pages/QrLanding"));
const AdminNews = lazy(() => import("./pages/admin/AdminNews"));
const AdminColors = lazy(() => import("./pages/admin/AdminColors"));
const AdminIntegrations = lazy(() => import("./pages/admin/AdminIntegrations"));
const AdminNewsletter = lazy(() => import("./pages/admin/AdminNewsletter"));
const AGB = lazy(() => import("./pages/AGB"));
const Datenschutz = lazy(() => import("./pages/Datenschutz"));
const Widerruf = lazy(() => import("./pages/Widerruf"));
const Versand = lazy(() => import("./pages/Versand"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most data is not second-to-second critical; a short stale window plus no
      // window-focus refetch stops the app-wide refetch storms (was staleTime:0).
      // Queries that need fresher data override this per-hook.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <ScrollToTop />
          <ErrorBoundary>
            <AuthProvider>
            <SeoHead />
            <GeoLanguageBanner />
            {/* Platz fuer die Sprachleiste: sie liegt fest oben, der Inhalt
                rueckt entsprechend nach unten statt darunter zu verschwinden. */}
            <div style={{ paddingTop: "var(--p2g-banner-h, 0px)" }}>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/qr" element={<QrLanding />} />
              <Route path="/fuer-spieler" element={<FuerSpieler />} />
              <Route path="/fuer-vereine" element={<FuerVereine />} />
              <Route path="/app-booking" element={<AppBooking />} />
              <Route path="/league" element={<League />} />
              <Route element={<RequireFeature feature="events" />}>
                <Route path="/events" element={<Events />} />
                <Route path="/events/:slug" element={<EventDetail />} />
              </Route>
              <Route path="/news" element={<News />} />
              <Route path="/news/:slug" element={<NewsArticle />} />
              <Route element={<RequireFeature feature="marketplace" />}>
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/marketplace/success" element={<MarketplaceSuccess />} />
                <Route path="/marketplace/:slug" element={<MarketplaceProduct />} />
                <Route path="/marketplace/:slug/checkout" element={<MarketplaceCheckout />} />
              </Route>
              <Route path="/faq-kontakt" element={<FaqKontakt />} />
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/play" element={<Play />} />
              <Route path="/newsletter/bestaetigen" element={<NewsletterConfirm />} />
              <Route path="/newsletter/abmelden" element={<NewsletterUnsubscribe />} />

              {/* Public booking routes — no login required (guest checkout supported).
                  Sichtbarkeit über feature_booking_state; Success/Cancel bleiben offen (Rückkehr von Stripe). */}
              <Route element={<RequireFeature feature="booking" />}>
                <Route path="/booking" element={<Booking />} />
                <Route path="/booking/locations/:slug" element={<BookingLocation />} />
                <Route path="/booking/checkout" element={<BookingCheckout />} />
              </Route>
              <Route path="/booking/success" element={<BookingSuccess />} />
              <Route path="/booking/cancel" element={<BookingCancel />} />

              {/* Protected Routes — require login */}
              <Route element={<RequireAuth />}>
                {/* Einmaliges Profil-Onboarding — liegt VOR dem Vollständigkeits-Guard. */}
                <Route path="/willkommen" element={<Onboarding />} />

                {/* Alles Weitere erst mit vollständigem Profil (sonst → /willkommen). */}
                <Route element={<RequireProfileComplete />}>
                {/* Always accessible after login: account + minimal dashboard (Übersicht + Booking) */}
                <Route path="/account" element={<Account />} />
                <Route path="/dashboard" element={<DashboardHome />} />
                <Route path="/dashboard/home" element={<DashboardHome />} />
                {/* Logged-in users use the same redesigned public booking flow. */}
                <Route path="/dashboard/booking" element={<Navigate to="/booking" replace />} />

                {/* Alle Funktionen laufen über denselben Guard (visible / demo / hidden).
                    Unsichtbar zeigt immer die „Bald verfügbar"-Seite, nie einen stillen Redirect. */}
                <Route element={<RequireFeature feature="friends" />}>
                  <Route path="/dashboard/friends" element={<DashboardFriends />} />
                  <Route path="/dashboard/chat" element={<DashboardChat />} />
                </Route>
                <Route element={<RequireFeature feature="lobbies" />}>
                  <Route path="/lobbies" element={<Lobbies />} />
                  <Route path="/lobbies/:id" element={<Lobbies />} />
                </Route>
                <Route element={<RequireFeature feature="p2g" />}>
                  <Route path="/dashboard/p2g-points" element={<DashboardP2GPoints />} />
                </Route>
                <Route element={<RequireFeature feature="league" />}>
                  <Route path="/dashboard/league" element={<DashboardLeague />} />
                </Route>
                <Route element={<RequireFeature feature="events" />}>
                  <Route path="/dashboard/events" element={<DashboardEvents />} />
                </Route>
                {/* Logged-in users use the same public shop; old route redirects. */}
                <Route path="/dashboard/marketplace" element={<Navigate to="/marketplace" replace />} />

                {/* Club portal — gated by ClubLayout itself (isClubUser check). */}
                <Route path="/club" element={<ClubLayout />}>
                  <Route index element={<ClubDashboard />} />
                  <Route path="bookings" element={<ClubBookings />} />
                  <Route path="members" element={<ClubMembers />} />
                  <Route path="calendar" element={<ClubCalendar />} />
                  <Route path="utilization" element={<ClubUtilization />} />
                  <Route path="court" element={<ClubCourtFeatures />} />
                </Route>

                {/* Admin Routes — admin-only via AdminLayout, which redirects non-admins. */}
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/bookings" element={<AdminBookings />} />
                <Route path="/admin/courts" element={<AdminCourts />} />
                <Route path="/admin/pricing" element={<AdminPricing />} />
                <Route path="/admin/events" element={<AdminEvents />} />
                <Route path="/admin/marketplace" element={<AdminMarketplace />} />
                <Route path="/admin/p2g-points" element={<AdminP2GPoints />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/utilization" element={<AdminUtilization />} />
                <Route path="/admin/visuals" element={<AdminVisuals />} />
                <Route path="/admin/features" element={<AdminFeatures />} />
                <Route path="/admin/clubs" element={<AdminClubs />} />
                <Route path="/admin/vouchers" element={<AdminVouchers />} />
                <Route path="/admin/location-teasers" element={<AdminLocationTeasers />} />
                <Route path="/admin/skypadel-gallery" element={<AdminSkyPadelGallery />} />
                <Route path="/admin/partner-tiles" element={<AdminPartnerTiles />} />
                <Route path="/admin/qr-panel" element={<AdminQrPanel />} />
                <Route path="/admin/news" element={<AdminNews />} />
                <Route path="/admin/farben" element={<AdminColors />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/integrations" element={<AdminIntegrations />} />
                <Route path="/admin/newsletter" element={<AdminNewsletter />} />
                </Route>
              </Route>

              {/* Public Profile */}
              <Route path="/u/:username" element={<PublicProfile />} />
              <Route path="/agb" element={<AGB />} />
              <Route path="/datenschutz" element={<Datenschutz />} />
              <Route path="/widerruf" element={<Widerruf />} />
              <Route path="/versand" element={<Versand />} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </div>
            <CookieConsentBanner />
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
