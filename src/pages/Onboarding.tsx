import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, ArrowLeft, Check, X, Loader2, Camera, Sparkles, Trophy,
  Swords, User as UserIcon, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SectionShaderBackdrop } from "@/components/SectionShaderBackdrop";
import { UserAvatar } from "@/components/UserAvatar";
import { PROFILE_COMPLETE_QUERY_KEY } from "@/components/RequireProfileComplete";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { resizeAvatarToSquare } from "@/lib/resizeImage";
import { toast } from "sonner";
import logo from "@/assets/padel2go-logo.png";

/** Selbsteinschätzung 1–10 mit Klartext je Stufe. */
const SKILL_STEPS = [
  { value: 1, key: "s1" }, { value: 2, key: "s2" }, { value: 3, key: "s3" },
  { value: 4, key: "s4" }, { value: 5, key: "s5" }, { value: 6, key: "s6" },
  { value: 7, key: "s7" }, { value: 8, key: "s8" }, { value: 9, key: "s9" },
  { value: 10, key: "s10" },
] as const;

const GAMES_OPTIONS = [
  { value: 0, key: "none" },
  { value: 5, key: "few" },
  { value: 25, key: "some" },
  { value: 75, key: "many" },
] as const;

const STEP_COUNT = 6;
/** Eingabeschritte zwischen Begrüßung und Abschluss — treibt die Fortschrittsanzeige. */
const INPUT_STEPS = 4;

const usernameRules = (value: string) => value.toLowerCase().replace(/[^a-z0-9._]/g, "");

