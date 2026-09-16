import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  Plus, 
  Gamepad2, 
  Trophy, 
  User, 
  Users,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Activity,
  Timer,
  Flame,
  Shield,
  UserX
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface PlayerSlot {
  type: "user" | "guest";
  userId: string;
  guestName: string;
  score: number;
  skillLevel: number;
  enabled: boolean;
  aiData: {
    distance_m: number;
    net_zone_pct: number;
    baseline_pct: number;
    avg_rally_length: number;
    winners: number;
    unforced_errors: number;
    smash_attempts: number;
    smash_success_pct: number;
    lob_success_pct: number;
    volley_pct: number;
  };
}

interface MatchFormState {
  matchId: string;
  teamAWins: boolean;
  players: {
    teamA: [PlayerSlot, PlayerSlot];
    teamB: [PlayerSlot, PlayerSlot];
  };
}

const defaultPlayerSlot = (): PlayerSlot => ({
  type: "user",
  userId: "",
  guestName: "",
  score: 75,
  skillLevel: 5,
  enabled: true,
  aiData: {
    distance_m: 1800,
    net_zone_pct: 30,
    baseline_pct: 70,
    avg_rally_length: 6,
    winners: 8,
    unforced_errors: 5,
    smash_attempts: 4,
    smash_success_pct: 75,
    lob_success_pct: 60,
    volley_pct: 25,
  },
});

