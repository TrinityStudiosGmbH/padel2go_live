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


  // Combined, redeemable P2G points total + its euro worth.
  const redeemableCredits = (wallet?.play_credits ?? 0) + (wallet?.reward_credits ?? 0);
  const euroWorth = ((redeemableCredits * centsPerPoint) / 100).toLocaleString(numberLocale, {
    style: "currency",
    currency: "EUR",
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
                </div>
                <Button variant="ghost" onClick={handleLogout} className="text-white/80 hover:text-white hover:bg-white/10">
                  <LogOut className="w-4 h-4 mr-2" /> {t("page.logout")}
                </Button>
              </div>

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

                <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="text-[13.5px] font-bold flex-1">{t("points.balance")}</span>
                    <span className="font-stat text-[11.5px] text-primary">
                      {t("points.redeemableBadge")}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-stat text-[34px] font-bold leading-none text-primary">
                      {redeemableCredits.toLocaleString(numberLocale)}
                    </span>
                    <span className="font-stat text-sm text-foreground/70">≈ {euroWorth}</span>
                  </div>

                  <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {t("points.redeemableNote")}
                  </span>

                  <Button asChild variant="lime" className="w-full gap-2">
                    <Link to="/marketplace" className="flex items-center justify-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      <span>{t("points.redeemCta")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      </main>

      <Footer />
    </>
  );
};

export default Account;