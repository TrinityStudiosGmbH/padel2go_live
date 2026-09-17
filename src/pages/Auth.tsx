import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, Loader2, AlertCircle, MailCheck } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NavLink } from "@/components/NavLink";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/padel2go-logo.png";

type AuthMode = "login" | "register" | "forgot" | "reset" | "confirm" | "email-change";

const Auth = () => {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user, signUp, signInWithPassword, signInWithProvider, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  // Captured synchronously on first render — Supabase strips the URL hash after
  // processing, so read the error markers before they disappear.
  const [linkError] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return !!(params.get("error") || params.get("error_code"));
  });
  const [resetChecked, setResetChecked] = useState(false);
  const [emailChangeStatus, setEmailChangeStatus] =
    useState<"processing" | "partial" | "done" | "error">("processing");

  const emailSchema = z.string().email(t("validation.invalidEmail"));
  const passwordSchema = z.string().min(6, t("validation.passwordTooShort"));

  // Safe internal redirect target from ?redirect=<path> (set by RequireAuth).
  // Sicherheitsaudit 2026-07-31, Fund 12: gegen Open-Redirect härten — ein reiner
  // String-Präfix-Check ließ Backslash-Varianten (z.B. "/\\evil.com", die Browser
  // wie "//evil.com" behandeln) durch. Über new URL() gegen die eigene Origin
  // auflösen und nur akzeptieren, wenn die Origin identisch bleibt.
  const redirectParam = searchParams.get("redirect");
  const safeRedirect = (() => {
    if (!redirectParam || !redirectParam.startsWith("/") || redirectParam.startsWith("//")) return null;
    if (redirectParam.includes("\\")) return null;
    try {
      const url = new URL(redirectParam, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  })();

  // Role-based redirect helper (honors ?redirect= when it's a safe internal path)
  const redirectBasedOnRole = async (userId: string) => {
    if (safeRedirect) {
      navigate(safeRedirect);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roles?.some(r => r.role === "admin")) {
      navigate("/admin");
    } else if (roles?.some(r => r.role === "club_owner")) {
      navigate("/club");
    } else {
      navigate("/account");
    }
  };

  // Redirect if already logged in — but not during password reset or email-change,
  // where the link creates/updates a session and we must show the flow first.
  useEffect(() => {
    const m = searchParams.get("mode");
    if (mode === "reset" || mode === "email-change" || m === "reset" || m === "email-change") return;
    if (user) {
      redirectBasedOnRole(user.id);
    }
  }, [user, mode]);

  // Check for reset / email-change mode from URL
  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "reset") setMode("reset");
    else if (m === "email-change") setMode("email-change");
  }, [searchParams]);

  // Reset flow: give the SDK a moment to process the recovery token before we
  // decide the link is missing/expired.
  useEffect(() => {
    if (mode !== "reset") return;
    const timer = setTimeout(() => setResetChecked(true), 2500);
    return () => clearTimeout(timer);
  }, [mode]);

  // Email-change landing: after the SDK processes the token, read the user to
  // distinguish "one link confirmed, one still pending" from "fully changed".
  useEffect(() => {
    if (mode !== "email-change") return;
    if (linkError) {
      setEmailChangeStatus("error");
      return;
    }
    let active = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const u = data.user as { new_email?: string } | null;
      if (u && u.new_email) setEmailChangeStatus("partial");
      else setEmailChangeStatus("done");
    })();
    return () => {
      active = false;
    };
  }, [mode, linkError]);

  const validateEmail = (value: string) => {
    try {
      emailSchema.parse(value);
      setErrors(prev => ({ ...prev, email: undefined }));
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setErrors(prev => ({ ...prev, email: e.errors[0].message }));
      }
      return false;
    }
  };

  const validatePassword = (value: string) => {
    try {
      passwordSchema.parse(value);
      setErrors(prev => ({ ...prev, password: undefined }));
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setErrors(prev => ({ ...prev, password: e.errors[0].message }));
      }
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email) || !validatePassword(password)) return;

    setLoading(true);
    const { error } = await signInWithPassword(email, password);

    if (error) {
      setLoading(false);
      toast.error(t("toasts.loginFailed"), {
        description: error.message === "Invalid login credentials"
          ? t("toasts.invalidCredentials")
          : error.message,
      });
      return;
    }

    toast.success(t("toasts.welcome"), {
      description: t("toasts.loggedIn"),
    });

    // Get current user and redirect based on role
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await redirectBasedOnRole(currentUser.id);
    } else {
      navigate("/account");
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setOauthLoading(provider);
    const { error } = await signInWithProvider(provider, safeRedirect ?? undefined);
    if (error) {
      setOauthLoading(null);
      // Ein nicht aktivierter Provider meldet sich mit "provider is not enabled".
      const notEnabled = /not enabled|unsupported provider/i.test(error.message ?? "");
      toast.error(t("oauth.failed"), {
        description: notEnabled ? t("oauth.notConfigured") : error.message,
      });
    }
    // Erfolgsfall: Supabase leitet zu Google/Apple weiter, die Seite verlässt sich selbst.
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email) || !validatePassword(password)) return;

    if (password !== confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: t("validation.passwordsDoNotMatch") }));
      return;
    }

    if (!termsAccepted) {
      toast.error(t("toasts.registerFailed"), { description: t("validation.termsRequired") });
      return;
    }
    if (!adultConfirmed) {
      toast.error(t("toasts.registerFailed"), { description: t("validation.adultRequired") });
      return;
    }

    setLoading(true);
    const { data, error } = await signUp(email, password, {
      terms_accepted_at: new Date().toISOString(),
      adult_confirmed: true,
    });
    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error(t("toasts.registerFailed"), {
          description: t("toasts.alreadyRegistered"),
        });
      } else {
        toast.error(t("toasts.registerFailed"), {
          description: error.message,
        });
      }
      return;
    }

    // With email confirmation on, Supabase returns a user whose identities array is
    // empty when the address already exists (no error, to avoid user enumeration).
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      toast.error(t("toasts.registerFailed"), {
        description: t("toasts.alreadyRegistered"),
      });
      return;
    }

    // No session means email confirmation is required — show the confirmation screen
    // instead of a false "logged in" success + redirect (RequireAuth would bounce it).
    if (!data?.session) {
      toast.success(t("toasts.confirmEmailTitle"), {
        description: t("toasts.confirmEmailInfo"),
      });
      setMode("confirm");
      return;
    }

    // Session created (email confirmation disabled) — user is logged in.
    toast.success(t("toasts.welcome"), {
      description: t("toasts.accountCreated"),
    });
    navigate("/account");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return;

    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      toast.error(t("toasts.error"), {
        description: error.message,
      });
      return;
    }

    toast.success(t("toasts.emailSent"), {
      description: t("toasts.resetLinkInfo"),
    });
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword(password)) return;

    if (password !== confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: t("validation.passwordsDoNotMatch") }));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      toast.error(t("toasts.error"), {
        description: error.message,
      });
      return;
    }

    toast.success(t("reset.success"), {
      description: t("reset.successDescription"),
    });
    setMode("login");
    navigate("/account");
  };

  return (
    <>
      <Helmet>
        <title>{t("meta.title")}</title>
        <meta name="description" content={t("meta.description")} />
      </Helmet>

      <Navigation />

      <main className="min-h-screen bg-background pt-20 pb-12 flex items-center justify-center">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
              {/* Logo */}
              <div className="flex justify-center mb-8">
                <img src={logo} alt={t("logoAlt")} className="h-10" />
              </div>

              {/* Login Form */}
              {mode === "login" && (
                <>
                  <h1 className="text-2xl font-bold text-center mb-6">{t("signIn.title")}</h1>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="email">{t("fields.email")}</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder={t("placeholders.email")}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => validateEmail(email)}
                          className="pl-10"
                        />
                      </div>
                      {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <Label htmlFor="password">{t("fields.password")}</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder={t("placeholders.password")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {errors.password && <p className="text-destructive text-sm mt-1">{errors.password}</p>}
                    </div>
                    <Button type="submit" variant="lime" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("signIn.submit")}
                    </Button>
                  </form>
                  <OAuthButtons
                    onSelect={handleOAuth}
                    busy={oauthLoading}
                    disabled={loading || oauthLoading !== null}
                    dividerLabel={t("oauth.divider")}
                    googleLabel={t("oauth.google")}
                    appleLabel={t("oauth.apple")}
                  />
                  <div className="mt-4 text-center space-y-2">
                    <button
                      onClick={() => setMode("forgot")}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {t("signIn.forgotPassword")}
                    </button>
                    <p className="text-sm text-muted-foreground">
                      {t("signIn.noAccount")}{" "}
                      <button
                        onClick={() => setMode("register")}
                        className="text-primary hover:underline font-medium"
                      >
                        {t("signIn.registerLink")}
                      </button>
                    </p>
                  </div>
                </>
              )}

              {/* Register Form */}
              {mode === "register" && (
                <>
                  <h1 className="text-2xl font-bold text-center mb-6">{t("signUp.title")}</h1>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <Label htmlFor="email">{t("fields.email")}</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder={t("placeholders.email")}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => validateEmail(email)}
                          className="pl-10"
                        />
                      </div>
                      {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <Label htmlFor="password">{t("fields.password")}</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder={t("placeholders.password")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onBlur={() => validatePassword(password)}
                          className="pl-10"
                        />
                      </div>
                      {errors.password && <p className="text-destructive text-sm mt-1">{errors.password}</p>}
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">{t("fields.confirmPassword")}</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirmPassword"
                          type="password"
                          placeholder={t("placeholders.password")}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {errors.confirmPassword && <p className="text-destructive text-sm mt-1">{errors.confirmPassword}</p>}
                    </div>

                    <div className="space-y-3 pt-1">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={termsAccepted}
                          onCheckedChange={(v) => setTermsAccepted(v === true)}
                          className="mt-0.5"
                        />
                        <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                          {t("signUp.termsIntro")}
                          <NavLink to="/agb" target="_blank" className="text-primary underline hover:no-underline">
                            {t("signUp.termsLink")}
                          </NavLink>
                          {t("signUp.termsAnd")}
                          <NavLink to="/datenschutz" target="_blank" className="text-primary underline hover:no-underline">
                            {t("signUp.privacyLink")}
                          </NavLink>
                          {t("signUp.termsOutro")}
                        </span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={adultConfirmed}
                          onCheckedChange={(v) => setAdultConfirmed(v === true)}
                          className="mt-0.5"
                        />
                        <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                          {t("signUp.adultConfirm")}
                        </span>
                      </label>
                    </div>

                    <Button type="submit" variant="lime" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("signUp.submit")}
                    </Button>
                  </form>
                  <OAuthButtons
                    onSelect={handleOAuth}
                    busy={oauthLoading}
                    disabled={loading || oauthLoading !== null}
                    dividerLabel={t("oauth.divider")}
                    googleLabel={t("oauth.google")}
                    appleLabel={t("oauth.apple")}
                  />
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("signUp.alreadyRegistered")}{" "}
                      <button
                        onClick={() => setMode("login")}
                        className="text-primary hover:underline font-medium"
                      >
                        {t("signUp.signInLink")}
                      </button>
                    </p>
                  </div>
                </>
              )}

              {/* Forgot Password */}
              {mode === "forgot" && (
                <>
                  <button
                    onClick={() => setMode("login")}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
                  >
                    <ArrowLeft className="w-4 h-4" /> {t("forgot.back")}
                  </button>
                  <h1 className="text-2xl font-bold text-center mb-2">{t("forgot.title")}</h1>
                  <p className="text-muted-foreground text-center text-sm mb-6">
                    {t("forgot.description")}
                  </p>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <Label htmlFor="email">{t("fields.email")}</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder={t("placeholders.email")}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => validateEmail(email)}
                          className="pl-10"
                        />
                      </div>
                      {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
                    </div>
                    <Button type="submit" variant="lime" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("forgot.submit")}
                    </Button>
                  </form>
                </>
              )}

              {/* Reset Password — expired / invalid link */}
              {mode === "reset" && (linkError || (resetChecked && !user)) && (
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <AlertCircle className="w-12 h-12 text-destructive" />
                  </div>
                  <h1 className="text-2xl font-bold">{t("reset.expired.title")}</h1>
                  <p className="text-muted-foreground text-sm">{t("reset.expired.description")}</p>
                  <Button variant="lime" className="w-full" onClick={() => setMode("forgot")}>
                    {t("reset.expired.requestNew")}
                  </Button>
                </div>
              )}

              {/* Reset Password — still verifying the recovery token */}
              {mode === "reset" && !linkError && !user && !resetChecked && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-muted-foreground text-sm">{t("reset.checking")}</p>
                </div>
              )}

              {/* Reset Password — recovery session ready, show the form */}
              {mode === "reset" && !linkError && user && (
                <>
                  <h1 className="text-2xl font-bold text-center mb-2">{t("reset.title")}</h1>
                  <p className="text-muted-foreground text-center text-sm mb-6">
                    {t("reset.description")}
                  </p>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <Label htmlFor="newPassword">{t("reset.passwordLabel")}</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="newPassword"
                          type="password"
                          placeholder={t("placeholders.password")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onBlur={() => validatePassword(password)}
                          className="pl-10"
                        />
                      </div>
                      {errors.password && <p className="text-destructive text-sm mt-1">{errors.password}</p>}
                    </div>
                    <div>
                      <Label htmlFor="confirmNewPassword">{t("reset.confirmLabel")}</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirmNewPassword"
                          type="password"
                          placeholder={t("placeholders.password")}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {errors.confirmPassword && <p className="text-destructive text-sm mt-1">{errors.confirmPassword}</p>}
                    </div>
                    <Button type="submit" variant="lime" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("reset.submit")}
                    </Button>
                  </form>
                </>
              )}

              {/* Confirm Email — shown after signup when email confirmation is required */}
              {mode === "confirm" && (
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <Mail className="w-12 h-12 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold">{t("confirm.title")}</h1>
                  <p className="text-muted-foreground text-sm">
                    {t("confirm.body", { email })}
                  </p>
                  <button
                    onClick={() => setMode("login")}
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    {t("confirm.backToLogin")}
                  </button>
                </div>
              )}

              {/* Email change confirmation landing */}
              {mode === "email-change" && (
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    {emailChangeStatus === "error" ? (
                      <AlertCircle className="w-12 h-12 text-destructive" />
                    ) : emailChangeStatus === "processing" ? (
                      <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    ) : (
                      <MailCheck className="w-12 h-12 text-primary" />
                    )}
                  </div>
                  <h1 className="text-2xl font-bold">{t("emailChange.title")}</h1>
                  <p className="text-muted-foreground text-sm">
                    {emailChangeStatus === "error"
                      ? t("emailChange.error")
                      : emailChangeStatus === "processing"
                      ? t("emailChange.processing")
                      : emailChangeStatus === "partial"
                      ? t("emailChange.partial")
                      : t("emailChange.done")}
                  </p>
                  <button
                    onClick={() => navigate("/account")}
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    {t("emailChange.toAccount")}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </>
  );
};

