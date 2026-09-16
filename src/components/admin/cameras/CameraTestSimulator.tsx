import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Loader2, CheckCircle, AlertCircle, AlertTriangle, Zap } from "lucide-react";

interface Court {
  id: string;
  name: string;
  location_id: string;
  locations?: { name: string };
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  username: string | null;
}

interface CameraApiKey {
  id: string;
  name: string;
  location_id: string;
  locations?: { name: string };
}

// Generate random AI score between min and max
function randomScore(min = 40, max = 95): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate mock match analysis data
function generateMockAnalysis(userId: string, team: number, aiScore: number) {
  return {
    user_id: userId,
    team,
    ai_score: aiScore,
    match_overview: {
      total_rallies: Math.floor(Math.random() * 100) + 80,
      total_shots: Math.floor(Math.random() * 800) + 600,
      time_in_play_seconds: Math.floor(Math.random() * 1800) + 1200,
      avg_shots_per_rally: Math.round((Math.random() * 5 + 6) * 10) / 10,
      longest_rally_shots: Math.floor(Math.random() * 20) + 10,
    },
    serve_performance: {
      accuracy_in_percent: Math.floor(Math.random() * 30) + 55,
      distribution: { wide: 35, body: 40, t: 25 },
      speed_avg_kmh: Math.floor(Math.random() * 20) + 75,
      speed_max_kmh: Math.floor(Math.random() * 30) + 100,
    },
    stroke_performance: {
      accuracy_in_percent: Math.floor(Math.random() * 25) + 55,
      distribution: {
        forehand: Math.floor(Math.random() * 15) + 35,
        backhand: Math.floor(Math.random() * 15) + 25,
        volley: Math.floor(Math.random() * 10) + 15,
        lob: Math.floor(Math.random() * 10) + 5
      },
      uncovered_areas_percent: Math.floor(Math.random() * 15) + 5,
    },
    movement: {
      total_distance_meters: Math.floor(Math.random() * 1500) + 1500,
      zone_time: {
        net: Math.floor(Math.random() * 20) + 25,
        mid: Math.floor(Math.random() * 20) + 35,
        baseline: Math.floor(Math.random() * 15) + 15
      },
      coverage_vertical_percent: Math.floor(Math.random() * 20) + 70,
      coverage_horizontal_percent: Math.floor(Math.random() * 20) + 70,
    },
  };
}

const FIELD_LABEL_CLASSES =
  "font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground";

const INPUT_CLASSES =
  "h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]";

