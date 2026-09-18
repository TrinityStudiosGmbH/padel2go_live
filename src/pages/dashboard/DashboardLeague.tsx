import { useState } from "react";
import { cn } from "@/lib/utils";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAccountData } from "@/hooks/useAccountData";
import { useP2GPoints } from "@/hooks/useP2GPoints";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { 
  Trophy, 
  TrendingUp, 
  Target, 
  Loader2, 
  Zap, 
  Calendar,
  Crown,
  Medal,
  Sparkles,
  Globe,
  UserCircle,
  Users2,
  Swords,
  HelpCircle,
  Gamepad2,
  User
} from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/p2g/AnimatedCounter";

import type { RankingEntry } from "@/hooks/useP2GPoints";

// Extend RankingEntry for display purposes
interface DisplayRankingEntry extends RankingEntry {
  isCurrentUser?: boolean; // Alias for is_current_user for consistency
}

interface RankingTableProps {
  title: string;
  icon: React.ReactNode;
  rankings: DisplayRankingEntry[];
  emptyMessage: string;
}

function RankingTable({ title, icon, rankings, emptyMessage }: RankingTableProps) {
  const { t } = useTranslation("p2g");
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rankings.length > 0 ? (
          <div className="space-y-2">
            {rankings.map((player, index) => {
              return (
                <motion.div
                  key={`${title}-rank-${player.rank}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                    player.isCurrentUser
                      ? "border border-primary/35 bg-primary/[0.08]"
                      : "bg-background/50 border border-border/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      player.rank === 1 ? "bg-yellow-500/20 text-yellow-500" :
                      player.rank === 2 ? "bg-gray-400/20 text-gray-400" :
                      player.rank === 3 ? "bg-amber-600/20 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {player.rank === 1 && <Crown className="h-4 w-4" />}
                      {player.rank === 2 && <Medal className="h-4 w-4" />}
                      {player.rank === 3 && <Medal className="h-4 w-4" />}
                      {player.rank > 3 && player.rank}
                    </div>
                    
                    {/* Player Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {player.display_name}
                          {player.isCurrentUser && (
                            <span className="ml-2 text-xs text-primary">{t("leaguePage.rankings.you")}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Credits */}
                  <div className="text-right">
                    <span className="font-bold text-green-500">{player.play_credits.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground block">{t("leaguePage.rankings.playCreditsLabel")}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const DashboardLeague = () => {
  const { t, i18n } = useTranslation("p2g");
  const dateLocale = i18n.language === "en" ? enUS : de;
  const { user } = useAuth();
  const { isAdmin } = useAdminAuth();
  const { profile, skillStats, wallet, loading: isAccountLoading } = useAccountData(user);
  const { matchHistory, skillBalance, isSkillsLoading, rankings, isRankingsLoading, wlStats, isWLStatsLoading } = useP2GPoints();

  const playCredits = wallet?.play_credits || 0;
  const matchCount = matchHistory?.length || 0;
  const skillLevel = skillStats?.skill_level || 0;
  const userAge = profile?.age || null;


  const isLoading = isAccountLoading || isSkillsLoading || isRankingsLoading || isWLStatsLoading;

  // Get global rank from API or fallback to skill_stats
  const globalRank = rankings?.global_rank || skillStats?.ai_rank || null;

  // Use API rankings data, mapping is_current_user to isCurrentUser for display
  const rankingsGermany: DisplayRankingEntry[] = (rankings?.top_germany || []).map(r => ({
    ...r,
    isCurrentUser: r.is_current_user
  }));

  const rankingsInAgeGroup: DisplayRankingEntry[] = (rankings?.top_in_age_group || []).map(r => ({
    ...r,
    isCurrentUser: r.is_current_user
  }));

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t("meta.league.title")}</title>
      </Helmet>

      <div className="container mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Header with Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 p-2">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              {t("leaguePage.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {globalRank ? t("leaguePage.yourRank", { rank: globalRank }) : t("leaguePage.riseInRanking")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Punktestand und Ranglisten-Kennzahlen */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="relative overflow-hidden border border-primary/25">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent" />
                <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/20 opacity-20 blur-3xl" />
                
                <CardContent className="p-6 relative">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Punktestand — LINKE SEITE */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className="lg:col-span-7 space-y-4"
                    >
                      <div className="rounded-xl border border-border/50 bg-background/50 p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            <span className="font-semibold">{t("leaguePage.playCredits")}</span>
                          </div>
                          <span className="font-stat text-3xl font-bold text-primary">
                            <AnimatedCounter value={playCredits} />
                          </span>
                        </div>
                      </div>
                    </motion.div>

                    {/* Stats - RIGHT SIDE */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="lg:col-span-5 space-y-4"
                    >
                      {/* League Stats Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Liga Rang */}
                        <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-center">
                          <Crown className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                          <span className="text-2xl font-bold">{globalRank ? `#${globalRank}` : "-"}</span>
                          <span className="text-xs text-muted-foreground block">{t("leaguePage.stats.leagueRank")}</span>
                        </div>
                        
                        {/* Matches */}
                        <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-center">
                          <Target className="h-5 w-5 text-primary mx-auto mb-1" />
                          <span className="text-2xl font-bold">{matchCount}</span>
                          <span className="text-xs text-muted-foreground block">{t("leaguePage.stats.aiMatches")}</span>
                        </div>
                        
                        {/* Skill Level */}
                        <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-center">
                          <TrendingUp className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                          <span className="text-2xl font-bold">{skillLevel.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground block">{t("leaguePage.stats.skillLevel")}</span>
                        </div>
                        
                        {/* W/L Ratio */}
                        <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-center">
                          <Swords className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                          {wlStats?.has_data ? (
                            <>
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-lg font-bold text-green-500">{wlStats.wins}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-lg font-bold text-red-500">{wlStats.losses}</span>
                              </div>
                              <span className="text-xs text-muted-foreground block">
                                {wlStats.win_rate !== null ? t("leaguePage.stats.winRate", { rate: wlStats.win_rate }) : t("leaguePage.stats.wl")}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-2xl font-bold text-muted-foreground">–</span>
                              <span className="text-xs text-muted-foreground block">{t("leaguePage.stats.wlPending")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Three Ranking Tables */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top 5 Germany */}
              <RankingTable
                title={t("leaguePage.rankings.germanyTitle")}
                icon={<Globe className="h-5 w-5 text-blue-500" />}
                rankings={rankingsGermany}
                emptyMessage={t("leaguePage.rankings.germanyEmpty")}
              />

              {/* Top 5 in Age Group */}
              <RankingTable
                title={userAge ? t("leaguePage.rankings.ageTitle", { from: userAge - 5, to: userAge + 5 }) : t("leaguePage.rankings.ageTitleNoAge")}
                icon={<Users2 className="h-5 w-5 text-amber-500" />}
                rankings={rankingsInAgeGroup}
                emptyMessage={userAge ? t("leaguePage.rankings.ageEmpty") : t("leaguePage.rankings.ageEmptyNoAge")}
              />
            </div>

            {/* Letzte Matches - Accordion */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-primary" />
                  {t("leaguePage.lastMatches.heading")}
                  {matchHistory && matchHistory.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {t("leaguePage.lastMatches.count", { count: matchHistory.length })}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {matchHistory && matchHistory.length > 0 ? (
                  <Accordion type="single" collapsible className="space-y-3">
                    {matchHistory.slice(0, 5).map((match, index) => {
                      const score = match.ai_score ?? match.manual_score ?? 0;
                      
                      return (
                        <AccordionItem 
                          key={match.id} 
                          value={match.id}
                          className={cn(
                            "border rounded-xl overflow-hidden backdrop-blur-sm",
                            match.result === "W" 
                              ? "bg-green-500/10 border-green-500/30" 
                              : match.result === "L" 
                                ? "bg-red-500/10 border-red-500/30" 
                                : "bg-background/60 border-border/50"
                          )}
                        >
                          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-primary/5 transition-colors">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-green-500/20 flex items-center justify-center">
                                  <Gamepad2 className="w-5 h-5 text-primary" />
                                </div>
                                <div className="text-left">
                                  <span className="font-semibold text-sm block">
                                    {t("leaguePage.matchNumber", { id: match.match_id.slice(0, 8) })}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {match.analyzed_at
                                      ? format(new Date(match.analyzed_at), t("leaguePage.dateFormatLong"), { locale: dateLocale })
                                      : format(new Date(match.created_at), t("leaguePage.dateFormatShort"), { locale: dateLocale })}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <TrendingUp className="w-3 h-3" />
                                    {t("leaguePage.skillPrefix", { value: match.skill_level_snapshot })}
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Target className="w-3 h-3" />
                                    {t("leaguePage.scorePrefix", { value: score })}
                                  </div>
                                </div>
                                <Badge className="bg-green-500/20 text-green-500 border-green-500/30 font-mono">
                                  +{match.credits_awarded}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className="space-y-4 pt-2"
                            >
                              {/* Match Details */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Opponent Placeholder */}
                                <div className="bg-secondary/30 rounded-lg p-3 text-center">
                                  <User className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                                  <p className="text-sm font-medium text-muted-foreground">{t("leaguePage.opponentFollows")}</p>
                                  <p className="text-xs text-muted-foreground">{t("leaguePage.opponentLabel")}</p>
                                </div>
                                
                                {/* Skill Level */}
                                <div className="bg-secondary/30 rounded-lg p-3 text-center">
                                  <TrendingUp className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                                  <p className="text-lg font-bold text-blue-400">{match.skill_level_snapshot}</p>
                                  <p className="text-xs text-muted-foreground">{t("leaguePage.skillLevelLabel")}</p>
                                </div>
                                
                                {/* Score */}
                                <div className="bg-secondary/30 rounded-lg p-3 text-center">
                                  <Target className="w-5 h-5 mx-auto mb-1 text-orange-400" />
                                  <p className="text-lg font-bold text-orange-400">{score}</p>
                                  <p className="text-xs text-muted-foreground">{t("leaguePage.matchScoreLabel")}</p>
                                </div>
                                
                                {/* Points Earned */}
                                <div className="bg-secondary/30 rounded-lg p-3 text-center">
                                  <Zap className="w-5 h-5 mx-auto mb-1 text-green-400" />
                                  <p className="text-lg font-bold text-green-400">+{match.credits_awarded}</p>
                                  <p className="text-xs text-muted-foreground">{t("leaguePage.pointsLabel")}</p>
                                </div>
                              </div>

                              {/* W/L Result */}
                              <div className={cn(
                                "flex items-center justify-center gap-2 p-3 rounded-lg",
                                match.result === "W" ? "bg-green-500/10" : 
                                match.result === "L" ? "bg-red-500/10" : "bg-muted/30"
                              )}>
                                <Swords className={cn(
                                  "w-4 h-4",
                                  match.result === "W" ? "text-green-500" :
                                  match.result === "L" ? "text-red-500" : "text-muted-foreground"
                                )} />
                                <span className={cn(
                                  "text-sm font-medium",
                                  match.result === "W" ? "text-green-500" :
                                  match.result === "L" ? "text-red-500" : "text-muted-foreground"
                                )}>
                                  {match.result === "W" ? t("leaguePage.result.win") :
                                   match.result === "L" ? t("leaguePage.result.loss") : t("leaguePage.result.follows")}
                                </span>
                              </div>
                            </motion.div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                ) : (
                  <div className="text-center py-8">
                    <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {t("leaguePage.noMatches")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardLeague;
