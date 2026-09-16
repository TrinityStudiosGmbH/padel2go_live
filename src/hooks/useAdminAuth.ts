import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// Hardcoded superadmin emails — always granted admin access regardless of user_roles table
const SUPERADMIN_EMAILS = ["fsteinfelder@padel2go.eu"];

export interface AdminPage {
  key: string;
  label: string;
  route: string;
  sortOrder: number;
}

export interface UseAdminAuthReturn {
  /** Vollzugriff: sieht und darf alles. */
  isAdmin: boolean;
  /** Hardcodierte Superadmin-Adresse — fuer Werkzeuge, die echte Daten erzeugen (Kamera-Simulator). */
  isSuperAdmin: boolean;
  /** Zugang übers Admin-Menü — Vollzugriff ODER mindestens eine zugewiesene Seite. */
  hasAdminAccess: boolean;
  /** Seiten, die dieser Nutzer öffnen darf. Beim Vollzugriff alle. */
  pages: AdminPage[];
  /** Darf dieser Nutzer genau diese Seite? */
  canAccess: (pageKey: string) => boolean;
  loading: boolean;
  user: ReturnType<typeof useAuth>["user"];
}

/**
 * Admin-Zugang. Zwei Stufen:
 *   - Vollzugriff (app_role 'admin' bzw. Superadmin-E-Mail): alle Seiten
 *   - eigene Rolle: nur die Seiten, die ihr zugewiesen wurden
 *
 * Die Seitenliste kommt aus my_admin_pages() — dieselbe Quelle, aus der auch
 * die RLS-Policies ihre Entscheidung ableiten. Damit kann die Oberfläche nie
 * mehr anbieten, als die Datenbank tatsächlich zulässt.
 */
export function useAdminAuth(): UseAdminAuthReturn {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pages, setPages] = useState<AdminPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      if (!user) {
        setIsAdmin(false);
        setPages([]);
        setLoading(false);
        return;
      }

      try {
        let fullAdmin = !!user.email && SUPERADMIN_EMAILS.includes(user.email);

        if (!fullAdmin) {
          const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();

          if (error) console.error("Error checking admin role:", error);
          fullAdmin = !!data;
        }
        setIsAdmin(fullAdmin);

        // Auch für Volladmins: liefert die kanonische Seitenliste samt Sortierung.
        const { data: pageRows, error: pageError } = await (supabase as any).rpc("my_admin_pages");
        if (pageError) {
          console.error("Error loading admin pages:", pageError);
          setPages([]);
        } else {
          setPages(
            ((pageRows ?? []) as Array<{ page_key: string; label: string; route: string; sort_order: number }>)
              .map((r) => ({ key: r.page_key, label: r.label, route: r.route, sortOrder: r.sort_order })),
          );
        }
      } catch (err) {
        console.error("Error checking admin access:", err);
        setIsAdmin(false);
        setPages([]);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      check();
    }
  }, [user, authLoading]);

  const canAccess = (pageKey: string) => isAdmin || pages.some((p) => p.key === pageKey);

  return {
    isAdmin,
    isSuperAdmin: !!user?.email && SUPERADMIN_EMAILS.includes(user.email),
    hasAdminAccess: isAdmin || pages.length > 0,
    pages,
    canAccess,
    loading: authLoading || loading,
    user,
  };
}