export function CameraTestSimulator() {
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");
  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(["", "", "", ""]);
  const [testApiKey, setTestApiKey] = useState("");
  const [team1Score, setTeam1Score] = useState(6);
  const [team2Score, setTeam2Score] = useState(4);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationStep, setSimulationStep] = useState<string>("");

  // Fetch API keys with location info
  const { data: apiKeys } = useQuery({
    queryKey: ["admin-camera-api-keys-for-test"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("camera_api_keys")
        .select("id, name, location_id, locations(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as CameraApiKey[];
    },
  });

  // Get selected API key's location_id
  const selectedApiKeyRecord = apiKeys?.find(k => k.id === selectedApiKeyId);
  const selectedLocationId = selectedApiKeyRecord?.location_id;

  // Fetch courts filtered by selected API key's location
  const { data: courts } = useQuery({
    queryKey: ["admin-courts-for-test", selectedLocationId],
    queryFn: async () => {
      let query = supabase
        .from("courts")
        .select("id, name, location_id, locations(name)")
        .eq("is_active", true)
        .order("name");

      if (selectedLocationId) {
        query = query.eq("location_id", selectedLocationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Court[];
    },
    enabled: !!selectedLocationId,
  });

  // Reset court selection when API key changes
  useEffect(() => {
    setSelectedCourtId("");
  }, [selectedApiKeyId]);

  // Fetch users with profiles
  const { data: users } = useQuery({
    queryKey: ["admin-users-for-test"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .not("username", "is", null)
        .order("username")
        .limit(100);
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  // Run simulation mutation
  const simulateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourtId || !testApiKey) {
        throw new Error("Bitte wähle einen API Key und Court aus");
      }

      const validPlayers = selectedPlayers.filter(p => p);
      if (validPlayers.length < 2) {
        throw new Error("Mindestens 2 Spieler erforderlich");
      }

      // Check for duplicate players
      const uniquePlayers = new Set(validPlayers);
      if (uniquePlayers.size !== validPlayers.length) {
        throw new Error("Jeder Spieler kann nur einmal ausgewählt werden");
      }

      setSimulationStep("Session wird erstellt...");
      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Step 1: Start session
      const { data: startResult, error: startErr } = await supabase.functions.invoke(
        "camera-webhook/start-session",
        {
          headers: { "X-Camera-API-Key": testApiKey },
          body: {
            session_id: sessionId,
            court_id: selectedCourtId,
            players: validPlayers.map((userId, index) => ({
              user_id: userId,
              team: index < 2 ? 1 : 2,
              position: index % 2 === 0 ? "LEFT" : "RIGHT",
            })),
          },
        },
      );

      if (startErr) {
        throw new Error(`Session Start: ${startErr.message || "Unbekannter Fehler"}`);
      }

      setSimulationStep("Match wird verarbeitet...");

      // Step 2: Complete match with mock data
      const playerAnalyses = validPlayers.map((userId, index) =>
        generateMockAnalysis(userId, index < 2 ? 1 : 2, randomScore())
      );

      const { data: completeResult, error: completeErr } = await supabase.functions.invoke(
        "camera-webhook/match-complete",
        {
          headers: { "X-Camera-API-Key": testApiKey },
          body: {
            session_id: sessionId,
            match_duration_seconds: Math.floor(Math.random() * 1800) + 2400,
            final_score: { team1: team1Score, team2: team2Score },
            player_analyses: playerAnalyses,
          },
        },
      );

      if (completeErr) {
        throw new Error(`Match Complete: ${completeErr.message || "Unbekannter Fehler"}`);
      }
      setSimulationStep("");

      return {
        session: startResult,
        completion: completeResult,
      };
    },
    onSuccess: (result) => {
      setSimulationResult(result);
      toast.success(`Test erfolgreich! ${result.completion.players_processed} Spieler verarbeitet`);
    },
    onError: (error) => {
      setSimulationStep("");
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const handlePlayerChange = (index: number, value: string) => {
    const newPlayers = [...selectedPlayers];
    newPlayers[index] = value;
    setSelectedPlayers(newPlayers);
  };

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h3 className="font-display text-base font-bold tracking-tight text-foreground">
              Match-Simulation (Test-Modus)
            </h3>
            <p className="text-xs text-muted-foreground">
              Simuliere Kamera-Daten um die Integration zu testen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[11px] rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
          <AlertTriangle className="h-4 w-4 flex-none text-[#FFC44D]" />
          <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
            Credits werden real vergeben!
          </span>
        </div>

        {/* API Key Selection */}
        <div className="flex flex-col gap-[7px]">
          <Label className={FIELD_LABEL_CLASSES}>API Key auswählen</Label>
          <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
            <SelectTrigger className={INPUT_CLASSES}>
              <SelectValue placeholder="API Key wählen" />
            </SelectTrigger>
            <SelectContent>
              {apiKeys?.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.name} ({key.locations?.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedApiKeyId && (
            <div className="flex flex-col gap-[7px] pt-1.5">
              <Label className={FIELD_LABEL_CLASSES}>API Key Wert eingeben</Label>
              <Input
                type="password"
                placeholder="p2g_cam_xxxx-xxxx-xxxx-xxxx"
                value={testApiKey}
                onChange={(e) => setTestApiKey(e.target.value)}
                className={`${INPUT_CLASSES} font-mono`}
              />
              <p className="text-[11.5px] text-muted-foreground">
                Du musst den Key-Wert von oben kopieren (wird nur einmal angezeigt)
              </p>
            </div>
          )}
        </div>

        {/* Court Selection */}
        <div className="flex flex-col gap-[7px]">
          <Label className={FIELD_LABEL_CLASSES}>Court auswählen</Label>
          <Select
            value={selectedCourtId}
            onValueChange={setSelectedCourtId}
            disabled={!selectedApiKeyId}
          >
            <SelectTrigger className={INPUT_CLASSES}>
              <SelectValue placeholder={selectedApiKeyId ? "Court wählen" : "Erst API Key wählen"} />
            </SelectTrigger>
            <SelectContent>
              {courts?.map((court) => (
                <SelectItem key={court.id} value={court.id}>
                  {court.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedApiKeyId && courts?.length === 0 && (
            <p className="flex items-center gap-1 text-xs text-[#FF6B6B]">
              <AlertCircle className="h-3 w-3" />
              Keine aktiven Courts für diese Location
            </p>
          )}
        </div>

        {/* Player Selection */}
        <div className="flex flex-col gap-2.5">
          <Label className={FIELD_LABEL_CLASSES}>Spieler zuweisen</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="flex flex-col gap-2 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.028] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Team 1
              </p>
              {[0, 1].map((index) => (
                <Select
                  key={index}
                  value={selectedPlayers[index]}
                  onValueChange={(v) => handlePlayerChange(index, v)}
                >
                  <SelectTrigger className="h-9 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                    <SelectValue placeholder={`Spieler ${index + 1}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.display_name || user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-[13px] border border-[hsl(0_0%_12%)] bg-white/[0.028] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Team 2
              </p>
              {[2, 3].map((index) => (
                <Select
                  key={index}
                  value={selectedPlayers[index]}
                  onValueChange={(v) => handlePlayerChange(index, v)}
                >
                  <SelectTrigger className="h-9 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13px]">
                    <SelectValue placeholder={`Spieler ${index + 1}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.display_name || user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
          </div>
        </div>

        {/* Score Selection */}
        <div className="flex flex-col gap-2.5">
          <Label className={FIELD_LABEL_CLASSES}>Endstand</Label>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Team 1
              </p>
              <Input
                type="number"
                min={0}
                max={10}
                value={team1Score}
                onChange={(e) => setTeam1Score(parseInt(e.target.value) || 0)}
                className={`${INPUT_CLASSES} text-center font-mono text-lg font-bold`}
              />
            </div>
            <span className="font-mono text-xl font-bold text-muted-foreground">:</span>
            <div className="flex-1 text-center">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Team 2
              </p>
              <Input
                type="number"
                min={0}
                max={10}
                value={team2Score}
                onChange={(e) => setTeam2Score(parseInt(e.target.value) || 0)}
                className={`${INPUT_CLASSES} text-center font-mono text-lg font-bold`}
              />
            </div>
          </div>
        </div>

        {/* Run Button */}
        <Button
          onClick={() => simulateMutation.mutate()}
          disabled={simulateMutation.isPending || !selectedCourtId || !testApiKey || !selectedApiKeyId}
          className="h-10 w-full gap-2 rounded-[11px] bg-gradient-lime text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90"
        >
          {simulateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {simulationStep || "Simulation läuft..."}
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Match simulieren
            </>
          )}
        </Button>

        {/* Result Display */}
        {simulationResult && (
          <div className="flex flex-col gap-3 rounded-[13px] border border-primary/[0.28] bg-primary/[0.06] p-3.5">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <CheckCircle className="h-4 w-4" />
              Simulation erfolgreich!
            </div>
            <div className="flex flex-col gap-2 text-[13px] text-[hsl(0_0%_78%)]">
              <p>
                <span className="font-semibold text-foreground">Session:</span>{" "}
                <span className="break-all font-mono text-[12px]">{simulationResult.session.session_id}</span>
              </p>
              <p>
                <span className="font-semibold text-foreground">Spieler verarbeitet:</span>{" "}
                <span className="font-mono text-[12.5px]">{simulationResult.completion.players_processed}</span>
              </p>
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-foreground">Credits vergeben:</p>
                {simulationResult.completion.results?.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-[9px] border border-[hsl(0_0%_12%)] bg-white/[0.04] px-2.5 py-1.5"
                  >
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {r.user_id.substring(0, 8)}...
                    </span>
                    <Badge
                      variant="outline"
                      className="whitespace-nowrap rounded-full border-primary/[0.28] bg-primary/[0.09] px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-primary"
                    >
                      +{r.credits_awarded} Credits
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
