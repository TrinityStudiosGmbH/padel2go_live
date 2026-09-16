import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Eye,
  Shield,
  ShieldCheck,
  Trash2,
  Coins,
  Calendar,
  Wallet,
  LayoutDashboard,
  Swords,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface UserWithDetails {
  id: string;
  user_id: string;
  email: string | null;
  email_confirmed_at: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  age: number | null;
  skill_self_rating: number | null;
  games_played_self: number | null;
  created_at: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
  shipping_address_line1: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  referral_code: string | null;
  roles: string[];
  role: string | null;
  wallet?: {
    play_credits: number;
    reward_credits: number;
    lifetime_credits: number;
  };
}

const fmt = (n: number) => n.toLocaleString("de-DE");

const ROLE_PILL =
  "rounded-full border px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] whitespace-nowrap";

const ACTION_BTN =
  "h-[30px] w-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary";

const TAB_TRIGGER =
  "inline-flex items-center gap-[7px] whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-2.5 pt-0 text-[13.5px] font-bold text-[hsl(0_0%_60%)] shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

const KPI_TILE = "flex flex-col gap-[7px] rounded-[14px] border p-[15px]";
const KPI_LABEL = "font-mono text-[9.5px] uppercase tracking-[0.14em] text-[hsl(0_0%_65%)]";
const KPI_VALUE = "font-mono text-[22px] font-bold leading-none";
const KPI_LIME =
  "border-[hsl(71_91%_51%/0.26)] bg-[linear-gradient(135deg,hsl(71_91%_51%/0.09),hsl(71_91%_51%/0.02))]";
const KPI_BLUE = "border-[hsl(200_100%_75%/0.22)] bg-[hsl(200_100%_75%/0.05)]";
const KPI_NEUTRAL = "border-[hsl(0_0%_13%)] bg-white/[0.03]";

const SUB_BOX =
  "flex flex-col gap-3 rounded-[15px] border border-[hsl(0_0%_12%)] bg-white/[0.025] p-[17px]";
const SUB_BOX_TITLE = "font-display text-sm font-bold tracking-tight text-foreground";

const LIST_ROW =
  "flex flex-wrap items-center gap-[13px] rounded-xl border border-[hsl(0_0%_12%)] bg-white/[0.028] px-3.5 py-3";

