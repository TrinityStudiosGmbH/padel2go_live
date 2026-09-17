import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { sectionThemeVars, useSectionTheme } from "@/hooks/useSectionThemes";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import { LogOut, Loader2, Coins, ShoppingBag, ArrowRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAccountData } from "@/hooks/useAccountData";
import { supabase } from "@/integrations/supabase/client";
import { resizeAvatarToSquare } from "@/lib/resizeImage";
import { MyBookings } from "@/components/booking/MyBookings";
import { AccountProfileForm } from "@/components/account";
import { AccountOrdersTab } from "@/components/account/AccountOrdersTab";
import { AccountSecurityTab } from "@/components/account/AccountSecurityTab";
import { LevelUpAnimation, ExpertLevelsGrid } from "@/components/p2g";
import { EXPERT_LEVELS, getExpertLevelEmoji } from "@/lib/expertLevels";
import { useExpertLevels, levelForPoints, nextLevelForPoints, progressToNext } from "@/hooks/useExpertLevels";
import { useLevelUpDetection } from "@/hooks/useLevelUpDetection";
import { usePointsValue } from "@/hooks/usePointsValue";

const Account = () => {
  const sectionColor = useSectionTheme("profile");
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("account");
  const numberLocale = i18n.language === "en" ? "en-US" : "de-DE";
  const { user, loading: authLoading, signOut } = useAuth();

  // Use extracted hook for data fetching
  const { loading, profile, setProfile, wallet } = useAccountData(user);
  const { centsPerPoint } = usePointsValue();

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Expert level from the admin-configurable DB levels, derived from lifetime (total
  // earned) credits. We only ever DISPLAY the level/badge — never the raw number.
  const { levels } = useExpertLevels();
  const playCredits = wallet?.play_credits ?? 0;
  const levelPoints = (wallet as any)?.lifetime_credits || wallet?.play_credits || 0;
  const dbLevel = levelForPoints(levels, levelPoints);
  const nextLevel = nextLevelForPoints(levels, levelPoints);
  const progressPct = progressToNext(levels, levelPoints);
  const multiplier = Number(dbLevel.multiplier ?? 1);
  const libLevel = EXPERT_LEVELS.find((l) => l.name === dbLevel.name) ?? EXPERT_LEVELS[0];
  const levelGradient = dbLevel.gradient ?? libLevel.gradient;
  const levelEmoji = dbLevel.emoji ?? getExpertLevelEmoji(dbLevel.name);
  const levelRemaining = nextLevel ? Math.max(0, nextLevel.min_points - levelPoints) : 0;

  // Combined, redeemable P2G points total + its euro worth.
  const redeemableCredits = (wallet?.play_credits ?? 0) + (wallet?.reward_credits ?? 0);
  const euroWorth = ((redeemableCredits * centsPerPoint) / 100).toLocaleString(numberLocale, {
    style: "currency",
    currency: "EUR",
  });

  // Level up detection
  const { showLevelUp, newLevel, previousLevel, closeLevelUp } = useLevelUpDetection({
    lifetimeCredits: levelPoints,
    enabled: !loading && !!wallet,
  });

  // Redirect if not authenticated
  if (!authLoading && !user) {
    navigate("/auth");
    return null;
  }

  const checkUsernameAvailability = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9._]/g, "");
    if (cleanUsername !== username.toLowerCase()) {
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", cleanUsername)
      .neq("user_id", user?.id ?? "")
      .maybeSingle();

    setCheckingUsername(false);
    setUsernameAvailable(!data && !error);
  };

  const handleUsernameChange = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9._]/g, "");
    setProfile(prev => ({ ...prev, username: cleanValue }));
    checkUsernameAvailability(cleanValue);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("page.toast.errorTitle"), { description: t("page.toast.selectImage") });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("page.toast.errorTitle"), { description: t("page.toast.imageTooLarge") });
      return;
    }

    setUploadingAvatar(true);

    try {
      // Square-crop + downscale to 512px JPEG before upload. Guarantees a
      // sharp source across all avatar slots (chat 8×8 to dashboard 24×24)
      // even on 3x retina displays, and keeps storage cost small.
      const processed = await resizeAvatarToSquare(file);

      // Stable filename so the same user's old avatar gets overwritten and
      // we don't accumulate orphaned files in the bucket. .jpg matches the
      // jpeg content type returned by resizeAvatarToSquare.
      const fileName = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, processed, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "2592000",
        });

      if (uploadError) throw uploadError;

      // Bust the CDN/browser cache so the new image shows immediately even
      // though the URL path is the same as the old avatar.
      const { data: { publicUrl: rawUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
      const publicUrl = `${rawUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      toast.success(t("page.toast.successTitle"), { description: t("page.toast.avatarUpdated") });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error(t("page.toast.uploadErrorTitle"), { description: error?.message || t("page.toast.avatarUploadFailed") });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (profile.username && (profile.username.length < 3 || profile.username.length > 30)) {
      toast.error(t("page.toast.errorTitle"), { description: t("page.toast.usernameLength") });
      return;
    }

    if (usernameAvailable === false) {
      toast.error(t("page.toast.errorTitle"), { description: t("page.toast.usernameTaken") });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          username: profile.username || null,
          display_name: profile.display_name || null,
          age: profile.age,
          avatar_url: profile.avatar_url,
          skill_self_rating: profile.skill_self_rating,
          games_played_self: profile.games_played_self,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success(t("page.toast.savedTitle"), { description: t("page.toast.profileSaved") });
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(t("page.toast.errorTitle"), { description: error.message || t("page.toast.profileSaveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || loading) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-background pt-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t("page.meta.title")}</title>
        <meta name="description" content={t("page.meta.description")} />
      </Helmet>

      <Navigation />

      <main className="relative min-h-screen bg-background" style={sectionThemeVars(sectionColor)}>
        <SectionShaderBackdrop color={sectionColor} />
        <div className="relative z-[1]">
        {/* Hero Header — liegt direkt auf dem Section-Shader (kein Level-Farbstreifen mehr) */}
        <div className="relative pt-24 pb-8">
          
          <div className="container mx-auto px-4 max-w-2xl relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl font-bold text-white">{t("page.title")}</h1>
                  {/* Expert Level Badge */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${levelGradient} shadow-lg`}>
                    <span className="text-lg">{levelEmoji}</span>
                    <span className="text-sm font-semibold text-white">{dbLevel.name}</span>
                  </div>
                  {/* Payback multiplier */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 border border-white/25">
                    <Coins className="w-3.5 h-3.5 text-white" />
                    <span className="text-sm font-semibold text-white">×{multiplier} Payback</span>
                  </div>
                </div>
                <Button variant="ghost" onClick={handleLogout} className="text-white/80 hover:text-white hover:bg-white/10">
                  <LogOut className="w-4 h-4 mr-2" /> {t("page.logout")}
                </Button>
              </div>

              {/* Progress to next expert level (level progress only, no raw credits) */}
              {nextLevel && (
                <div className="mt-4">
                  <div className="flex justify-end text-xs text-white/70 mb-1">
                    <span>{t("page.progressRemaining", { remaining: levelRemaining.toLocaleString(numberLocale), level: nextLevel.name })}</span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${levelGradient}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="container mx-auto px-4 max-w-2xl py-8">
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-y-1">
              <TabsTrigger value="profile">{t("page.tabs.profile")}</TabsTrigger>
              <TabsTrigger value="bookings">{t("page.tabs.bookings")}</TabsTrigger>
              <TabsTrigger value="orders">{t("page.tabs.orders")}</TabsTrigger>
              <TabsTrigger value="p2g-points" className="text-xs sm:text-sm">{t("page.tabs.p2gPoints")}</TabsTrigger>
              <TabsTrigger value="security">{t("page.tabs.security")}</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <AccountProfileForm
                profile={profile}
                setProfile={setProfile}
                saving={saving}
                uploadingAvatar={uploadingAvatar}
                checkingUsername={checkingUsername}
                usernameAvailable={usernameAvailable}
                onSave={handleSave}
                onAvatarUpload={handleAvatarUpload}
                onUsernameChange={handleUsernameChange}
              />
            </TabsContent>

            <TabsContent value="bookings" className="space-y-6">
              <MyBookings />
            </TabsContent>

            <TabsContent value="orders" className="space-y-6">
              <AccountOrdersTab />
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <AccountSecurityTab />
            </TabsContent>

            <TabsContent value="p2g-points" className="space-y-6">
              {/* Combined, redeemable P2G points total + euro worth */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-2xl p-6"
              >
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-primary" /> {t("points.title")}
                </h2>

                <div className="bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 rounded-xl p-4 border border-emerald-500/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {t("points.redeemableBadge")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("points.balance")}</p>
                      <p className="text-4xl font-bold text-emerald-400">{redeemableCredits.toLocaleString(numberLocale)}</p>
                      <p className="text-sm text-muted-foreground mt-1">≈ {euroWorth}</p>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Coins className="w-7 h-7 text-emerald-400" />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">{t("points.redeemableNote")}</p>

                  <div className="mt-4 pt-3 border-t border-emerald-500/20">
                    <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Link to="/marketplace" className="flex items-center justify-center gap-2">
                        <ShoppingBag className="w-4 h-4" />
                        <span>{t("points.redeemCta")}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </motion.div>

              {/* Expert Levels — display level/badge only, computed from play credits */}
              <ExpertLevelsGrid currentPoints={levelPoints} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      </main>

      <Footer />

      {/* Level Up Animation */}
      {newLevel && (
        <LevelUpAnimation
          isOpen={showLevelUp}
          onClose={closeLevelUp}
          newLevel={newLevel}
          previousLevel={previousLevel ?? undefined}
        />
      )}
    </>
  );
};

export default Account;