export default function Onboarding() {
  const { t } = useTranslation("onboarding");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [skill, setSkill] = useState(5);
  const [games, setGames] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  const next = useMemo(() => {
    const raw = searchParams.get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/dashboard";
    if (raw.startsWith("/willkommen")) return "/dashboard";
    return raw;
  }, [searchParams]);

  // Vorhandene Werte vorbelegen (bestehende Konten, zweiter Anlauf).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name, age, avatar_url, skill_self_rating, games_played_self, profile_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      // Schon durch — die Maske ist einmalig, Änderungen laufen über das Konto.
      if (data?.profile_completed_at) {
        queryClient.setQueryData(PROFILE_COMPLETE_QUERY_KEY(user.id), true);
        navigate(next, { replace: true });
        return;
      }
      if (data) {
        setUsername(data.username ?? "");
        setDisplayName(data.display_name ?? (user.user_metadata?.full_name as string | undefined) ?? "");
        setAge(data.age ? String(data.age) : "");
        setAvatarUrl(data.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null);
        if (data.skill_self_rating) setSkill(data.skill_self_rating);
        if (typeof data.games_played_self === "number" && data.games_played_self > 0) setGames(data.games_played_self);
      } else {
        setDisplayName((user.user_metadata?.full_name as string | undefined) ?? "");
        setAvatarUrl((user.user_metadata?.avatar_url as string | undefined) ?? null);
      }
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [user, navigate, next, queryClient]);

  // Username-Verfügbarkeit, entprellt.
  useEffect(() => {
    const value = username.trim();
    if (value.length < 3) { setUsernameFree(null); return; }
    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", value)
        .maybeSingle();
      setUsernameFree(!data || data.user_id === user?.id);
      setCheckingUsername(false);
    }, 400);
    return () => { clearTimeout(timer); setCheckingUsername(false); };
  }, [username, user?.id]);

  const ageNumber = parseInt(age, 10);
  const nameOk = username.trim().length >= 3 && username.trim().length <= 30 && usernameFree === true && displayName.trim().length >= 2;
  const ageOk = Number.isFinite(ageNumber) && ageNumber >= 18 && ageNumber <= 99;
  const gamesOk = games !== null;

  const canContinue =
    step === 0 ? true :
    step === 1 ? nameOk :
    step === 2 ? ageOk :
    step === 3 ? gamesOk :
    true;

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error(t("avatar.notAnImage")); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t("avatar.tooLarge")); return; }
    setUploading(true);
    try {
      const processed = await resizeAvatarToSquare(file);
      const fileName = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, processed, { upsert: true, contentType: "image/jpeg", cacheControl: "2592000" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      setAvatarUrl(`${publicUrl}?v=${Date.now()}`);
    } catch (error) {
      toast.error(t("avatar.failed"), { description: (error as Error).message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const finish = async () => {
    if (!user || !nameOk || !ageOk || !gamesOk) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        user_id: user.id,
        username: username.trim(),
        display_name: displayName.trim(),
        age: ageNumber,
        skill_self_rating: skill,
        games_played_self: games,
        avatar_url: avatarUrl,
      }, { onConflict: "user_id" });
      if (error) {
        if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
          setUsernameFree(false);
          setStep(1);
          toast.error(t("name.taken"));
          return;
        }
        throw error;
      }

      const { data, error: fnError } = await supabase.functions.invoke("complete-profile", { body: {} });
      if (fnError || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error ?? fnError?.message ?? "unknown");
      }

      // Direkt setzen, nicht nur invalidieren: der Guard liest sonst noch den
      // alten Wert (Hintergrund-Refetch) und wirft uns zurück auf /willkommen.
      queryClient.setQueryData(PROFILE_COMPLETE_QUERY_KEY(user.id), true);
      await queryClient.invalidateQueries({ queryKey: ["account-data"] });
      toast.success(t("done.toast"));
      navigate(next, { replace: true });
    } catch (error) {
      toast.error(t("done.failed"), { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const skillLabel = t(`skill.levels.${SKILL_STEPS[skill - 1].key}`);

  return (
    <>
      <Helmet>
        <title>{`${t("meta.title")} | PADEL2GO`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <SectionShaderBackdrop color="#C7F011" />

        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-[1] w-full max-w-lg"
        >
          <div className="overflow-hidden rounded-[26px] border border-primary/20 bg-[hsl(0_0%_5%/0.86)] shadow-[0_30px_80px_hsl(0_0%_0%/0.6)] backdrop-blur-2xl">
            {/* Kopf: Logo + Fortschritt */}
            <div className="flex flex-col gap-4 border-b border-[hsl(0_0%_12%)] px-6 pb-4 pt-6 sm:px-8">
              <img src={logo} alt="PADEL2GO" className="h-7 w-auto self-center" />
              <div className="flex items-center gap-1.5">
                {Array.from({ length: INPUT_STEPS }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[3px] flex-1 rounded-full transition-all duration-500 ${
                      step > i + 1 ? "bg-primary" : step === i + 1 ? "bg-primary/60" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="px-6 py-7 sm:px-8 sm:py-8">
              {!loaded ? (
                <div className="flex h-[280px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex min-h-[292px] flex-col"
                  >
                    {/* 0 — Begrüßung */}
                    {step === 0 && (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                        <span className="inline-flex h-16 w-16 items-center justify-center rounded-[20px] border border-primary/35 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.22),hsl(71_91%_51%/0.04))] text-primary">
                          <Sparkles className="h-7 w-7" />
                        </span>
                        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
                          {t("welcome.title")}
                        </h1>
                        <p className="max-w-sm text-[14.5px] leading-relaxed text-muted-foreground">
                          {t("welcome.body")}
                        </p>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-primary">
                          {t("welcome.duration")}
                        </span>
                      </div>
                    )}

                    {/* 1 — Name */}
                    {step === 1 && (
                      <div className="flex flex-1 flex-col gap-5">
                        <StepHead icon={UserIcon} eyebrow={t("steps.name")} title={t("name.title")} subtitle={t("name.subtitle")} />
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="ob-username" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {t("name.usernameLabel")}
                          </Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">@</span>
                            <Input
                              id="ob-username"
                              value={username}
                              onChange={(e) => setUsername(usernameRules(e.target.value).slice(0, 30))}
                              placeholder={t("name.usernamePlaceholder")}
                              autoComplete="off"
                              className="h-11 rounded-[12px] border-[hsl(0_0%_16%)] bg-white/[0.04] pl-8 pr-10 text-[15px]"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                              {checkingUsername && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                              {!checkingUsername && usernameFree === true && <Check className="h-4 w-4 text-primary" />}
                              {!checkingUsername && usernameFree === false && <X className="h-4 w-4 text-[#FF6B6B]" />}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-muted-foreground">
                            {usernameFree === false ? t("name.taken") : t("name.usernameHint")}
                          </p>
                        </div>
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="ob-display" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {t("name.displayLabel")}
                          </Label>
                          <Input
                            id="ob-display"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                            placeholder={t("name.displayPlaceholder")}
                            className="h-11 rounded-[12px] border-[hsl(0_0%_16%)] bg-white/[0.04] text-[15px]"
                          />
                          <p className="text-[11.5px] text-muted-foreground">{t("name.displayHint")}</p>
                        </div>
                      </div>
                    )}

                    {/* 2 — Alter */}
                    {step === 2 && (
                      <div className="flex flex-1 flex-col gap-5">
                        <StepHead icon={PartyPopper} eyebrow={t("steps.age")} title={t("age.title")} subtitle={t("age.subtitle")} />
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="ob-age" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {t("age.label")}
                          </Label>
                          <Input
                            id="ob-age"
                            type="number"
                            inputMode="numeric"
                            min={18}
                            max={99}
                            value={age}
                            onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                            placeholder="28"
                            className="h-14 rounded-[14px] border-[hsl(0_0%_16%)] bg-white/[0.04] text-center font-stat text-2xl font-bold"
                          />
                          <p className="text-[11.5px] text-muted-foreground">
                            {age && !ageOk ? t("age.invalid") : t("age.hint")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 3 — Spielstärke + Matches */}
                    {step === 3 && (
                      <div className="flex flex-1 flex-col gap-5">
                        <StepHead icon={Trophy} eyebrow={t("steps.skill")} title={t("skill.title")} subtitle={t("skill.subtitle")} />
                        <div className="flex flex-col gap-3 rounded-[16px] border border-[hsl(0_0%_12%)] bg-white/[0.03] p-4">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-[15px] font-bold text-foreground">{skillLabel}</span>
                            <span className="font-stat text-2xl font-extrabold text-primary">{skill}<span className="text-sm text-muted-foreground">/10</span></span>
                          </div>
                          <Slider
                            value={[skill]}
                            onValueChange={([v]) => setSkill(v)}
                            min={1}
                            max={10}
                            step={1}
                            aria-label={t("skill.title")}
                          />
                          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            <span>{t("skill.scaleLow")}</span>
                            <span>{t("skill.scaleHigh")}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            <Swords className="h-3 w-3" /> {t("skill.gamesLabel")}
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {GAMES_OPTIONS.map((option) => {
                              const active = games === option.value;
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => setGames(option.value)}
                                  className={`rounded-[12px] border px-3 py-3 text-[13.5px] font-semibold transition-colors ${
                                    active
                                      ? "border-primary bg-primary/[0.14] text-primary"
                                      : "border-[hsl(0_0%_14%)] bg-white/[0.03] text-[hsl(0_0%_78%)] hover:border-primary/40"
                                  }`}
                                >
                                  {t(`skill.games.${option.key}`)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4 — Avatar */}
                    {step === 4 && (
                      <div className="flex flex-1 flex-col gap-5">
                        <StepHead icon={Camera} eyebrow={t("steps.avatar")} title={t("avatar.title")} subtitle={t("avatar.subtitle")} />
                        <div className="flex flex-col items-center gap-4 py-2">
                          <div className="relative">
                            <UserAvatar
                              src={avatarUrl}
                              name={displayName || username}
                              className="h-28 w-28 border-2 border-primary/30 text-3xl"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploading}
                              className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-lime text-primary-foreground shadow-[0_6px_20px_hsl(71_91%_51%/0.35)] transition-opacity hover:opacity-90"
                              aria-label={t("avatar.upload")}
                            >
                              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                          </div>
                          <p className="max-w-xs text-center text-[12.5px] leading-relaxed text-muted-foreground">
                            {avatarUrl ? t("avatar.hasPhoto") : t("avatar.initialsHint")}
                          </p>
                          {avatarUrl && (
                            <button
                              type="button"
                              onClick={() => setAvatarUrl(null)}
                              className="text-[12.5px] font-semibold text-muted-foreground underline hover:text-primary"
                            >
                              {t("avatar.useInitials")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 5 — Fertig */}
                    {step === 5 && (
                      <div className="flex flex-1 flex-col gap-5">
                        <StepHead icon={PartyPopper} eyebrow={t("steps.done")} title={t("done.title")} subtitle={t("done.subtitle")} />
                        <div className="flex items-center gap-4 rounded-[16px] border border-primary/20 bg-primary/[0.05] p-4">
                          <UserAvatar src={avatarUrl} name={displayName || username} className="h-16 w-16 text-xl" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-display text-[17px] font-bold text-foreground">{displayName}</span>
                            <span className="truncate text-[13px] text-muted-foreground">@{username}</span>
                          </div>
                        </div>
                        <dl className="flex flex-col gap-2">
                          <SummaryRow label={t("done.age")} value={`${ageNumber} ${t("done.years")}`} />
                          <SummaryRow label={t("done.skill")} value={`${skill}/10 · ${skillLabel}`} />
                          <SummaryRow label={t("done.games")} value={t(`skill.games.${GAMES_OPTIONS.find((o) => o.value === games)?.key ?? "none"}`)} />
                        </dl>
                        <p className="text-[12px] leading-relaxed text-muted-foreground">{t("done.editHint")}</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Navigation */}
              <div className="mt-6 flex items-center gap-3">
                {step > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((s) => s - 1)}
                    disabled={saving}
                    className="h-11 shrink-0 rounded-[12px] px-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-1.5">{t("nav.back")}</span>
                  </Button>
                )}
                {step < STEP_COUNT - 1 ? (
                  <Button
                    variant="lime"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!canContinue || !loaded}
                    className="h-11 flex-1 rounded-[12px] text-[14px] font-bold"
                  >
                    {step === 0 ? t("nav.start") : step === 4 && !avatarUrl ? t("nav.skip") : t("nav.continue")}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="lime"
                    onClick={finish}
                    disabled={saving}
                    className="h-11 flex-1 rounded-[12px] text-[14px] font-bold"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                    {t("nav.finish")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </>
  );
}

function StepHead({ icon: Icon, eyebrow, title, subtitle }: { icon: React.ElementType; eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] border border-primary/30 bg-[linear-gradient(135deg,hsl(71_91%_51%/0.18),hsl(71_91%_51%/0.04))] text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{eyebrow}</span>
        <h2 className="font-display text-[19px] font-extrabold leading-tight tracking-tight text-foreground">{title}</h2>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-3.5 py-2.5">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="text-[13.5px] font-semibold text-foreground">{value}</dd>
    </div>
  );
}