const DELETE_ITEMS = [
  "Profil- und Kontodaten",
  "Wallet + Credits",
  "Buchungen + Zahlungen",
  "Matches + Analysen",
  "Rewards + Transaktionen",
  "Benachrichtigungen + Streaks",
];

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserWithDetails | null>(null);
  const [membershipUser, setMembershipUser] = useState<UserWithDetails | null>(null);
  const [membershipClubId, setMembershipClubId] = useState("");
  const [membershipValidUntil, setMembershipValidUntil] = useState("");
  const queryClient = useQueryClient();

  const PER_PAGE = 25;
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch ALL registered users (server-paginated over auth.users, enriched with profile/roles/wallet)
  const { data: usersResult, isLoading } = useQuery({
    queryKey: ["admin-all-users", page, debouncedSearch],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "list_all_users", page, perPage: PER_PAGE, search: debouncedSearch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        users: UserWithDetails[];
        total: number;
        page: number;
        perPage: number;
        hasMore: boolean;
      };
    },
  });

  const users = usersResult?.users;
  const total = usersResult?.total ?? 0;
  const hasMore = usersResult?.hasMore ?? false;

  // Fetch user details (matches, bookings, ledger)
  const { data: userDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["admin-user-details", selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser?.user_id) return null;

      // Fetch matches
      const { data: matches } = await supabase
        .from("match_analyses")
        .select("id, match_id, created_at, result, ai_score, credits_awarded, status, opponent_user_id")
        .eq("user_id", selectedUser.user_id)
        .order("created_at", { ascending: false })
        .limit(20);

      // Fetch bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select(`
          id,
          start_time,
          end_time,
          status,
          price_cents,
          courts (name),
          locations (name)
        `)
        .eq("user_id", selectedUser.user_id)
        .order("start_time", { ascending: false })
        .limit(20);

      // Fetch ledger
      const { data: ledger } = await supabase
        .from("points_ledger")
        .select("id, created_at, credit_type, delta_points, balance_after, description, entry_type")
        .eq("user_id", selectedUser.user_id)
        .order("created_at", { ascending: false })
        .limit(30);

      // Fetch skill stats
      const { data: skillStats } = await supabase
        .from("skill_stats")
        .select("skill_level, ai_rank")
        .eq("user_id", selectedUser.user_id)
        .maybeSingle();

      // Total match / booking counts (cheap, selected user only)
      const [{ count: matchCount }, { count: bookingCount }] = await Promise.all([
        supabase
          .from("match_analyses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", selectedUser.user_id),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", selectedUser.user_id),
      ]);

      return { matches, bookings, ledger, skillStats, matchCount: matchCount ?? 0, bookingCount: bookingCount ?? 0 };
    },
    enabled: !!selectedUser?.user_id,
  });

  // Vereinsmitgliedschaften — eine Zeile je Nutzer (UNIQUE user_id in der DB).
  const { data: memberships } = useQuery({
    queryKey: ["admin-club-memberships"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("club_memberships")
        .select("id, user_id, club_id, valid_until, source, clubs(name)");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        club_id: string;
        valid_until: string | null;
        source: string;
        clubs: { name: string } | null;
      }>;
    },
  });

  const membershipByUser = new Map((memberships ?? []).map((m) => [m.user_id, m]));

  // Eigene Admin-Rollen je Nutzer — ein Nutzer kann mehrere gleichzeitig haben.
  const { data: adminRoleMap } = useQuery({
    queryKey: ["admin-user-roles-map"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_admin_roles")
        .select("user_id, admin_roles(id, name, admin_role_pages(page_key))");
      if (error) throw error;

      const map = new Map<string, Array<{ id: string; name: string; pageCount: number }>>();
      for (const row of (data ?? []) as Array<{
        user_id: string;
        admin_roles: { id: string; name: string; admin_role_pages: Array<{ page_key: string }> } | null;
      }>) {
        if (!row.admin_roles) continue;
        const list = map.get(row.user_id) ?? [];
        list.push({
          id: row.admin_roles.id,
          name: row.admin_roles.name,
          pageCount: row.admin_roles.admin_role_pages?.length ?? 0,
        });
        map.set(row.user_id, list);
      }
      return map;
    },
  });

  const { data: clubs } = useQuery({
    queryKey: ["admin-clubs-for-membership"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const setMembershipMutation = useMutation({
    mutationFn: async ({
      userId,
      clubId,
      validUntil,
    }: {
      userId: string;
      clubId: string;
      validUntil: string | null;
    }) => {
      // Genau ein Verein pro Nutzer: upsert auf user_id statt Insert.
      const { error } = await (supabase as any)
        .from("club_memberships")
        .upsert(
          { user_id: userId, club_id: clubId, valid_until: validUntil, source: "admin", is_active: true },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vereinsmitgliedschaft gespeichert");
      queryClient.invalidateQueries({ queryKey: ["admin-club-memberships"] });
      setMembershipUser(null);
    },
    onError: (error: Error) => toast.error("Fehler: " + error.message),
  });

  const removeMembershipMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await (supabase as any)
        .from("club_memberships")
        .delete()
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vereinsmitgliedschaft entfernt");
      queryClient.invalidateQueries({ queryKey: ["admin-club-memberships"] });
      setMembershipUser(null);
    },
    onError: (error: Error) => toast.error("Fehler: " + error.message),
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, role, hasRole }: { userId: string; role: "admin" | "club_owner" | "user"; hasRole: boolean }) => {
      if (hasRole) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert([{
          user_id: userId,
          role: role,
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Rolle aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (error: Error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "delete_user", userId, confirmPhrase: "DELETE" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Benutzer erfolgreich gelöscht");
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      setDeleteConfirmText("");
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Löschen: " + error.message);
    },
  });

  const openDeleteDialog = (user: UserWithDetails) => {
    setUserToDelete(user);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteConfirmText !== "DELETE" || !userToDelete) return;
    deleteUserMutation.mutate(userToDelete.user_id);
  };

  const getStatusBadge = (status: string) => {
    const base = "rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap";
    switch (status) {
      case "confirmed":
      case "completed":
        return (
          <Badge variant="outline" className={`${base} border-primary/30 bg-primary/10 text-primary`}>
            Bestätigt
          </Badge>
        );
      case "cancelled":
        return (
          <Badge
            variant="outline"
            className={`${base} border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]`}
          >
            Storniert
          </Badge>
        );
      case "pending":
      case "pending_payment":
        return (
          <Badge
            variant="outline"
            className={`${base} border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]`}
          >
            Ausstehend
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className={`${base} border-[hsl(0_0%_18%)] bg-white/5 text-muted-foreground`}>
            {status}
          </Badge>
        );
    }
  };

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <p className="text-sm text-muted-foreground">
          Vollständige Benutzerverwaltung — Suche über E-Mail, Name, Username und User-ID.
        </p>

        {/* Benutzerliste */}
        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                Benutzerliste{" "}
                <span className="font-mono text-sm font-normal text-[hsl(0_0%_65%)]">({fmt(total)})</span>
              </h2>
              <label className="relative flex min-w-[min(300px,100%)] items-center">
                <Search className="pointer-events-none absolute left-[11px] h-[15px] w-[15px] text-[hsl(0_0%_58%)]" />
                <Input
                  placeholder="Name, Username, E-Mail oder ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9 text-[13.5px] focus-visible:border-primary focus-visible:ring-0"
                />
              </label>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Laden...</p>
            ) : users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow className="border-transparent hover:bg-transparent">
                      <TableHead className="h-auto px-0 pb-3 pr-3.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Benutzer
                      </TableHead>
                      <TableHead className="h-auto px-0 pb-3 pr-3.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Username
                      </TableHead>
                      <TableHead className="h-auto px-0 pb-3 pr-3.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Credits
                      </TableHead>
                      <TableHead className="h-auto px-0 pb-3 pr-3.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Rollen
                      </TableHead>
                      <TableHead className="h-auto px-0 pb-3 pr-3.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Registriert
                      </TableHead>
                      <TableHead className="h-auto px-0 pb-3 text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">
                        Aktionen
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const isAdmin = user.roles.includes("admin");
                      return (
                        <TableRow
                          key={user.user_id}
                          className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]"
                        >
                          <TableCell className="px-0 py-3 pr-3.5">
                            <div className="flex items-center gap-[11px]">
                              <Avatar
                                className={`h-[34px] w-[34px] flex-none border ${
                                  isAdmin ? "border-primary" : "border-[hsl(0_0%_18%)]"
                                }`}
                              >
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback
                                  className={`font-display text-[11.5px] font-extrabold ${
                                    isAdmin
                                      ? "bg-gradient-lime text-[#0A0A0A]"
                                      : "bg-white/[0.06] text-[hsl(0_0%_82%)]"
                                  }`}
                                >
                                  {user.display_name?.slice(0, 2).toUpperCase() || "??"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex min-w-0 flex-col gap-[1px]">
                                <p className="truncate text-[13.5px] font-semibold text-foreground">
                                  {user.display_name || "Unbekannt"}
                                </p>
                                {user.email && (
                                  <p className="truncate font-mono text-[11px] text-[hsl(0_0%_65%)]">
                                    {user.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-0 py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                            {user.username ? `@${user.username}` : "-"}
                          </TableCell>
                          <TableCell className="px-0 py-3 pr-3.5">
                            <span className="inline-flex items-center gap-[7px] whitespace-nowrap font-mono text-[13px] font-bold text-primary">
                              <Coins className="h-[13px] w-[13px]" />
                              {fmt((user.wallet?.reward_credits || 0) + (user.wallet?.play_credits || 0))}
                            </span>
                          </TableCell>
                          <TableCell className="px-0 py-3 pr-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {user.roles.includes("admin") && (
                                <Badge
                                  variant="outline"
                                  className={`${ROLE_PILL} border-[hsl(347_89%_58%/0.35)] bg-[hsl(347_89%_58%/0.12)] text-[#F43F5E]`}
                                >
                                  Admin
                                </Badge>
                              )}
                              {user.roles.includes("club_owner") && (
                                <Badge
                                  variant="outline"
                                  className={`${ROLE_PILL} border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] text-[#FFC44D]`}
                                >
                                  🎾 Club
                                </Badge>
                              )}
                              {(adminRoleMap?.get(user.user_id) ?? []).map((role) => (
                                <Badge
                                  key={role.id}
                                  variant="outline"
                                  className={`${ROLE_PILL} border-[hsl(258_90%_70%/0.35)] bg-[hsl(258_90%_70%/0.12)] text-[#B197FC]`}
                                  title={`Eigene Rolle · ${role.pageCount} Seiten`}
                                >
                                  {role.name} · {role.pageCount}
                                </Badge>
                              ))}
                              {membershipByUser.get(user.user_id) && (
                                <Badge
                                  variant="outline"
                                  className={`${ROLE_PILL} border-primary/35 bg-primary/[0.12] text-primary`}
                                >
                                  {membershipByUser.get(user.user_id)!.clubs?.name ?? "Verein"}
                                </Badge>
                              )}
                              {user.roles.length === 0 &&
                                !membershipByUser.get(user.user_id) &&
                                (adminRoleMap?.get(user.user_id) ?? []).length === 0 && (
                                <Badge
                                  variant="outline"
                                  className={`${ROLE_PILL} border-[hsl(0_0%_18%)] bg-white/5 text-[hsl(0_0%_72%)]`}
                                >
                                  User
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-0 py-3 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                            {format(new Date(user.created_at), "dd.MM.yyyy")}
                          </TableCell>
                          <TableCell className="px-0 py-3 text-right">
                            <div className="flex items-center justify-end gap-[7px]">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Details"
                                className={ACTION_BTN}
                                onClick={() => {
                                  setSelectedUser(user);
                                  setActiveTab("overview");
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>

                              {/* Role Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    className={`h-[30px] gap-1.5 rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 px-2.5 text-[11.5px] font-semibold hover:bg-white/10 hover:text-foreground ${
                                      user.roles.length > 0 ? "text-primary" : "text-[hsl(0_0%_82%)]"
                                    }`}
                                  >
                                    Rollen
                                    <ChevronDown className="h-3 w-3 text-[hsl(0_0%_58%)]" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="rounded-xl border-[hsl(0_0%_16%)] bg-[hsl(0_0%_7%)]"
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toggleRoleMutation.mutate({
                                        userId: user.user_id,
                                        role: "admin",
                                        hasRole: user.roles.includes("admin"),
                                      })
                                    }
                                  >
                                    <ShieldCheck className="h-4 w-4 mr-2" />
                                    {user.roles.includes("admin") ? "Admin entfernen" : "Admin machen"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toggleRoleMutation.mutate({
                                        userId: user.user_id,
                                        role: "club_owner",
                                        hasRole: user.roles.includes("club_owner"),
                                      })
                                    }
                                    className="text-[#FFC44D]"
                                  >
                                    <span className="mr-2">🎾</span>
                                    {user.roles.includes("club_owner") ? "Club Owner entfernen" : "Club Owner machen"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const existing = membershipByUser.get(user.user_id);
                                      setMembershipUser(user);
                                      setMembershipClubId(existing?.club_id ?? "");
                                      setMembershipValidUntil(existing?.valid_until ?? "");
                                    }}
                                    className="text-primary"
                                  >
                                    <Users className="h-4 w-4 mr-2" />
                                    {membershipByUser.get(user.user_id)
                                      ? "Vereinsmitgliedschaft ändern"
                                      : "Vereinsmitglied machen"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                                onClick={() => openDeleteDialog(user)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                Keine Benutzer gefunden
              </p>
            )}

            {(page > 1 || hasMore) && (
              <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[hsl(0_0%_12%)] pt-3.5">
                <span className="text-[12.5px] text-[hsl(0_0%_65%)]">
                  25 pro Seite · serverseitig paginiert
                </span>
                <div className="flex items-center gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-[34px] gap-1.5 rounded-[9px] border-[hsl(0_0%_16%)] bg-white/[0.05] px-[13px] text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/[0.05] hover:text-primary disabled:text-[hsl(0_0%_45%)]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Zurück
                  </Button>
                  <span className="whitespace-nowrap font-mono text-[12.5px] font-bold text-foreground">
                    Seite {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasMore || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-[34px] gap-1.5 rounded-[9px] border-[hsl(0_0%_16%)] bg-white/[0.05] px-[13px] text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/[0.05] hover:text-primary disabled:text-[hsl(0_0%_45%)]"
                  >
                    Weiter
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="grid max-h-[90vh] max-w-[860px] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden rounded-[22px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))] p-0">
          <DialogHeader className="border-b border-[hsl(0_0%_14%)] px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle className="flex items-center gap-[13px] text-foreground">
              {selectedUser && (
                <>
                  <Avatar className="h-[46px] w-[46px] flex-none">
                    <AvatarImage src={selectedUser.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-lime font-display text-[15px] font-extrabold text-[#0A0A0A]">
                      {selectedUser.display_name?.slice(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-display text-[19px] font-extrabold tracking-tight text-foreground">
                      {selectedUser.display_name || "Unbekannt"}
                    </span>
                    {selectedUser.username && (
                      <span className="truncate font-mono text-[11.5px] font-normal text-[hsl(0_0%_65%)]">
                        @{selectedUser.username}
                      </span>
                    )}
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-4 flex h-auto w-full justify-start gap-[22px] overflow-x-auto rounded-none border-b border-[hsl(0_0%_14%)] bg-transparent p-0">
                  <TabsTrigger value="overview" className={TAB_TRIGGER}>
                    <LayoutDashboard className="h-[15px] w-[15px]" />
                    Übersicht
                  </TabsTrigger>
                  <TabsTrigger value="matches" className={TAB_TRIGGER}>
                    <Swords className="h-[15px] w-[15px]" />
                    Matches
                  </TabsTrigger>
                  <TabsTrigger value="bookings" className={TAB_TRIGGER}>
                    <Calendar className="h-[15px] w-[15px]" />
                    Buchungen
                  </TabsTrigger>
                  <TabsTrigger value="wallet" className={TAB_TRIGGER}>
                    <Wallet className="h-[15px] w-[15px]" />
                    Wallet
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-[11px]">
                    <div className={`${KPI_TILE} ${KPI_LIME}`}>
                      <span className={KPI_LABEL}>Reward Credits</span>
                      <span className={`${KPI_VALUE} text-primary`}>
                        {fmt(selectedUser.wallet?.reward_credits || 0)}
                      </span>
                    </div>
                    <div className={`${KPI_TILE} ${KPI_BLUE}`}>
                      <span className={KPI_LABEL}>Play Credits</span>
                      <span className={`${KPI_VALUE} text-[#7FD4FF]`}>
                        {fmt(selectedUser.wallet?.play_credits || 0)}
                      </span>
                    </div>
                    <div className={`${KPI_TILE} ${KPI_NEUTRAL}`}>
                      <span className={KPI_LABEL}>Matches</span>
                      <span className={`${KPI_VALUE} text-foreground`}>{fmt(userDetails?.matchCount ?? 0)}</span>
                    </div>
                    <div className={`${KPI_TILE} ${KPI_NEUTRAL}`}>
                      <span className={KPI_LABEL}>Buchungen</span>
                      <span className={`${KPI_VALUE} text-foreground`}>{fmt(userDetails?.bookingCount ?? 0)}</span>
                    </div>
                  </div>

                  {/* Profile Info */}
                  <div className={SUB_BOX}>
                    <span className={SUB_BOX_TITLE}>Profil-Informationen</span>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-[11px]">
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>User ID</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {selectedUser.user_id.slice(0, 8)}...
                        </span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>Registriert</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {format(new Date(selectedUser.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>Skill Level</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {selectedUser.skill_self_rating || 0}/10
                          {userDetails?.skillStats?.skill_level
                            ? ` · AI: ${userDetails.skillStats.skill_level}`
                            : ""}
                        </span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>Alter</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {selectedUser.age || "-"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>Referral Code</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {selectedUser.referral_code || "-"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <span className={KPI_LABEL}>Lifetime Credits</span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">
                          {fmt(selectedUser.wallet?.lifetime_credits || 0)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] items-start gap-3">
                    {/* Verification Status */}
                    <div className={SUB_BOX}>
                      <span className={SUB_BOX_TITLE}>Verifizierungsstatus</span>
                      <div className="flex flex-col gap-[11px]">
                        <div className="flex items-center gap-2.5">
                          {selectedUser.email_verified_at ? (
                            <CheckCircle className="h-[15px] w-[15px] flex-none text-primary" />
                          ) : (
                            <XCircle className="h-[15px] w-[15px] flex-none text-[hsl(0_0%_45%)]" />
                          )}
                          <span className="text-[13px] text-[hsl(0_0%_78%)]">E-Mail verifiziert</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {selectedUser.phone_verified_at ? (
                            <CheckCircle className="h-[15px] w-[15px] flex-none text-primary" />
                          ) : (
                            <XCircle className="h-[15px] w-[15px] flex-none text-[hsl(0_0%_45%)]" />
                          )}
                          <span className="text-[13px] text-[hsl(0_0%_78%)]">Telefon verifiziert</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {selectedUser.profile_completed_at ? (
                            <CheckCircle className="h-[15px] w-[15px] flex-none text-primary" />
                          ) : (
                            <XCircle className="h-[15px] w-[15px] flex-none text-[hsl(0_0%_45%)]" />
                          )}
                          <span className="text-[13px] text-[hsl(0_0%_78%)]">Profil vollständig</span>
                        </div>
                      </div>
                    </div>

                    {/* Shipping Address */}
                    {selectedUser.shipping_address_line1 && (
                      <div className={SUB_BOX}>
                        <span className={SUB_BOX_TITLE}>Lieferadresse</span>
                        <div className="flex flex-col gap-[3px]">
                          <span className="text-[13px] text-[hsl(0_0%_82%)]">
                            {selectedUser.shipping_address_line1}
                          </span>
                          <span className="text-[13px] text-[hsl(0_0%_82%)]">
                            {selectedUser.shipping_postal_code} {selectedUser.shipping_city}
                          </span>
                          <span className="text-[13px] text-[hsl(0_0%_65%)]">
                            {selectedUser.shipping_country}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Matches Tab */}
                <TabsContent value="matches" className="mt-0">
                  {isLoadingDetails ? (
                    <p className="py-8 text-center text-muted-foreground">Laden...</p>
                  ) : userDetails?.matches && userDetails.matches.length > 0 ? (
                    <div className="flex flex-col gap-[9px]">
                      {userDetails.matches.map((match) => (
                        <div key={match.id} className={LIST_ROW}>
                          <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                            <span className="whitespace-nowrap font-mono text-[12.5px] font-bold text-foreground">
                              Match #{match.match_id.slice(0, 8)}
                            </span>
                            <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_65%)]">
                              {format(new Date(match.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                            </span>
                          </div>
                          {match.result && (
                            <Badge
                              variant="outline"
                              className={`flex-none rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] ${
                                match.result === "WIN"
                                  ? "border-[hsl(71_91%_51%/0.3)] bg-primary/10 text-primary"
                                  : match.result === "LOSS"
                                  ? "border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]"
                                  : "border-[hsl(0_0%_18%)] bg-white/5 text-muted-foreground"
                              }`}
                            >
                              {match.result}
                            </Badge>
                          )}
                          {match.ai_score !== null && (
                            <span className="flex-none whitespace-nowrap font-mono text-xs text-[hsl(0_0%_72%)]">
                              AI: {match.ai_score}
                            </span>
                          )}
                          <span className="flex-none whitespace-nowrap font-mono text-[12.5px] font-bold text-primary">
                            +{match.credits_awarded}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-muted-foreground">Keine Matches</p>
                  )}
                </TabsContent>

                {/* Bookings Tab */}
                <TabsContent value="bookings" className="mt-0">
                  {isLoadingDetails ? (
                    <p className="py-8 text-center text-muted-foreground">Laden...</p>
                  ) : userDetails?.bookings && userDetails.bookings.length > 0 ? (
                    <div className="flex flex-col gap-[9px]">
                      {userDetails.bookings.map((booking: any) => (
                        <div key={booking.id} className={LIST_ROW}>
                          <div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
                            <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
                              {booking.courts?.name} @ {booking.locations?.name}
                            </span>
                            <span className="whitespace-nowrap font-mono text-[11px] text-[hsl(0_0%_65%)]">
                              {format(new Date(booking.start_time), "dd.MM.yyyy HH:mm", { locale: de })}
                              {" – "}
                              {format(new Date(booking.end_time), "HH:mm", { locale: de })}
                            </span>
                          </div>
                          {booking.price_cents && (
                            <span className="flex-none whitespace-nowrap font-mono text-[12.5px] font-bold text-foreground">
                              {(booking.price_cents / 100).toFixed(2).replace(".", ",")} €
                            </span>
                          )}
                          <span className="flex-none">{getStatusBadge(booking.status)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-muted-foreground">Keine Buchungen</p>
                  )}
                </TabsContent>

                {/* Wallet Tab */}
                <TabsContent value="wallet" className="mt-0 space-y-4">
                  {/* Wallet Summary */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-[11px]">
                    <div className={`${KPI_TILE} ${KPI_LIME}`}>
                      <span className={KPI_LABEL}>Reward Credits</span>
                      <span className={`${KPI_VALUE} text-primary`}>
                        {fmt(selectedUser.wallet?.reward_credits || 0)}
                      </span>
                    </div>
                    <div className={`${KPI_TILE} ${KPI_BLUE}`}>
                      <span className={KPI_LABEL}>Play Credits</span>
                      <span className={`${KPI_VALUE} text-[#7FD4FF]`}>
                        {fmt(selectedUser.wallet?.play_credits || 0)}
                      </span>
                    </div>
                    <div className={`${KPI_TILE} ${KPI_NEUTRAL}`}>
                      <span className={KPI_LABEL}>Lifetime</span>
                      <span className={`${KPI_VALUE} text-foreground`}>
                        {fmt(selectedUser.wallet?.lifetime_credits || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Ledger */}
                  <div className={SUB_BOX}>
                    <span className={SUB_BOX_TITLE}>Transaktionshistorie</span>
                    {isLoadingDetails ? (
                      <p className="py-4 text-center text-muted-foreground">Laden...</p>
                    ) : userDetails?.ledger && userDetails.ledger.length > 0 ? (
                      <div className="flex max-h-[300px] flex-col gap-[9px] overflow-y-auto">
                        {userDetails.ledger.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex flex-wrap items-center gap-3 rounded-[11px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-3 py-[11px]"
                          >
                            {entry.delta_points > 0 ? (
                              <TrendingUp className="h-[15px] w-[15px] flex-none text-primary" />
                            ) : (
                              <TrendingDown className="h-[15px] w-[15px] flex-none text-[#FF6B6B]" />
                            )}
                            <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                              <span className="text-[12.5px] text-[hsl(0_0%_82%)]">
                                {entry.description || entry.entry_type}
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap font-mono text-[10.5px] text-[hsl(0_0%_65%)]">
                                  {format(new Date(entry.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`rounded-full border-0 px-[7px] py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
                                    entry.credit_type === "play"
                                      ? "bg-[hsl(200_100%_75%/0.12)] text-[#7FD4FF]"
                                      : "bg-primary/[0.12] text-primary"
                                  }`}
                                >
                                  {entry.credit_type}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-none flex-col items-end gap-[1px]">
                              <span
                                className={`whitespace-nowrap font-mono text-[13px] font-bold ${
                                  entry.delta_points > 0 ? "text-primary" : "text-[#FF6B6B]"
                                }`}
                              >
                                {entry.delta_points > 0 ? "+" : ""}
                                {fmt(entry.delta_points)}
                              </span>
                              <span className="whitespace-nowrap font-mono text-[10.5px] text-[hsl(0_0%_58%)]">
                                → {fmt(entry.balance_after)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-muted-foreground">Keine Transaktionen</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="flex-row flex-wrap gap-2.5 border-t border-[hsl(0_0%_12%)] px-5 py-4 sm:px-6">
            <Button
              variant="outline"
              onClick={() => selectedUser && openDeleteDialog(selectedUser)}
              className="mr-auto h-[42px] gap-2 rounded-[11px] border-[hsl(0_100%_71%/0.32)] bg-[hsl(0_100%_71%/0.08)] px-[17px] text-[13.5px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.18)] hover:text-[#FF6B6B]"
            >
              <Trash2 className="h-[15px] w-[15px]" />
              Benutzer löschen
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedUser(null)}
              className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[18px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-h-[88vh] max-w-[480px] gap-[17px] overflow-y-auto rounded-[20px] border-[hsl(0_100%_71%/0.25)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))] p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
              Benutzer endgültig löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-[1.55] text-[hsl(0_0%_68%)]">
              Du bist dabei, den Benutzer{" "}
              <strong className="font-bold text-foreground">
                {userToDelete?.display_name || userToDelete?.username || "Unbekannt"}
              </strong>{" "}
              zu löschen.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-[9px] rounded-[13px] border border-[hsl(0_100%_71%/0.18)] bg-[hsl(0_100%_71%/0.05)] p-[15px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#FF6B6B]">
              Unwiderruflich — folgende Daten werden gelöscht
            </span>
            {DELETE_ITEMS.map((item) => (
              <span
                key={item}
                className="flex items-center gap-[9px] text-[12.5px] text-[hsl(0_0%_74%)]"
              >
                <span className="h-1 w-1 flex-none rounded-full bg-[#FF6B6B]" />
                {item}
              </span>
            ))}
          </div>

          <label className="flex flex-col gap-[7px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Gib DELETE ein, um zu bestätigen<span className="text-[#FF6B6B]"> *</span>
            </span>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/[0.04] font-mono text-sm font-bold tracking-[0.12em] focus-visible:border-[#FF6B6B] focus-visible:ring-0"
            />
          </label>

          <AlertDialogFooter className="gap-2.5 sm:gap-2.5">
            <AlertDialogCancel
              onClick={() => setDeleteConfirmText("")}
              className="mt-0 h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmText !== "DELETE" || deleteUserMutation.isPending}
              className="h-[42px] rounded-[11px] bg-[#FF6B6B] px-[19px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585] disabled:bg-[hsl(0_0%_14%)] disabled:text-[hsl(0_0%_45%)] disabled:opacity-100"
            >
              {deleteUserMutation.isPending ? "Lösche..." : "Endgültig löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vereinsmitgliedschaft — genau ein Verein pro Nutzer */}
      <Dialog open={!!membershipUser} onOpenChange={(open) => !open && setMembershipUser(null)}>
        <DialogContent className="rounded-2xl border-[hsl(0_0%_14%)] bg-[hsl(0_0%_6%)] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold tracking-tight">
              Vereinsmitgliedschaft
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <p className="text-[13px] leading-[1.5] text-[hsl(0_0%_60%)]">
              {membershipUser?.display_name || membershipUser?.email} bucht damit zu den
              Konditionen des gewählten Vereins. Ein Nutzer kann nur einem Verein angehören.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_65%)]">
                Verein
              </label>
              <select
                value={membershipClubId}
                onChange={(e) => setMembershipClubId(e.target.value)}
                className="h-[42px] rounded-[11px] border border-[hsl(0_0%_16%)] bg-white/5 px-3 text-[13.5px] text-foreground"
              >
                <option value="">Verein wählen …</option>
                {(clubs ?? []).map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_65%)]">
                Gültig bis (optional)
              </label>
              <Input
                type="date"
                value={membershipValidUntil}
                onChange={(e) => setMembershipValidUntil(e.target.value)}
                className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5"
              />
              <span className="text-[11.5px] text-[hsl(0_0%_50%)]">
                Leer = unbefristet. Danach greifen wieder die Externenpreise.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {membershipUser && membershipByUser.get(membershipUser.user_id) && (
              <Button
                variant="ghost"
                onClick={() =>
                  removeMembershipMutation.mutate(membershipByUser.get(membershipUser.user_id)!.id)
                }
                disabled={removeMembershipMutation.isPending}
                className="text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.1)] hover:text-[#FF6B6B]"
              >
                Mitgliedschaft entfernen
              </Button>
            )}
            <Button
              variant="hero"
              disabled={!membershipClubId || setMembershipMutation.isPending}
              onClick={() =>
                membershipUser &&
                setMembershipMutation.mutate({
                  userId: membershipUser.user_id,
                  clubId: membershipClubId,
                  validUntil: membershipValidUntil || null,
                })
              }
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
