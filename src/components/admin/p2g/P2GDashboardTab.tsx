import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Gift,
  Wallet,
  TrendingUp,
  Package,
  Trophy,
  Loader2,
  Wrench,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { P2GMatchesSection } from "./P2GMatchesSection";
import { supabase } from "@/integrations/supabase/client";

interface CreditStats {
  totalRewardCredits: number;
  totalPlayCredits: number;
  totalLifetimeCredits: number;
  pendingRewards: number;
  claimableRewards: number;
  recentRedemptions: number;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  reward_credits: number;
  play_credits: number;
  lifetime_credits: number;
}

export function P2GDashboardTab() {
  const queryClient = useQueryClient();
  const [showSkillResetDialog, setShowSkillResetDialog] = useState(false);
  const [showRewardResetDialog, setShowRewardResetDialog] = useState(false);
  const [showGlobalResetDialog, setShowGlobalResetDialog] = useState(false);

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-credit-stats"],
    queryFn: async (): Promise<CreditStats> => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "stats" },
      });
      if (error) throw error;
      return data;
    },
  });

  // Fetch leaderboard (top 10 by lifetime credits)
  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["admin-leaderboard"],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "list_wallets" },
      });
      if (error) throw error;
      
      // Sort by lifetime_credits and take top 10
      const wallets = data.wallets || [];
      return wallets
        .sort((a: any, b: any) => (b.lifetime_credits || 0) - (a.lifetime_credits || 0))
        .slice(0, 10)
        .map((w: any) => ({
          user_id: w.user_id,
          display_name: w.profile?.display_name,
          username: w.profile?.username,
          avatar_url: w.profile?.avatar_url,
          reward_credits: w.reward_credits || 0,
          play_credits: w.play_credits || 0,
          lifetime_credits: w.lifetime_credits || 0,
        }));
    },
  });

  // Repair mutation
  const repairMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "repair_pending_rewards" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Reparatur abgeschlossen");
      queryClient.invalidateQueries({ queryKey: ["admin-credit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-leaderboard"] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Reset all skill credits mutation (yearly)
  const resetSkillMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "reset_all_skill_credits" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Skill-Credits Reset abgeschlossen");
      setShowSkillResetDialog(false);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-leaderboard"] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Reset all reward credits mutation
  const resetRewardMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "reset_all_reward_credits" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Reward-Credits Reset abgeschlossen");
      setShowRewardResetDialog(false);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-leaderboard"] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // GLOBAL reset all credits mutation (all types)
  const resetGlobalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-credits", {
        body: { action: "reset_all_credits" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Globaler Reset abgeschlossen");
      setShowGlobalResetDialog(false);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-leaderboard"] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const statCards = [
    {
      label: "Reward Credits",
      value: stats?.totalRewardCredits?.toLocaleString() || "0",
      icon: Gift,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Play Credits",
      value: stats?.totalPlayCredits?.toLocaleString() || "0",
      icon: Wallet,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Lifetime Credits",
      value: stats?.totalLifetimeCredits?.toLocaleString() || "0",
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Claimable Rewards",
      value: stats?.claimableRewards?.toString() || "0",
      icon: Gift,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Einlösungen (7 Tage)",
      value: stats?.recentRedemptions?.toString() || "0",
      icon: Package,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {statsLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      stat.value
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Skill Reset Dialog */}
      <AlertDialog open={showSkillResetDialog} onOpenChange={setShowSkillResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Skill-Credits Reset (Jährlich)
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dies setzt folgende Werte für <strong>alle Benutzer</strong> auf 0 zurück:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Play Credits</li>
                <li>Lifetime Credits</li>
                <li>Skill Level</li>
              </ul>
              <p className="mt-3 text-yellow-600 font-medium">
                Diese Aktion kann nicht rückgängig gemacht werden!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetSkillMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetSkillMutation.isPending}
            >
              {resetSkillMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Skill-Credits zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reward Reset Dialog */}
      <AlertDialog open={showRewardResetDialog} onOpenChange={setShowRewardResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Reward-Credits Reset
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dies setzt die <strong>Reward Credits</strong> für alle Benutzer auf 0 zurück.
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Reward Credits → 0</li>
                <li>Lifetime Credits bleiben erhalten</li>
                <li>Play Credits bleiben erhalten</li>
              </ul>
              <p className="mt-3 text-orange-600 font-medium">
                Diese Aktion kann nicht rückgängig gemacht werden!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetRewardMutation.mutate()}
              className="bg-orange-600 text-white hover:bg-orange-700"
              disabled={resetRewardMutation.isPending}
            >
              {resetRewardMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Reward-Credits zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GLOBAL Reset Dialog */}
      <AlertDialog open={showGlobalResetDialog} onOpenChange={setShowGlobalResetDialog}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              ⚠️ GLOBALER RESET - ALLE CREDITS
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-destructive">
                ACHTUNG: Dies setzt ALLE Credits für ALLE Benutzer auf 0 zurück!
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Reward Credits</strong> → 0</li>
                <li><strong>Play Credits</strong> → 0</li>
                <li><strong>Lifetime Credits</strong> → 0</li>
                <li><strong>Skill Level</strong> → 0</li>
                <li><strong>Last Game Data</strong> → gelöscht</li>
              </ul>
              <p className="text-destructive font-bold mt-4">
                ⚠️ Diese Aktion kann NICHT rückgängig gemacht werden!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetGlobalMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetGlobalMutation.isPending}
            >
              {resetGlobalMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              ALLE Credits zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Repair Action */}
      {(stats?.pendingRewards || 0) > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Wrench className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="font-medium">
                    {stats?.pendingRewards} ausstehende Buchungsrewards
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Diese können automatisch gutgeschrieben werden
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                onClick={() => repairMutation.mutate()}
                disabled={repairMutation.isPending}
              >
                {repairMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wrench className="w-4 h-4 mr-2" />
                )}
                Reparieren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset Actions Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Skill Credits Reset */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/20">
                  <RotateCcw className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">Skill-Credits Reset</p>
                  <p className="text-sm text-muted-foreground">
                    Play + Lifetime + Skill-Level (jährlich)
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 w-full"
                onClick={() => setShowSkillResetDialog(true)}
                disabled={resetSkillMutation.isPending}
              >
                {resetSkillMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset starten
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reward Credits Reset */}
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20">
                  <Gift className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Reward-Credits Reset</p>
                  <p className="text-sm text-muted-foreground">
                    Nur Reward-Credits auf 0
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10 w-full"
                onClick={() => setShowRewardResetDialog(true)}
                disabled={resetRewardMutation.isPending}
              >
                {resetRewardMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset starten
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* GLOBAL Reset - All Credits */}
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/30">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-destructive">Globaler Reset</p>
                  <p className="text-sm text-muted-foreground">
                    ALLE Credits auf 0 (Notfall)
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowGlobalResetDialog(true)}
                disabled={resetGlobalMutation.isPending}
              >
                {resetGlobalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                ⚠️ ALLES zurücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Match Analyses Section */}
      <P2GMatchesSection />

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Top 10 Benutzer (Lifetime Credits)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Keine Benutzer mit Credits gefunden
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Benutzer</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                  <TableHead className="text-right">Play</TableHead>
                  <TableHead className="text-right">Lifetime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry, index) => (
                  <TableRow key={entry.user_id}>
                    <TableCell>
                      {index < 3 ? (
                        <Badge
                          variant="outline"
                          className={
                            index === 0
                              ? "bg-yellow-500/20 text-yellow-600 border-yellow-500/30"
                              : index === 1
                              ? "bg-gray-300/20 text-gray-600 border-gray-300/30"
                              : "bg-amber-700/20 text-amber-700 border-amber-700/30"
                          }
                        >
                          {index + 1}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{index + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={entry.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary text-xs">
                            {entry.display_name?.slice(0, 2).toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {entry.display_name || "Unbekannt"}
                          </p>
                          {entry.username && (
                            <p className="text-xs text-muted-foreground">
                              @{entry.username}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.reward_credits.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.play_credits.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {entry.lifetime_credits.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
