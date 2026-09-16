import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ClubMemberTerms } from "@/components/admin/clubs/ClubMemberTerms";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  Building2,
  Users,
  LayoutGrid,
  Edit,
  Mail,
  UserPlus,
  UserMinus,
  X,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  courtSport,
  SPORT_CHIP_CLASSES,
  SPORT_LABEL,
  type CourtSport,
} from "@/components/admin/courts/types";

/** Sportart-Chip wie in der Court-Verwaltung: Padel = Lime, Tennis = Hellblau. */
const sportChip = (sport: CourtSport) => (
  <span
    className={`flex-none whitespace-nowrap rounded-full border px-[7px] py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SPORT_CHIP_CLASSES[sport]}`}
  >
    {SPORT_LABEL[sport]}
  </span>
);

interface Club {
  id: string;
  name: string;
  description: string | null;
  primary_contact_email: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  court_assignments?: ClubCourtAssignment[];
  club_users?: ClubUser[];
}

interface ClubCourtAssignment {
  id: string;
  club_id: string;
  court_id: string;
  monthly_free_minutes: number;
  court?: {
    id: string;
    name: string;
    // courts.sport fehlt noch in den generierten Typen (Migration 20260812100000)
    sport?: string | null;
    location?: {
      id: string;
      name: string;
    };
  };
}

interface AssignableCourt {
  id: string;
  name: string;
  sport?: string | null;
  location?: { id: string; name: string } | null;
}

interface ClubUser {
  id: string;
  club_id: string;
  user_id: string;
  role_in_club: string;
  is_active: boolean;
  created_at: string;
  profile?: {
    user_id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

export default function AdminClubs() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClubRef, setSelectedClub] = useState<Club | null>(null);
  
  // Dialog states
  const [isClubDialogOpen, setIsClubDialogOpen] = useState(false);
  const [isCourtDialogOpen, setIsCourtDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [pendingDeleteClub, setPendingDeleteClub] = useState<Club | null>(null);
  const [pendingRemoveUser, setPendingRemoveUser] = useState<ClubUser | null>(null);
  
  // Club form state
  const [clubName, setClubName] = useState("");
  const [clubDescription, setClubDescription] = useState("");
  const [clubEmail, setClubEmail] = useState("");
  
  // Court assignment form state
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState(2400);
  
  // User form state
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userRoleInClub, setUserRoleInClub] = useState<"manager" | "staff">("staff");

