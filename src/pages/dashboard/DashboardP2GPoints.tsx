import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useP2GPoints } from "@/hooks/useP2GPoints";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Coins } from "lucide-react";
import { 
  P2GPointsHeaderSimple, 
  SkillLast5Section,
  LastGameCard, 
  MyGamesSection,
  FriendsActivityFeed,
} from "@/components/p2g";

export default function DashboardP2GPoints() {
  const { t } = useTranslation("p2g");
  const {
    summary, 
    isSummaryLoading, 
    lastGameData,
    isLastGameLoading,
    matchHistory,
    isSkillsLoading,
  } = useP2GPoints();

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t("meta.p2gPoints.title")}</title>
        <meta name="description" content={t("meta.p2gPoints.description")} />
      </Helmet>

        <div className="container mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">
          <P2GPointsHeaderSimple summary={summary} isLoading={isSummaryLoading} />
          <div className="space-y-6">
            <SkillLast5Section />
            <LastGameCard 
              lastGame={lastGameData?.last_game || null}
              skillLevel={lastGameData?.skill_level || 0}
              isLoading={isLastGameLoading}
            />
            <FriendsActivityFeed />
            <MyGamesSection 
              matchHistory={matchHistory}
              isLoading={isSkillsLoading}
            />
          </div>
        </div>
    </DashboardLayout>
  );
}