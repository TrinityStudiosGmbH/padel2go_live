import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { X, Trophy, Target, TrendingUp, Calendar, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface FriendProfileCardProps {
  username: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ProfileData {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  play_credits: number;
  lifetime_credits: number;
  skill_level: number;
  games_played: number;
  member_since: string;
  expert_level: {
    name: string;
    gradient: string;
    emoji: string;
  };
  match_history: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
    last5: string[];
  };
}

export function FriendProfileCard({ username, isOpen, onClose }: FriendProfileCardProps) {
  const { t, i18n } = useTranslation("social");
  const navigate = useNavigate();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["friend-profile-card", username],
    queryFn: async (): Promise<ProfileData | null> => {
      const { data, error } = await supabase.functions.invoke("public-profile-api", {
        body: { action: "profile", username },
      });

      if (error) {
        console.error("Failed to fetch friend profile:", error);
        throw error;
      }

      return data;
    },
    enabled: isOpen && !!username,
  });

  const handleViewFullProfile = () => {
    onClose();
    navigate(`/u/${username}`);
  };

  const displayName = profile?.display_name || profile?.username || username;

  // Expert level gradient classes
  const getGradientClasses = (gradient: string) => {
    const gradientMap: Record<string, string> = {
      "from-zinc-400 to-zinc-500": "from-zinc-400 to-zinc-500",
      "from-amber-500 to-orange-500": "from-amber-500 to-orange-500",
      "from-blue-400 to-cyan-500": "from-blue-400 to-cyan-500",
      "from-lime-400 to-green-500": "from-lime-400 to-green-500",
      "from-orange-500 to-red-500": "from-orange-500 to-red-500",
      "from-purple-500 to-pink-500": "from-purple-500 to-pink-500",
      "from-cyan-400 to-violet-500": "from-cyan-400 to-violet-500",
      "from-yellow-400 to-lime-400": "from-yellow-400 to-lime-400",
    };
    return gradientMap[gradient] || "from-primary to-primary";
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center justify-between">
            <DrawerTitle>{t("friendProfileCard.title")}</DrawerTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error || !profile ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t("friendProfileCard.loadError")}</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header with Avatar and Name */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className={cn(
                    "absolute inset-0 rounded-full bg-gradient-to-br blur-sm opacity-60",
                    getGradientClasses(profile.expert_level.gradient)
                  )} />
                  <UserAvatar
                    src={profile.avatar_url}
                    name={displayName || profile.username}
                    className="w-16 h-16 relative border-2 border-background text-lg"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{displayName}</h3>
                  <p className="text-sm text-muted-foreground">@{profile.username}</p>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "mt-1 bg-gradient-to-r text-white border-0",
                      getGradientClasses(profile.expert_level.gradient)
                    )}
                  >
                    {profile.expert_level.emoji} {profile.expert_level.name}
                  </Badge>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Target className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xl font-bold">{profile.skill_level.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">{t("friendProfileCard.skillLevel")}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Trophy className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xl font-bold text-green-500">{profile.match_history.wins}</p>
                  <p className="text-xs text-muted-foreground">{t("friendProfileCard.wins")}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />
                  </div>
                  <p className="text-xl font-bold text-red-500">{profile.match_history.losses}</p>
                  <p className="text-xs text-muted-foreground">{t("friendProfileCard.losses")}</p>
                </div>
              </div>

              {/* Last 5 Matches */}
              {profile.match_history.last5.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">{t("friendProfileCard.lastMatches")}</p>
                  <div className="flex items-center gap-2">
                    {profile.match_history.last5.map((result, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white",
                          result === "W" && "bg-green-500",
                          result === "L" && "bg-red-500",
                          result === "D" && "bg-amber-500"
                        )}
                      >
                        {result}
                      </motion.div>
                    ))}
                    {profile.match_history.last5.length < 5 && (
                      [...Array(5 - profile.match_history.last5.length)].map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground"
                        >
                          –
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Play Credits */}
              <div className="flex items-center justify-between bg-muted/30 rounded-xl p-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("friendProfileCard.playCredits")}</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    {profile.play_credits.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("friendProfileCard.memberSince")}
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(profile.member_since).toLocaleDateString(
                      i18n.language === "en" ? "en-US" : "de-DE",
                      {
                        month: "short",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
              </div>

              {/* View Full Profile Button */}
              <Button onClick={handleViewFullProfile} className="w-full gap-2">
                <ExternalLink className="w-4 h-4" />
                {t("friendProfileCard.viewFullProfile")}
              </Button>
            </motion.div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