  // Fetch all clubs with assignments and users
  const { data: clubs, isLoading } = useQuery({
    queryKey: ["admin-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select(`
          *,
          court_assignments:club_court_assignments (
            *,
            court:courts (
              id,
              name,
              sport,
              location:locations (
                id,
                name
              )
            )
          ),
          club_users (
            *
          )
        `)
        .order("name");

      if (error) throw error;

      // Fetch profiles for club users
      const allUserIds = data.flatMap(club => 
        club.club_users?.map((cu: ClubUser) => cu.user_id) || []
      );
      
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, username, avatar_url")
          .in("user_id", allUserIds);

        return data.map(club => ({
          ...club,
          club_users: club.club_users?.map((cu: ClubUser) => ({
            ...cu,
            profile: profiles?.find(p => p.user_id === cu.user_id),
          })),
        })) as Club[];
      }

      return data as Club[];
    },
  });

  // Auswahl immer aus den frischen Query-Daten auflösen — der State hält nur die
  // Auswahl fest; nach Mutationen (Toggle, Courts, Mitglieder) wäre die Kopie veraltet
  const selectedClub = selectedClubRef
    ? (clubs?.find((c) => c.id === selectedClubRef.id) ?? selectedClubRef)
    : null;

  // Fetch all courts for assignment
  // courts.sport fehlt noch in den generierten Typen (types.ts) → Cast
  const { data: courts } = useQuery({
    queryKey: ["admin-all-courts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select(`
          id,
          name,
          sport,
          location:locations (
            id,
            name
          )
        `)
        .eq("is_active", true);

      if (error) throw error;
      return (data ?? []) as unknown as AssignableCourt[];
    },
  });

  // Search users for adding to club
  const { data: searchedUsers } = useQuery({
    queryKey: ["admin-search-users", userSearchTerm],
    queryFn: async () => {
      if (userSearchTerm.length < 2) return [];
      
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .or(`username.ilike.%${userSearchTerm}%,display_name.ilike.%${userSearchTerm}%`)
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: userSearchTerm.length >= 2,
  });

  // Create/Update club mutation
  const clubMutation = useMutation({
    mutationFn: async () => {
      if (!clubName.trim()) {
        throw new Error("Club-Name ist erforderlich");
      }

      if (editingClub) {
        const { error } = await supabase
          .from("clubs")
          .update({
            name: clubName.trim(),
            description: clubDescription.trim() || null,
            primary_contact_email: clubEmail.trim() || null,
          })
          .eq("id", editingClub.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clubs")
          .insert({
            name: clubName.trim(),
            description: clubDescription.trim() || null,
            primary_contact_email: clubEmail.trim() || null,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingClub ? "Club aktualisiert" : "Club erstellt");
      setIsClubDialogOpen(false);
      resetClubForm();
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Speichern");
    },
  });

  // Delete club mutation
  const deleteClubMutation = useMutation({
    mutationFn: async (clubId: string) => {
      const { error } = await supabase
        .from("clubs")
        .delete()
        .eq("id", clubId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Club gelöscht");
      setSelectedClub(null);
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Löschen");
    },
  });

  // Toggle club active status
  const toggleClubMutation = useMutation({
    mutationFn: async ({ clubId, isActive }: { clubId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("clubs")
        .update({ is_active: isActive })
        .eq("id", clubId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Aktualisieren");
    },
  });

  // Add court assignment mutation
  const addCourtMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClub || !selectedCourtId) {
        throw new Error("Bitte wählen Sie einen Court aus");
      }

      const { error } = await supabase
        .from("club_court_assignments")
        .insert({
          club_id: selectedClub.id,
          court_id: selectedCourtId,
          monthly_free_minutes: weeklyMinutes,
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Dieser Court ist bereits diesem Club zugewiesen");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Court-Zuweisung erstellt");
      setIsCourtDialogOpen(false);
      resetCourtForm();
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Erstellen");
    },
  });

  // Update court assignment mutation
  const updateCourtMutation = useMutation({
    mutationFn: async ({ 
      assignmentId, 
      monthlyMinutes, 
    }: { 
      assignmentId: string; 
      monthlyMinutes: number;
    }) => {
      const { error } = await supabase
        .from("club_court_assignments")
        .update({
          monthly_free_minutes: monthlyMinutes,
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kontingent aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
      queryClient.invalidateQueries({ queryKey: ["club-court-assignments"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Aktualisieren");
    },
  });

  // Delete court assignment mutation
  const deleteCourtMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("club_court_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Court-Zuweisung gelöscht");
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Löschen");
    },
  });

  // Add club user mutation
  const addUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClub || !selectedUserId) {
        throw new Error("Bitte wählen Sie einen Benutzer aus");
      }

      const { error } = await supabase
        .from("club_users")
        .insert({
          club_id: selectedClub.id,
          user_id: selectedUserId,
          role_in_club: userRoleInClub,
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Dieser Benutzer ist bereits Mitglied dieses Clubs");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Benutzer hinzugefügt");
      setIsUserDialogOpen(false);
      resetUserForm();
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Hinzufügen");
    },
  });

  // Toggle club user active status
  const toggleUserMutation = useMutation({
    mutationFn: async ({ usersId, isActive }: { usersId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("club_users")
        .update({ is_active: isActive })
        .eq("id", usersId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Benutzer-Status aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Aktualisieren");
    },
  });

  // Remove club user mutation
  const removeUserMutation = useMutation({
    mutationFn: async (clubUserId: string) => {
      const { error } = await supabase
        .from("club_users")
        .delete()
        .eq("id", clubUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Benutzer entfernt");
      queryClient.invalidateQueries({ queryKey: ["admin-clubs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Fehler beim Entfernen");
    },
  });

  const resetClubForm = () => {
    setClubName("");
    setClubDescription("");
    setClubEmail("");
    setEditingClub(null);
  };

  const resetCourtForm = () => {
    setSelectedCourtId("");
    setWeeklyMinutes(2400);
  };

  const resetUserForm = () => {
    setUserSearchTerm("");
    setSelectedUserId("");
    setUserRoleInClub("staff");
  };

  const openEditClubDialog = (club: Club) => {
    setEditingClub(club);
    setClubName(club.name);
    setClubDescription(club.description || "");
    setClubEmail(club.primary_contact_email || "");
    setIsClubDialogOpen(true);
  };

  const filteredClubs = clubs?.filter((club) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      club.name.toLowerCase().includes(search) ||
      club.description?.toLowerCase().includes(search) ||
      club.primary_contact_email?.toLowerCase().includes(search)
    );
  });

  // Get available courts (not already assigned to selected club)
  const availableCourts = courts?.filter(court => 
    !selectedClub?.court_assignments?.some(a => a.court_id === court.id)
  );

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        {/* Beschreibung + Neuer Club */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Clubs, Court-Zuweisungen und Mitglieder verwalten
          </p>
          <Dialog open={isClubDialogOpen} onOpenChange={(open) => {
            setIsClubDialogOpen(open);
            if (!open) resetClubForm();
          }}>
            <DialogTrigger asChild>
              <Button className="h-9 gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] transition hover:brightness-110">
                <Plus className="h-[15px] w-[15px]" />
                Neuer Club
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))] p-6 sm:max-w-[480px]">
              <DialogHeader className="space-y-[5px] text-left">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Club</span>
                <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                  {editingClub ? "Club bearbeiten" : "Neuer Club"}
                </DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                  {editingClub
                    ? "Aktualisieren Sie die Club-Informationen."
                    : "Erstellen Sie einen neuen Club für Vereinsmitglieder."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-[7px]">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Club Name <span className="text-primary">*</span>
                  </Label>
                  <Input
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="z.B. TC Musterstadt"
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                  />
                </div>
                <div className="space-y-[7px]">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Beschreibung</Label>
                  <Textarea
                    value={clubDescription}
                    onChange={(e) => setClubDescription(e.target.value)}
                    placeholder="Kurze Beschreibung des Clubs..."
                    rows={3}
                    className="rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                  />
                </div>
                <div className="space-y-[7px]">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Kontakt-Email</Label>
                  <Input
                    type="email"
                    value={clubEmail}
                    onChange={(e) => setClubEmail(e.target.value)}
                    placeholder="kontakt@tennisclub.de"
                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04]"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2.5 sm:gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => setIsClubDialogOpen(false)}
                  className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={() => clubMutation.mutate()}
                  disabled={clubMutation.isPending}
                  className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition hover:brightness-110"
                >
                  {clubMutation.isPending ? "Speichern..." : (editingClub ? "Aktualisieren" : "Erstellen")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Clubs List */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-[15px] font-bold tracking-tight text-foreground">
                Clubs{" "}
                <span className="font-mono text-[13px] font-normal text-muted-foreground">
                  ({filteredClubs?.length ?? 0})
                </span>
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Club, Beschreibung oder Email…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-[38px] rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9 text-[13px]"
                />
              </div>
              {isLoading ? (
                <div className="py-4 text-center text-[13px] text-muted-foreground">Laden...</div>
              ) : filteredClubs?.length === 0 ? (
                <div className="py-4 text-center text-[13px] text-muted-foreground">
                  Keine Clubs gefunden
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredClubs?.map((club) => (
                    <div
                      key={club.id}
                      className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-[13px] border p-[13px] transition-colors ${
                        selectedClub?.id === club.id
                          ? "border-primary/45 bg-primary/[0.07]"
                          : "border-[hsl(0_0%_12%)] bg-white/[0.028] hover:border-[hsl(0_0%_20%)]"
                      }`}
                      onClick={() => setSelectedClub(club)}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{club.name}</span>
                        {!club.is_active && (
                          <Badge className="flex-none rounded-full border-0 bg-[hsl(0_100%_71%/0.1)] px-2 py-[3px] text-[10.5px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.1)]">Inaktiv</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-[5px]">
                          <LayoutGrid className="h-3 w-3" />
                          {club.court_assignments?.length ?? 0} Courts
                        </span>
                        <span className="flex items-center gap-[5px]">
                          <Users className="h-3 w-3" />
                          {club.club_users?.filter(u => u.is_active)?.length ?? 0} User
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Club Details + Hilfe */}
          <div className="flex min-w-0 flex-col gap-[18px]">
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            {selectedClub ? (
              <div className="flex flex-col gap-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-[7px]">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-[22px] font-extrabold tracking-tight text-foreground">
                        {selectedClub.name}
                      </h2>
                      <Switch
                        checked={selectedClub.is_active}
                        onCheckedChange={(checked) =>
                          toggleClubMutation.mutate({ clubId: selectedClub.id, isActive: checked })
                        }
                      />
                    </div>
                    <p className="max-w-[560px] text-[13.5px] leading-relaxed text-muted-foreground">
                      {selectedClub.description || "Keine Beschreibung"}
                    </p>
                    {selectedClub.primary_contact_email && (
                      <span className="inline-flex items-center gap-[7px] font-mono text-xs text-muted-foreground">
                        <Mail className="h-[13px] w-[13px] flex-none" />
                        {selectedClub.primary_contact_email}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-none gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditClubDialog(selectedClub)}
                      className="h-9 rounded-[10px] border-[hsl(0_0%_16%)] bg-white/5 px-3.5 text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Bearbeiten
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 rounded-[10px] border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] p-0 text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                      onClick={() => setPendingDeleteClub(selectedClub)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Tabs defaultValue="courts" className="w-full">
                    <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-[hsl(0_0%_12%)] bg-transparent p-0">
                      <TabsTrigger
                        value="courts"
                        className="gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-[13.5px] font-bold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <LayoutGrid className="h-[15px] w-[15px]" />
                        Courts ({selectedClub.court_assignments?.length ?? 0})
                      </TabsTrigger>
                      <TabsTrigger
                        value="users"
                        className="gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-[13.5px] font-bold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <Users className="h-[15px] w-[15px]" />
                        Portal-Zugänge ({selectedClub.club_users?.filter(u => u.is_active)?.length ?? 0})
                      </TabsTrigger>
                      <TabsTrigger
                        value="member-terms"
                        className="gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-[11px] pt-0 text-[13.5px] font-bold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <Users className="h-[15px] w-[15px]" />
                        Vereinsmitglieder
                      </TabsTrigger>
                    </TabsList>

                    {/* Vereinsmitglieder: Konditionen + Mitgliederliste */}
                    <TabsContent value="member-terms" className="mt-4">
                      <ClubMemberTerms clubId={selectedClub.id} />
                    </TabsContent>

                    {/* Courts Tab */}
                    <TabsContent value="courts" className="mt-4 space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3.5">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-[13.5px] font-bold text-foreground">Court-Zuweisungen & Kontingente</h3>
                          <span className="text-xs text-muted-foreground">Freie Minuten pro Monat je Court</span>
                        </div>
                        <Dialog open={isCourtDialogOpen} onOpenChange={(open) => {
                          setIsCourtDialogOpen(open);
                          if (!open) resetCourtForm();
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              className="h-[34px] gap-1.5 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/[0.09] px-[13px] text-[12.5px] font-bold text-primary shadow-none hover:bg-primary/[0.18]"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Court hinzufügen
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))] p-6 sm:max-w-[460px]">
                            <DialogHeader className="space-y-1.5 text-left">
                              <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">Court zuweisen</DialogTitle>
                              <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                                Weisen Sie dem Club "{selectedClub.name}" einen Court mit Monatskontingent zu.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                              <div className="space-y-[7px]">
                                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                  Court <span className="text-primary">*</span>
                                </Label>
                                <Select value={selectedCourtId} onValueChange={setSelectedCourtId}>
                                  <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                                    <SelectValue placeholder="Court auswählen..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableCourts?.map((court) => (
                                      <SelectItem key={court.id} value={court.id}>
                                        <span className="flex items-center gap-2">
                                          {court.name} ({court.location?.name})
                                          {sportChip(courtSport(court))}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {availableCourts?.length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Alle verfügbaren Courts sind bereits zugewiesen.
                                  </p>
                                )}
                              </div>
                              <div className="space-y-[7px]">
                                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                  Monatskontingent (Stunden) <span className="text-primary">*</span>
                                </Label>
                                <Input
                                  type="number"
                                  value={weeklyMinutes / 60}
                                  onChange={(e) => setWeeklyMinutes(Number(e.target.value) * 60)}
                                  min={0}
                                  max={120}
                                  className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
                                />
                                <p className="font-mono text-[11.5px] text-muted-foreground">
                                  = {weeklyMinutes.toLocaleString("de-DE")} Minuten pro Monat
                                </p>
                              </div>
                            </div>
                            <DialogFooter className="gap-2.5 sm:gap-2.5">
                              <Button
                                variant="outline"
                                onClick={() => setIsCourtDialogOpen(false)}
                                className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                              >
                                Abbrechen
                              </Button>
                              <Button
                                onClick={() => addCourtMutation.mutate()}
                                disabled={addCourtMutation.isPending || !selectedCourtId}
                                className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition hover:brightness-110"
                              >
                                {addCourtMutation.isPending ? "Hinzufügen..." : "Hinzufügen"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {selectedClub.court_assignments?.length === 0 ? (
                        <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] py-8 text-center text-sm text-muted-foreground">
                          Noch keine Courts zugewiesen
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                        <Table className="min-w-[700px]">
                          <TableHeader>
                            <TableRow className="border-0 hover:bg-transparent">
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Court</TableHead>
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Standort</TableHead>
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Sportart</TableHead>
                              <TableHead className="h-auto min-w-[210px] whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Kontingent</TableHead>
                              <TableHead className="h-auto w-[80px] whitespace-nowrap pb-3 pl-0 pr-0 text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Aktion</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedClub.court_assignments?.map((assignment) => (
                              <TableRow key={assignment.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.022]">
                                <TableCell className="whitespace-nowrap py-3 pl-0 pr-3.5 text-[13.5px] font-semibold text-foreground">
                                  {assignment.court?.name}
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-3 pl-0 pr-3.5 text-[13.5px] text-[hsl(0_0%_78%)]">
                                  {assignment.court?.location?.name}
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-3 pl-0 pr-3.5">
                                  {assignment.court && (
                                    <span className="flex">{sportChip(courtSport(assignment.court))}</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-3 pl-0 pr-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-0.5 rounded-[9px] border border-[hsl(0_0%_15%)] bg-white/[0.04] p-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-[26px] w-[26px] rounded-[7px] text-muted-foreground hover:bg-[hsl(0_100%_71%/0.1)] hover:text-[#FF6B6B]"
                                      disabled={assignment.monthly_free_minutes <= 0 || updateCourtMutation.isPending}
                                      onClick={() =>
                                        updateCourtMutation.mutate({
                                          assignmentId: assignment.id,
                                          monthlyMinutes: Math.max(0, assignment.monthly_free_minutes - 60),
                                        })
                                      }
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                    <Input
                                      type="number"
                                      className="h-[26px] w-12 border-0 bg-transparent p-0 text-center font-mono text-[13px] font-bold shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      defaultValue={assignment.monthly_free_minutes / 60}
                                      key={assignment.monthly_free_minutes}
                                      onBlur={(e) => {
                                        const newValue = Math.min(120, Math.max(0, Number(e.target.value)));
                                        if (newValue * 60 !== assignment.monthly_free_minutes) {
                                          updateCourtMutation.mutate({
                                            assignmentId: assignment.id,
                                            monthlyMinutes: newValue * 60,
                                          });
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      min={0}
                                      max={120}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-[26px] w-[26px] rounded-[7px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                      disabled={assignment.monthly_free_minutes >= 120 * 60 || updateCourtMutation.isPending}
                                      onClick={() =>
                                        updateCourtMutation.mutate({
                                          assignmentId: assignment.id,
                                          monthlyMinutes: Math.min(120 * 60, assignment.monthly_free_minutes + 60),
                                        })
                                      }
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                    </div>
                                    <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">h/Monat</span>
                                    <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground/70">
                                      = {assignment.monthly_free_minutes.toLocaleString("de-DE")} Min.
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 pl-0 pr-0">
                                  <div className="flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                                      onClick={() => deleteCourtMutation.mutate(assignment.id)}
                                      disabled={deleteCourtMutation.isPending}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      )}
                    </TabsContent>

                    {/* Users Tab */}
                    <TabsContent value="users" className="mt-4 space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3.5">
                        <h3 className="text-[13.5px] font-bold text-foreground">Club-Mitglieder</h3>
                        <Dialog open={isUserDialogOpen} onOpenChange={(open) => {
                          setIsUserDialogOpen(open);
                          if (!open) resetUserForm();
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              className="h-[34px] gap-1.5 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/[0.09] px-[13px] text-[12.5px] font-bold text-primary shadow-none hover:bg-primary/[0.18]"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Benutzer hinzufügen
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="rounded-[20px] border-[hsl(0_0%_15%)] bg-[linear-gradient(180deg,hsl(0_0%_7%),hsl(0_0%_4%))] p-6 sm:max-w-[460px]">
                            <DialogHeader className="space-y-1.5 text-left">
                              <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">Benutzer zu Club hinzufügen</DialogTitle>
                              <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                                Fügen Sie einen Benutzer zu "{selectedClub.name}" hinzu.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                              <div className="space-y-[7px]">
                                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                  Benutzer suchen <span className="text-primary">*</span>
                                </Label>
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" />
                                  <Input
                                    value={userSearchTerm}
                                    onChange={(e) => {
                                      setUserSearchTerm(e.target.value);
                                      setSelectedUserId("");
                                    }}
                                    placeholder="Username oder Name eingeben..."
                                    className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9"
                                  />
                                </div>
                                {searchedUsers && searchedUsers.length > 0 && !selectedUserId && (
                                  <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                                    {searchedUsers.map((user) => (
                                      <div
                                        key={user.user_id}
                                        className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border border-[hsl(0_0%_12%)] bg-white/[0.028] px-3 py-2.5 transition-colors hover:border-primary/40"
                                        onClick={() => {
                                          setSelectedUserId(user.user_id);
                                          setUserSearchTerm(user.display_name || user.username || "");
                                        }}
                                      >
                                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[hsl(0_0%_18%)] bg-white/[0.06] font-display text-[10.5px] font-extrabold text-[hsl(0_0%_82%)]">
                                          {(user.display_name || user.username || "?")
                                            .split(" ")
                                            .map((p) => p[0])
                                            .join("")
                                            .slice(0, 2)
                                            .toUpperCase()}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                                          {user.display_name || user.username}
                                        </span>
                                        {user.username && user.display_name && (
                                          <span className="flex-none font-mono text-[11px] text-muted-foreground">@{user.username}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {selectedUserId && (
                                  <div className="flex items-center gap-2 rounded-[11px] border border-primary/[0.28] bg-primary/[0.09] px-3 py-2">
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{userSearchTerm}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                                      onClick={() => {
                                        setSelectedUserId("");
                                        setUserSearchTerm("");
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-[7px]">
                                <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                  Rolle im Club <span className="text-primary">*</span>
                                </Label>
                                <Select
                                  value={userRoleInClub}
                                  onValueChange={(v) => setUserRoleInClub(v as "manager" | "staff")}
                                >
                                  <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px] font-semibold">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="staff">Staff</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter className="gap-2.5 sm:gap-2.5">
                              <Button
                                variant="outline"
                                onClick={() => setIsUserDialogOpen(false)}
                                className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                              >
                                Abbrechen
                              </Button>
                              <Button
                                onClick={() => addUserMutation.mutate()}
                                disabled={addUserMutation.isPending || !selectedUserId}
                                className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition hover:brightness-110"
                              >
                                {addUserMutation.isPending ? "Hinzufügen..." : "Hinzufügen"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {selectedClub.club_users?.length === 0 ? (
                        <div className="rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] py-8 text-center text-sm text-muted-foreground">
                          Noch keine Mitglieder hinzugefügt
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                        <Table className="min-w-[620px]">
                          <TableHeader>
                            <TableRow className="border-0 hover:bg-transparent">
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Benutzer</TableHead>
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Rolle</TableHead>
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Status</TableHead>
                              <TableHead className="h-auto whitespace-nowrap pb-3 pl-0 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Hinzugefügt</TableHead>
                              <TableHead className="h-auto w-[80px] whitespace-nowrap pb-3 pl-0 pr-0 text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Aktion</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedClub.club_users?.map((clubUser) => (
                              <TableRow key={clubUser.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.022]">
                                <TableCell className="py-3 pl-0 pr-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-primary/[0.26] bg-primary/10 font-display text-[11px] font-extrabold text-primary">
                                      {(clubUser.profile?.display_name || clubUser.profile?.username || "?")
                                        .split(" ")
                                        .map((p) => p[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-px">
                                      <span className="truncate text-[13px] font-semibold text-foreground">
                                        {clubUser.profile?.display_name || clubUser.profile?.username || "Unbekannt"}
                                      </span>
                                      {clubUser.profile?.username && clubUser.profile?.display_name && (
                                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                                          @{clubUser.profile.username}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 pl-0 pr-3.5">
                                  <Badge
                                    className={
                                      clubUser.role_in_club === "manager"
                                        ? "whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
                                        : "whitespace-nowrap rounded-full border border-[hsl(0_0%_18%)] bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/5"
                                    }
                                  >
                                    {clubUser.role_in_club === "manager" ? "Manager" : "Staff"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-3 pl-0 pr-3.5">
                                  <Switch
                                    checked={clubUser.is_active}
                                    onCheckedChange={(checked) =>
                                      toggleUserMutation.mutate({ usersId: clubUser.id, isActive: checked })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-3 pl-0 pr-3.5 font-mono text-[12.5px] text-[hsl(0_0%_78%)]">
                                  {format(new Date(clubUser.created_at), "dd.MM.yyyy", { locale: de })}
                                </TableCell>
                                <TableCell className="py-3 pl-0 pr-0">
                                  <div className="flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                                      onClick={() => setPendingRemoveUser(clubUser)}
                                      disabled={removeUserMutation.isPending}
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[hsl(0_0%_16%)] bg-white/5 text-muted-foreground">
                  <Building2 className="h-6 w-6" />
                </span>
                <p className="text-sm text-muted-foreground">Wählen Sie einen Club aus der Liste aus</p>
              </div>
            )}
          </Card>

          {/* Help Card */}
          <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
            <div className="flex flex-col gap-3.5">
              <span className="font-display text-[15px] font-bold tracking-tight text-foreground">
                So richten Sie einen Club ein:
              </span>
              <div className="flex flex-col gap-[11px]">
                {[
                  'Klicken Sie auf "Neuer Club" und geben Sie den Club-Namen ein',
                  "Wählen Sie den erstellten Club aus der Liste aus",
                  'Fügen Sie unter "Courts" die gewünschten Courts mit Monatskontingent hinzu',
                  'Fügen Sie unter "Mitglieder" die Benutzer hinzu, die das Club-Portal nutzen sollen',
                  "Die Club-Mitglieder können sich einloggen und werden zum Club-Portal weitergeleitet",
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-[13.5px] leading-normal text-[hsl(0_0%_72%)]">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={!!pendingDeleteClub} onOpenChange={(open) => { if (!open) setPendingDeleteClub(null); }}>
        <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Club wirklich löschen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              <strong className="text-foreground">{pendingDeleteClub?.name}</strong> wird gelöscht.
              Alle Court-Zuweisungen und Mitglieder werden entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteClub) deleteClubMutation.mutate(pendingDeleteClub.id);
              }}
              className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRemoveUser} onOpenChange={(open) => { if (!open) setPendingRemoveUser(null); }}>
        <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogHeader className="space-y-[7px] text-left">
            <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
              Benutzer wirklich aus dem Club entfernen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
              <strong className="text-foreground">
                {pendingRemoveUser?.profile?.display_name || pendingRemoveUser?.profile?.username || "Der Benutzer"}
              </strong>{" "}
              verliert den Zugriff auf das Club-Portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5">
            <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoveUser) removeUserMutation.mutate(pendingRemoveUser.id);
              }}
              className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