const generateMatchId = () => `match-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

export function P2GMatchesSection() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePlayerTab, setActivePlayerTab] = useState("0");
  const [showAiData, setShowAiData] = useState<Record<string, boolean>>({});
  
  const [formState, setFormState] = useState<MatchFormState>({
    matchId: generateMatchId(),
    teamAWins: true,
    players: {
      teamA: [defaultPlayerSlot(), defaultPlayerSlot()],
      teamB: [defaultPlayerSlot(), defaultPlayerSlot()],
    },
  });

  // Fetch users for dropdown
  const { data: users } = useQuery({
    queryKey: ["admin-users-wallets"],
    queryFn: async () => {
      const { data: wallets, error } = await supabase
        .from("wallets")
        .select("user_id, play_credits, reward_credits, lifetime_credits")
        .order("lifetime_credits", { ascending: false });

      if (error) throw error;
      
      const userIds = wallets?.map(w => w.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", userIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]));
      
      return wallets?.map(w => ({
        ...w,
        profiles: profilesMap.get(w.user_id) || null,
      }));
    },
  });

  // Fetch existing matches
  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => {
      const { data: analyses, error } = await supabase
        .from("match_analyses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      
      const userIds = [...new Set(analyses?.map(a => a.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", userIds.length > 0 ? userIds : ["none"]);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]));
      
      return analyses?.map(a => ({
        ...a,
        profiles: profilesMap.get(a.user_id) || null,
      }));
    },
  });

  // Create multi-player match mutation
  const createMatchMutation = useMutation({
    mutationFn: async (data: MatchFormState) => {
      const response = await supabase.functions.invoke("admin-credits", {
        body: {
          action: "create_multi_player_match",
          matchId: data.matchId,
          teamAWins: data.teamAWins,
          players: [
            { ...data.players.teamA[0], position: "teamA_player1", team: "A" },
            { ...data.players.teamA[1], position: "teamA_partner", team: "A" },
            { ...data.players.teamB[0], position: "teamB_opponent1", team: "B" },
            { ...data.players.teamB[1], position: "teamB_opponent2", team: "B" },
          ],
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.created} Match-Analysen erfolgreich erstellt!`);
      queryClient.invalidateQueries({ queryKey: ["admin-matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users-wallets"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      console.error("Match creation error:", error);
      toast.error("Fehler beim Erstellen der Matches");
    },
  });

  const resetForm = () => {
    setFormState({
      matchId: generateMatchId(),
      teamAWins: true,
      players: {
        teamA: [defaultPlayerSlot(), defaultPlayerSlot()],
        teamB: [defaultPlayerSlot(), defaultPlayerSlot()],
      },
    });
    setActivePlayerTab("0");
    setShowAiData({});
  };

  const updatePlayer = (
    team: "teamA" | "teamB",
    index: 0 | 1,
    updates: Partial<PlayerSlot>
  ) => {
    setFormState((prev) => {
      const newPlayers = { ...prev.players };
      newPlayers[team] = [...newPlayers[team]] as [PlayerSlot, PlayerSlot];
      newPlayers[team][index] = { ...newPlayers[team][index], ...updates };
      return { ...prev, players: newPlayers };
    });
  };

  const updatePlayerAiData = (
    team: "teamA" | "teamB",
    index: 0 | 1,
    key: keyof PlayerSlot["aiData"],
    value: number
  ) => {
    setFormState((prev) => {
      const newPlayers = { ...prev.players };
      newPlayers[team] = [...newPlayers[team]] as [PlayerSlot, PlayerSlot];
      newPlayers[team][index] = {
        ...newPlayers[team][index],
        aiData: { ...newPlayers[team][index].aiData, [key]: value },
      };
      return { ...prev, players: newPlayers };
    });
  };

  const getPlayerLabel = (team: "teamA" | "teamB", index: 0 | 1): string => {
    if (team === "teamA") return index === 0 ? "Spieler 1" : "Partner";
    return index === 0 ? "Gegner 1" : "Gegner 2";
  };

  const getPlayerDisplayName = (player: PlayerSlot): string => {
    if (player.type === "guest") return player.guestName || "Gast";
    if (!player.userId) return "Nicht ausgewählt";
    const user = users?.find((u) => u.user_id === player.userId);
    return user?.profiles?.display_name || user?.profiles?.username || "Unbekannt";
  };

  const getRegisteredPlayersCount = (): number => {
    const allPlayers = [
      ...formState.players.teamA,
      ...formState.players.teamB,
    ];
    return allPlayers.filter((p) => p.enabled && p.type === "user" && p.userId).length;
  };

  const calculateEstimatedCredits = (player: PlayerSlot, isWinner: boolean): number => {
    if (player.type === "guest" || !player.userId) return 0;
    const baseCredits = player.score * 5;
    const skillMultiplier = 1 + (player.skillLevel - 5) * 0.1;
    const resultMultiplier = isWinner ? 1.2 : 0.8;
    return Math.round(baseCredits * skillMultiplier * resultMultiplier);
  };

  const filteredMatches = matches?.filter((m) => {
    if (!searchQuery) return true;
    const name = m.profiles?.display_name || m.profiles?.username || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const allPlayers = [
    { team: "teamA" as const, index: 0 as const, player: formState.players.teamA[0] },
    { team: "teamA" as const, index: 1 as const, player: formState.players.teamA[1] },
    { team: "teamB" as const, index: 0 as const, player: formState.players.teamB[0] },
    { team: "teamB" as const, index: 1 as const, player: formState.players.teamB[1] },
  ];

  const getUsedUserIds = (): string[] => {
    return allPlayers
      .filter((p) => p.player.type === "user" && p.player.userId)
      .map((p) => p.player.userId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" />
            Match-Analysen
          </h2>
          <p className="text-sm text-muted-foreground">
            Matches erstellen und KI-Analysen für alle Spieler verwalten
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Match erstellen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden grid grid-rows-[auto,1fr,auto]">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5" />
                Padel-Match erstellen (4 Spieler)
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto pr-4">
              <div className="space-y-6 pb-4">
                {/* Match ID */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium">Match-ID:</Label>
                  <code className="text-sm bg-background px-2 py-1 rounded">
                    {formState.matchId}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormState((prev) => ({ ...prev, matchId: generateMatchId() }))}
                  >
                    Neu generieren
                  </Button>
                </div>

                {/* Ergebnis */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      Ergebnis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-4">
                      <Label>Team A gewinnt:</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={formState.teamAWins ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFormState((prev) => ({ ...prev, teamAWins: true }))}
                        >
                          <Trophy className="w-4 h-4 mr-1" />
                          Sieg
                        </Button>
                        <Button
                          variant={!formState.teamAWins ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFormState((prev) => ({ ...prev, teamAWins: false }))}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Niederlage
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Teams Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Team A */}
                  <Card className={formState.teamAWins ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Team A
                        </span>
                        <Badge variant={formState.teamAWins ? "default" : "secondary"}>
                          {formState.teamAWins ? "Sieg" : "Niederlage"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {formState.players.teamA.map((player, idx) => (
                        <PlayerSlotCard
                          key={`teamA-${idx}`}
                          player={player}
                          label={getPlayerLabel("teamA", idx as 0 | 1)}
                          users={users}
                          usedUserIds={getUsedUserIds()}
                          onUpdate={(updates) => updatePlayer("teamA", idx as 0 | 1, updates)}
                        />
                      ))}
                    </CardContent>
                  </Card>

                  {/* Team B */}
                  <Card className={!formState.teamAWins ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Team B
                        </span>
                        <Badge variant={!formState.teamAWins ? "default" : "secondary"}>
                          {!formState.teamAWins ? "Sieg" : "Niederlage"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {formState.players.teamB.map((player, idx) => (
                        <PlayerSlotCard
                          key={`teamB-${idx}`}
                          player={player}
                          label={getPlayerLabel("teamB", idx as 0 | 1)}
                          users={users}
                          usedUserIds={getUsedUserIds()}
                          onUpdate={(updates) => updatePlayer("teamB", idx as 0 | 1, updates)}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Player Details Tabs */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Spieler-Details & KI-Analysen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={activePlayerTab} onValueChange={setActivePlayerTab}>
                      <TabsList className="grid grid-cols-4 mb-4">
                        {allPlayers.map(({ team, index, player }, tabIdx) => (
                          <TabsTrigger
                            key={tabIdx}
                            value={String(tabIdx)}
                            className="text-xs"
                            disabled={!player.enabled}
                          >
                            <div className="flex items-center gap-1">
                              {player.type === "guest" ? (
                                <UserX className="w-3 h-3" />
                              ) : (
                                <User className="w-3 h-3" />
                              )}
                              <span className="truncate max-w-[60px]">
                                {getPlayerLabel(team, index)}
                              </span>
                            </div>
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {allPlayers.map(({ team, index, player }, tabIdx) => {
                        const isWinner = team === "teamA" ? formState.teamAWins : !formState.teamAWins;
                        const showAi = showAiData[`${team}-${index}`] || false;

                        return (
                          <TabsContent key={tabIdx} value={String(tabIdx)} className="space-y-4">
                            {!player.enabled ? (
                              <div className="text-center py-8 text-muted-foreground">
                                Dieser Spieler-Slot ist deaktiviert
                              </div>
                            ) : player.type === "guest" ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <UserX className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>Gast-Spieler: {player.guestName || "Ohne Namen"}</p>
                                <p className="text-sm">Keine Credits oder KI-Analyse für Gäste</p>
                              </div>
                            ) : !player.userId ? (
                              <div className="text-center py-8 text-muted-foreground">
                                Bitte wähle einen Benutzer aus
                              </div>
                            ) : (
                              <>
                                {/* Player Header */}
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <Avatar>
                                      <AvatarImage
                                        src={users?.find((u) => u.user_id === player.userId)?.profiles?.avatar_url || ""}
                                      />
                                      <AvatarFallback>
                                        {getPlayerDisplayName(player).charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-medium">{getPlayerDisplayName(player)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {getPlayerLabel(team, index)} • {isWinner ? "Sieg" : "Niederlage"}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge variant={isWinner ? "default" : "secondary"}>
                                    ~{calculateEstimatedCredits(player, isWinner)} Credits
                                  </Badge>
                                </div>

                                {/* Score & Skill Level */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm flex items-center justify-between">
                                      <span>Score (1-100)</span>
                                      <span className="font-bold">{player.score}</span>
                                    </Label>
                                    <Slider
                                      value={[player.score]}
                                      min={1}
                                      max={100}
                                      step={1}
                                      onValueChange={([v]) => updatePlayer(team, index, { score: v })}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm flex items-center justify-between">
                                      <span>Skill-Level</span>
                                      <span className="font-bold">{player.skillLevel.toFixed(1)}</span>
                                    </Label>
                                    <Slider
                                      value={[player.skillLevel]}
                                      min={1}
                                      max={10}
                                      step={0.1}
                                      onValueChange={([v]) => updatePlayer(team, index, { skillLevel: v })}
                                    />
                                  </div>
                                </div>

                                {/* AI Data Toggle */}
                                <Button
                                  variant="ghost"
                                  className="w-full justify-between"
                                  onClick={() =>
                                    setShowAiData((prev) => ({
                                      ...prev,
                                      [`${team}-${index}`]: !prev[`${team}-${index}`],
                                    }))
                                  }
                                >
                                  <span className="flex items-center gap-2">
                                    <Zap className="w-4 h-4" />
                                    KI-Analyse-Daten
                                  </span>
                                  {showAi ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </Button>

                                {showAi && (
                                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                                    <AIDataField
                                      icon={<Activity className="w-4 h-4" />}
                                      label="Laufstrecke (m)"
                                      value={player.aiData.distance_m}
                                      onChange={(v) => updatePlayerAiData(team, index, "distance_m", v)}
                                      min={500}
                                      max={4000}
                                    />
                                    <AIDataField
                                      icon={<Target className="w-4 h-4" />}
                                      label="Netz-Zone (%)"
                                      value={player.aiData.net_zone_pct}
                                      onChange={(v) => updatePlayerAiData(team, index, "net_zone_pct", v)}
                                      min={0}
                                      max={100}
                                    />
                                    <AIDataField
                                      icon={<Shield className="w-4 h-4" />}
                                      label="Baseline (%)"
                                      value={player.aiData.baseline_pct}
                                      onChange={(v) => updatePlayerAiData(team, index, "baseline_pct", v)}
                                      min={0}
                                      max={100}
                                    />
                                    <AIDataField
                                      icon={<Timer className="w-4 h-4" />}
                                      label="Ø Rally-Länge"
                                      value={player.aiData.avg_rally_length}
                                      onChange={(v) => updatePlayerAiData(team, index, "avg_rally_length", v)}
                                      min={1}
                                      max={30}
                                    />
                                    <AIDataField
                                      icon={<Flame className="w-4 h-4" />}
                                      label="Winners"
                                      value={player.aiData.winners}
                                      onChange={(v) => updatePlayerAiData(team, index, "winners", v)}
                                      min={0}
                                      max={50}
                                    />
                                    <AIDataField
                                      icon={<Target className="w-4 h-4" />}
                                      label="Unforced Errors"
                                      value={player.aiData.unforced_errors}
                                      onChange={(v) => updatePlayerAiData(team, index, "unforced_errors", v)}
                                      min={0}
                                      max={50}
                                    />
                                    <AIDataField
                                      icon={<Zap className="w-4 h-4" />}
                                      label="Smash-Versuche"
                                      value={player.aiData.smash_attempts}
                                      onChange={(v) => updatePlayerAiData(team, index, "smash_attempts", v)}
                                      min={0}
                                      max={30}
                                    />
                                    <AIDataField
                                      icon={<Trophy className="w-4 h-4" />}
                                      label="Smash-Erfolg (%)"
                                      value={player.aiData.smash_success_pct}
                                      onChange={(v) => updatePlayerAiData(team, index, "smash_success_pct", v)}
                                      min={0}
                                      max={100}
                                    />
                                    <AIDataField
                                      icon={<Activity className="w-4 h-4" />}
                                      label="Lob-Erfolg (%)"
                                      value={player.aiData.lob_success_pct}
                                      onChange={(v) => updatePlayerAiData(team, index, "lob_success_pct", v)}
                                      min={0}
                                      max={100}
                                    />
                                    <AIDataField
                                      icon={<Target className="w-4 h-4" />}
                                      label="Volley (%)"
                                      value={player.aiData.volley_pct}
                                      onChange={(v) => updatePlayerAiData(team, index, "volley_pct", v)}
                                      min={0}
                                      max={100}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Credits Preview */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Credit-Vorschau
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {allPlayers.map(({ team, index, player }, idx) => {
                        const isWinner = team === "teamA" ? formState.teamAWins : !formState.teamAWins;
                        const credits = calculateEstimatedCredits(player, isWinner);
                        
                        if (!player.enabled) return null;
                        
                        return (
                          <div key={idx} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-2">
                              {player.type === "guest" ? (
                                <UserX className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <User className="w-4 h-4" />
                              )}
                              <span className={player.type === "guest" ? "text-muted-foreground" : ""}>
                                {getPlayerDisplayName(player)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {getPlayerLabel(team, index)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={isWinner ? "default" : "secondary"}>
                                {isWinner ? "Sieg" : "Niederlage"}
                              </Badge>
                              {player.type === "guest" ? (
                                <span className="text-muted-foreground text-sm">Keine Credits</span>
                              ) : player.userId ? (
                                <span className="font-bold text-primary">~{credits} Credits</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">Nicht ausgewählt</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Separator className="my-3" />
                    <div className="flex items-center justify-between font-medium">
                      <span>Registrierte Spieler:</span>
                      <span>{getRegisteredPlayersCount()} von 4</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => createMatchMutation.mutate(formState)}
                disabled={createMatchMutation.isPending || getRegisteredPlayersCount() === 0}
              >
                {createMatchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {getRegisteredPlayersCount()} Match{getRegisteredPlayersCount() !== 1 ? "es" : ""} erstellen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Matches durchsuchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Matches List */}
      <Card>
        <CardContent className="p-0">
          {matchesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredMatches?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Matches gefunden
            </div>
          ) : (
            <div className="divide-y">
              {filteredMatches.map((match) => (
                <div key={match.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={match.profiles?.avatar_url || ""} />
                      <AvatarFallback>
                        {(match.profiles?.display_name || match.profiles?.username || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {match.profiles?.display_name || match.profiles?.username || "Unbekannt"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(match.created_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium">{match.credits_awarded} Credits</p>
                      <p className="text-sm text-muted-foreground">
                        Score: {match.ai_score || match.manual_score || "-"}
                      </p>
                    </div>
                    <Badge variant={match.result === "W" ? "default" : "secondary"}>
                      {match.result === "W" ? "Sieg" : match.result === "L" ? "Niederlage" : "-"}
                    </Badge>
                    <Badge variant="outline">{match.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Player Slot Card Component
function PlayerSlotCard({
  player,
  label,
  users,
  usedUserIds,
  onUpdate,
}: {
  player: PlayerSlot;
  label: string;
  users: Array<{
    user_id: string;
    profiles: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
  }> | undefined;
  usedUserIds: string[];
  onUpdate: (updates: Partial<PlayerSlot>) => void;
}) {
  return (
    <div className="p-3 border rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Aktiv</Label>
          <Switch
            checked={player.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
          />
        </div>
      </div>

      {player.enabled && (
        <>
          {/* Type Toggle */}
          <div className="flex gap-2">
            <Button
              variant={player.type === "user" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => onUpdate({ type: "user", guestName: "" })}
            >
              <User className="w-3 h-3 mr-1" />
              Registriert
            </Button>
            <Button
              variant={player.type === "guest" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => onUpdate({ type: "guest", userId: "" })}
            >
              <UserX className="w-3 h-3 mr-1" />
              Gast
            </Button>
          </div>

          {/* User Dropdown or Guest Name */}
          {player.type === "user" ? (
            <Select
              value={player.userId || "none"}
              onValueChange={(v) => onUpdate({ userId: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Benutzer auswählen..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nicht ausgewählt</SelectItem>
                {users
                  ?.filter((u) => !usedUserIds.includes(u.user_id) || u.user_id === player.userId)
                  .map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={user.profiles?.avatar_url || ""} />
                          <AvatarFallback className="text-xs">
                            {(user.profiles?.display_name || user.profiles?.username || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {user.profiles?.display_name || user.profiles?.username || "Unbekannt"}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Gastname eingeben..."
              value={player.guestName}
              onChange={(e) => onUpdate({ guestName: e.target.value })}
            />
          )}
        </>
      )}
    </div>
  );
}

// AI Data Field Component
function AIDataField({
  icon,
  label,
  value,
  onChange,
  min,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        {icon}
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={1}
          onValueChange={([v]) => onChange(v)}
          className="flex-1"
        />
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 h-7 text-xs"
          min={min}
          max={max}
        />
      </div>
    </div>
  );
}