/** Google- und Apple-Anmeldung. Gleiche Buttons für Login und Registrierung. */
const OAuthButtons = ({
  onSelect,
  busy,
  disabled,
  dividerLabel,
  googleLabel,
  appleLabel,
}: {
  onSelect: (provider: "google" | "apple") => void;
  busy: "google" | "apple" | null;
  disabled: boolean;
  dividerLabel: string;
  googleLabel: string;
  appleLabel: string;
}) => (
  <>
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{dividerLabel}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => onSelect("google")}
        disabled={disabled}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[12px] border border-[hsl(0_0%_18%)] bg-white/[0.04] px-4 text-[14px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-white/[0.07] disabled:opacity-60"
      >
        {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark className="h-[18px] w-[18px]" />}
        {googleLabel}
      </button>
      <button
        type="button"
        onClick={() => onSelect("apple")}
        disabled={disabled}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[12px] border border-[hsl(0_0%_18%)] bg-white/[0.04] px-4 text-[14px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-white/[0.07] disabled:opacity-60"
      >
        {busy === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleMark className="h-[19px] w-[19px]" />}
        {appleLabel}
      </button>
    </div>
  </>
);

const GoogleMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M17.05 12.54c.02 2.7 2.36 3.6 2.39 3.61-.02.06-.38 1.3-1.25 2.57-.75 1.1-1.53 2.2-2.76 2.22-1.21.02-1.6-.72-2.98-.72-1.39 0-1.82.7-2.96.74-1.19.04-2.1-1.18-2.86-2.28-1.66-2.4-2.93-6.79-1.23-9.75.85-1.47 2.36-2.4 4-2.43 1.17-.02 2.27.79 2.98.79.71 0 2.05-.97 3.46-.83.59.03 2.24.21 3.3 1.62-.09.06-1.97 1.15-1.95 3.44M14.9 4.42c.63-.76 1.05-1.82.94-2.87-.92.04-2.04.61-2.69 1.37-.59.67-1.09 1.75-.95 2.78 1.02.08 2.07-.52 2.7-1.28" />
  </svg>
);

export default Auth;
