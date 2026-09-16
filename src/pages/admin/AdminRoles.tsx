import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, Plus, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

interface AdminPageRow {
  key: string;
  label: string;
  route: string;
  sort_order: number;
  is_delegatable: boolean;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  pages: string[];
  members: Array<{ user_id: string; name: string; email: string }>;
}

const CARD = "rounded-2xl border border-[hsl(0_0%_14%)] bg-[hsl(0_0%_5%)] p-5";
const FIELD = "h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 text-[13.5px]";
const HINT = "text-[11.5px] leading-[1.5] text-[hsl(0_0%_52%)]";

export default function AdminRoles() {
  const queryClient = useQueryClient();

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);

  const [assignRole, setAssignRole] = useState<RoleRow | null>(null);
  const [userSearch, setUserSearch] = useState("");

  /** Katalog aller Admin-Seiten; nicht delegierbare bleiben Vollzugriff-Admins vorbehalten. */
  const { data: pageCatalog } = useQuery({
    queryKey: ["admin-page-catalog"],
    queryFn: async (): Promise<AdminPageRow[]> => {
      const { data, error } = await (supabase as any)
        .from("admin_pages")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as AdminPageRow[];
    },
  });

  const delegatable = (pageCatalog ?? []).filter((p) => p.is_delegatable);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async (): Promise<RoleRow[]> => {
      const { data: roleRows, error } = await (supabase as any)
        .from("admin_roles")
        .select("id, name, description, is_active, admin_role_pages(page_key), user_admin_roles(user_id)")
        .order("name");
      if (error) throw error;

      const rows = (roleRows ?? []) as Array<{
        id: string;
        name: string;
        description: string | null;
        is_active: boolean;
        admin_role_pages: Array<{ page_key: string }>;
        user_admin_roles: Array<{ user_id: string }>;
      }>;

      const userIds = [...new Set(rows.flatMap((r) => r.user_admin_roles.map((u) => u.user_id)))];
      const profiles = new Map<string, { name: string; email: string }>();

      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("user_id, display_name, username")
          .in("user_id", userIds);
        for (const p of profileRows ?? []) {
          profiles.set(p.user_id, {
            name: p.display_name || p.username || "Unbenannt",
            email: "",
          });
        }
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        pages: r.admin_role_pages.map((p) => p.page_key),
        members: r.user_admin_roles.map((u) => ({
          user_id: u.user_id,
          name: profiles.get(u.user_id)?.name ?? "Unbenannt",
          email: profiles.get(u.user_id)?.email ?? "",
        })),
      }));
    },
  });

  /** Nutzersuche für die Zuordnung — dieselbe Quelle wie in AdminUsers. */
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["admin-role-user-search", userSearch],
    enabled: !!assignRole && userSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "list_all_users", page: 1, perPage: 10, search: userSearch.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.users ?? []) as Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
      }>;
    },
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSelectedPages(new Set());
    setRoleDialogOpen(true);
  };

  const openEdit = (role: RoleRow) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? "");
    setSelectedPages(new Set(role.pages));
    setRoleDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Bitte einen Namen vergeben.");

      let roleId = editing?.id;

      if (roleId) {
        const { error } = await (supabase as any)
          .from("admin_roles")
          .update({ name: trimmed, description: description.trim() || null })
          .eq("id", roleId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("admin_roles")
          .insert({ name: trimmed, description: description.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        roleId = data.id as string;
      }

      // Seitenrechte komplett neu setzen — einfacher und immer konsistent.
      const { error: delError } = await (supabase as any)
        .from("admin_role_pages")
        .delete()
        .eq("role_id", roleId);
      if (delError) throw delError;

      if (selectedPages.size > 0) {
        const { error: insError } = await (supabase as any)
          .from("admin_role_pages")
          .insert([...selectedPages].map((page_key) => ({ role_id: roleId, page_key })));
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Rolle aktualisiert" : "Rolle angelegt");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      setRoleDialogOpen(false);
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await (supabase as any).from("admin_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rolle gelöscht");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles-map"] });
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { error } = await (supabase as any)
        .from("user_admin_roles")
        .insert({ user_id: userId, role_id: roleId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rolle zugewiesen");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles-map"] });
      setUserSearch("");
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { error } = await (supabase as any)
        .from("user_admin_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zuweisung entfernt");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles-map"] });
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  const togglePage = (key: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const labelFor = (key: string) =>
    pageCatalog?.find((p) => p.key === key)?.label ?? key;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rollen & Rechte</h1>
            <p className="text-sm text-muted-foreground">
              Eigene Rollen anlegen und ihnen einzelne Admin-Seiten freigeben
            </p>
          </div>
          <Button variant="hero" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Rolle anlegen
          </Button>
        </div>

        <div className={`${CARD} flex items-start gap-3`}>
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-primary" />
          <div className="flex flex-col gap-1">
            <p className="text-[13.5px] font-semibold text-foreground">
              Wer eine eigene Rolle hat, sieht ausschließlich die zugewiesenen Seiten
            </p>
            <p className={HINT}>
              Alles andere ist im Menü nicht sichtbar und beim direkten Aufruf gesperrt — auch die
              Daten dahinter. <strong>Nutzer</strong>, <strong>Rollen &amp; Rechte</strong>,{" "}
              <strong>Einstellungen</strong>, <strong>Integrationen</strong> und{" "}
              <strong>Features</strong> lassen sich bewusst nicht vergeben: darüber ließe sich der
              eigene Zugriff auf Vollzugriff ausweiten.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !roles || roles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(0_0%_18%)] px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              Noch keine eigene Rolle angelegt. Volladmins sind davon unberührt.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {roles.map((role) => (
              <Card key={role.id} className={CARD}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-bold text-foreground">{role.name}</h2>
                      {role.description && (
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => openEdit(role)}>
                        Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(role)}
                        className="h-8 w-8 border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_60%)]">
                      Seiten ({role.pages.length})
                    </span>
                    {role.pages.length === 0 ? (
                      <p className={HINT}>
                        Keine Seite zugewiesen — wer diese Rolle hat, kommt nicht ins Admin-Menü.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {role.pages.map((key) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className="rounded-full border-primary/30 bg-primary/[0.1] px-[9px] py-[3px] text-[10.5px] font-bold text-primary"
                          >
                            {labelFor(key)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(0_0%_60%)]">
                        Nutzer ({role.members.length})
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px] text-primary hover:text-primary"
                        onClick={() => {
                          setAssignRole(role);
                          setUserSearch("");
                        }}
                      >
                        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                        Zuweisen
                      </Button>
                    </div>
                    {role.members.length === 0 ? (
                      <p className={HINT}>Noch niemandem zugewiesen.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {role.members.map((m) => (
                          <span
                            key={m.user_id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(0_0%_18%)] bg-white/5 px-[9px] py-[3px] text-[11.5px] text-[hsl(0_0%_82%)]"
                          >
                            {m.name}
                            <button
                              type="button"
                              onClick={() =>
                                unassignMutation.mutate({ userId: m.user_id, roleId: role.id })
                              }
                              className="text-[hsl(0_0%_55%)] hover:text-[#FF6B6B]"
                              title="Zuweisung entfernen"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Rolle anlegen / bearbeiten */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-[hsl(0_0%_14%)] bg-[hsl(0_0%_6%)] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold tracking-tight">
              {editing ? "Rolle bearbeiten" : "Neue Rolle"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Redaktion"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Beschreibung (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Wofür ist diese Rolle gedacht?"
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Freigegebene Seiten ({selectedPages.size})
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[11.5px] text-primary hover:underline"
                    onClick={() => setSelectedPages(new Set(delegatable.map((p) => p.key)))}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    className="text-[11.5px] text-[hsl(0_0%_55%)] hover:underline"
                    onClick={() => setSelectedPages(new Set())}
                  >
                    Keine
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5 rounded-[14px] border border-[hsl(0_0%_14%)] bg-white/[0.02] p-3 sm:grid-cols-2">
                {delegatable.map((page) => (
                  <label
                    key={page.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
                  >
                    <Checkbox
                      checked={selectedPages.has(page.key)}
                      onCheckedChange={() => togglePage(page.key)}
                    />
                    <span className="text-[13px] text-foreground">{page.label}</span>
                  </label>
                ))}
              </div>
              <span className={HINT}>
                Nicht aufgeführt und damit nie vergebbar: Nutzer, Rollen &amp; Rechte,
                Einstellungen, Integrationen, Features.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="hero"
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Speichert …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nutzer zuweisen */}
      <Dialog open={!!assignRole} onOpenChange={(open) => !open && setAssignRole(null)}>
        <DialogContent className="rounded-2xl border-[hsl(0_0%_14%)] bg-[hsl(0_0%_6%)] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold tracking-tight">
              Nutzer zu „{assignRole?.name}" hinzufügen
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Name oder E-Mail suchen (min. 2 Zeichen)"
              className={FIELD}
            />

            {searching && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {(searchResults ?? []).map((u) => {
                const already = assignRole?.members.some((m) => m.user_id === u.user_id);
                return (
                  <div
                    key={u.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(0_0%_14%)] bg-white/[0.02] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] text-foreground">
                        {u.display_name || u.email}
                      </p>
                      <p className="truncate font-mono text-[11.5px] text-[hsl(0_0%_55%)]">
                        {u.email}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={already ? "ghost" : "outline"}
                      disabled={already || assignMutation.isPending}
                      onClick={() =>
                        assignRole &&
                        assignMutation.mutate({ userId: u.user_id, roleId: assignRole.id })
                      }
                    >
                      {already ? "bereits zugewiesen" : "Zuweisen"}
                    </Button>
                  </div>
                );
              })}
              {userSearch.trim().length >= 2 && !searching && (searchResults ?? []).length === 0 && (
                <p className={HINT}>Keine Treffer.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-[hsl(0_0%_14%)] bg-[hsl(0_0%_6%)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle „{pendingDelete?.name}" löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.members.length
                ? `${pendingDelete.members.length} Nutzer verlieren damit den Zugriff auf die zugewiesenen Seiten.`
                : "Die Rolle ist niemandem zugewiesen."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="bg-[#FF6B6B] text-[#0A0A0A] hover:bg-[#ff8585]"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
