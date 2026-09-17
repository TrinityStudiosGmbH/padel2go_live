import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { User, Camera, Save, Loader2, Check, X, Trophy, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { Profile } from "./types";
import { UserAvatar } from "@/components/UserAvatar";

interface AccountProfileFormProps {
  profile: Profile;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  saving: boolean;
  uploadingAvatar: boolean;
  checkingUsername: boolean;
  usernameAvailable: boolean | null;
  onSave: () => void;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUsernameChange: (value: string) => void;
}

export function AccountProfileForm({
  profile,
  setProfile,
  saving,
  uploadingAvatar,
  checkingUsername,
  usernameAvailable,
  onSave,
  onAvatarUpload,
  onUsernameChange,
}: AccountProfileFormProps) {
  const { t } = useTranslation("account");
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
        <User className="w-5 h-5 text-primary" /> {t("profileForm.title")}
      </h2>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <UserAvatar
            src={profile.avatar_url}
            name={profile.display_name || profile.username}
            alt={t("profileForm.avatarAlt")}
            className="w-20 h-20 border-2 border-border text-2xl"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarUpload} className="hidden" />
        </div>
        <div>
          <p className="font-medium">{profile.display_name || t("profileForm.defaultName")}</p>
          <p className="text-sm text-muted-foreground">
            {profile.username ? `@${profile.username}` : t("profileForm.noUsername")}
          </p>
        </div>
      </div>

      {/* Username */}
      <div className="mb-4">
        <Label htmlFor="username">{t("profileForm.usernameLabel")}</Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
          <Input
            id="username"
            value={profile.username || ""}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={t("profileForm.usernamePlaceholder")}
            className="pl-8 pr-10"
            maxLength={30}
          />
          {checkingUsername && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          {!checkingUsername && usernameAvailable === true && profile.username && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
          {!checkingUsername && usernameAvailable === false && <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("profileForm.usernameHint")}</p>
      </div>

      {/* Display Name */}
      <div className="mb-4">
        <Label htmlFor="displayName">{t("profileForm.displayNameLabel")}</Label>
        <Input
          id="displayName"
          value={profile.display_name || ""}
          onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
          placeholder={t("profileForm.displayNamePlaceholder")}
          className="mt-1"
        />
      </div>

      {/* Age */}
      <div className="mb-6">
        <Label htmlFor="age">{t("profileForm.ageLabel")}</Label>
        <Input
          id="age"
          type="number"
          min={0}
          max={120}
          value={profile.age || ""}
          onChange={(e) => setProfile(prev => ({ ...prev, age: e.target.value ? parseInt(e.target.value) : null }))}
          placeholder={t("profileForm.agePlaceholder")}
          className="mt-1 w-32"
        />
      </div>

      {/* Spielstärke (Selbsteinschätzung) */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Label className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-primary" /> {t("profileForm.skillLabel")}
          </Label>
          <span className="font-stat text-xl font-extrabold text-primary">
            {profile.skill_self_rating}
            <span className="text-xs text-muted-foreground">/10</span>
          </span>
        </div>
        <Slider
          value={[profile.skill_self_rating || 5]}
          onValueChange={([v]) => setProfile(prev => ({ ...prev, skill_self_rating: v }))}
          min={1}
          max={10}
          step={1}
          aria-label={t("profileForm.skillLabel")}
        />
        <p className="text-xs text-muted-foreground">{t("profileForm.skillHint")}</p>
      </div>

      {/* Gespielte Matches */}
      <div className="mb-6">
        <Label htmlFor="games" className="inline-flex items-center gap-1.5">
          <Swords className="h-4 w-4 text-primary" /> {t("profileForm.gamesLabel")}
        </Label>
        <Input
          id="games"
          type="number"
          min={0}
          max={9999}
          value={profile.games_played_self ?? 0}
          onChange={(e) => setProfile(prev => ({ ...prev, games_played_self: e.target.value ? parseInt(e.target.value) : 0 }))}
          className="mt-1 w-32"
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("profileForm.gamesHint")}</p>
      </div>

      <Button onClick={onSave} variant="lime" disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        {t("profileForm.save")}
      </Button>
    </motion.div>
  );
}
