import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const PROFILE_COMPLETE_QUERY_KEY = (userId: string) => ["profile-complete", userId];

/**
 * Einmaliges Profil-Onboarding: wer sein Profil noch nicht vervollständigt hat
 * (profile_completed_at leer), landet zuerst auf /willkommen und danach wieder
 * auf dem ursprünglichen Ziel. Liegt innerhalb von RequireAuth.
 */
export function RequireProfileComplete() {
  const { user } = useAuth();
  const location = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: PROFILE_COMPLETE_QUERY_KEY(user?.id ?? ""),
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("profile_completed_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      // Keine Zeile (Trigger noch nicht durch) zählt als „nicht vollständig“.
      return !!data?.profile_completed_at;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data === false) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/willkommen?next=${next}`} replace />;
  }

  return <Outlet />;
}
