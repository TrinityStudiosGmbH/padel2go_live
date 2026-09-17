import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, meta?: Record<string, unknown>) => Promise<{ data: { user: User | null; session: Session | null } | null; error: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: any }>;
  signInWithProvider: (provider: "google" | "apple", redirectPath?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  verifyPassword: (currentPassword: string) => Promise<{ error: any }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: any }>;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Offene Vereins-Einladungen auf die eigene Adresse einlösen — einmal je Konto
    // und Session. Damit greift eine Einladung auch dann, wenn der Verein sie für
    // jemanden hinterlegt hat, der sich erst danach registriert.
    const claimedFor = new Set<string>();
    const claimInvites = (userId: string | undefined) => {
      if (!userId || claimedFor.has(userId)) return;
      claimedFor.add(userId);
      // Bewusst ohne await: ein Fehler hier darf den Login nie blockieren.
      (supabase.rpc as any)("claim_club_member_invites").then(
        () => undefined,
        () => undefined,
      );
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        claimInvites(session?.user?.id);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      claimInvites(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, meta?: Record<string, unknown>) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        ...(meta ? { data: meta } : {})
      }
    });
    return { data, error };
  };

  /**
   * Anmeldung über Google oder Apple. Supabase leitet zurück auf /auth, dort
   * greift die bestehende Rollen-Weiterleitung; ein neues Konto landet danach
   * über RequireProfileComplete automatisch im Profil-Onboarding.
   */
  const signInWithProvider = async (provider: "google" | "apple", redirectPath?: string) => {
    const target = redirectPath && redirectPath.startsWith("/") && !redirectPath.startsWith("//")
      ? `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectPath)}`
      : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: target,
        // Google gibt ohne diese Angabe bei einem zweiten Login kein Konto-Auswahlfenster.
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    return { error };
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    // Send the user back to the public home page after logout.
    // Full reload (instead of react-router navigate) clears React Query
    // cache and any in-memory state — clean slate for the next session.
    window.location.href = "/";
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth?mode=reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  // Verify the current password by re-authenticating. A failed sign-in leaves
  // the existing session intact, so this is a safe "confirm it's really you"
  // check before a sensitive change (email/password).
  const verifyPassword = async (currentPassword: string) => {
    if (!user?.email) return { error: { message: "no_user" } };
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    return { error };
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    const { error: verifyError } = await verifyPassword(currentPassword);
    if (verifyError) return { error: verifyError };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const updateEmail = async (currentPassword: string, newEmail: string) => {
    const { error: verifyError } = await verifyPassword(currentPassword);
    if (verifyError) return { error: verifyError };
    const redirectUrl = `${window.location.origin}/auth?mode=email-change`;
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: redirectUrl }
    );
    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signUp,
      signInWithPassword,
      signInWithProvider,
      signOut,
      resetPassword,
      verifyPassword,
      updatePassword,
      updateEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
