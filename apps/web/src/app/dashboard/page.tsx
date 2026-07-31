"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { StatCards } from "./_components/StatCards";
import { QuickActions } from "./_components/QuickActions";
import { CareerMatchHub } from "./_components/CareerMatchHub";
import { UniversityMatches } from "./_components/UniversityMatches";
import { SkillBridgingCard } from "./_components/SkillBridgingCard";
import { PortfolioSnapshot } from "./_components/PortfolioSnapshot";
import { motion } from "motion/react";
import { normalizeRole } from "@/lib/roleUtils";
import { AdminTimeline } from "@/components/ui/admin-timeline";
import { BookOpen, Target, FileText, GraduationCap, Lock } from "lucide-react";
import { Roles } from "@/lib/permissions";
import { useAssessmentProgress } from "@/hooks/useAssessmentQueries";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { isCareerJourneyComplete } from "./_components/journeyStatus";

interface DashboardData {
  activeCourses?: number;
  portfolioItems?: number;
  careerProfileComplete?: boolean;
  pcaResults?: unknown;
  aiSummary?: string;
  AiSummary?: string;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const userRole = normalizeRole(user?.role || "");

  useEffect(() => {
    if (!user?.id || userRole === Roles.COACH) { setLoading(false); return; }
    const fetchDashboard = async () => {
      try {
        const res = await apiRequest(`/api/v1/Dashboard/student/${user.id}`, { method: "GET" });
        const data = res?.data?.data ?? res?.data ?? {};
        if (data) setDashboardData(data);
      } catch {
        // Dashboard data is optional — gracefully degrade
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, [user?.id]);

  // Hooks must run unconditionally — this used to sit below the coach
  // early-return (rules-of-hooks violation).
  const { data: assessmentProgress } = useAssessmentProgress(
    userRole !== Roles.COACH ? user?.id || "" : ""
  );
  // percentageComplete (server-driven, accounts for legacyUnlockGrandfathered) rather
  // than a raw completedAssessments/totalAssessments compare — see CareerExplorer.tsx
  // for the same reasoning.
  const allAssessmentsComplete =
    assessmentProgress?.overallCompletion?.percentageComplete === 100;

  if (userRole === Roles.COACH) {
    const CoachDashboard = dynamic(
      () => import("@/components/dashboard/CoachDashboard"),
      { ssr: false },
    );
    return <CoachDashboard />;
  }

  const firstName =
    user.name?.split(" ")[0] || t("dashboard.defaultUserName", "there");

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8"
      >
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2 block">
            {t("dashboard.studentPortal")}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t("dashboard.greeting", { name: firstName })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[44ch]">
            {t("dashboard.monitorProgress")}
          </p>
        </div>
      </motion.header>

      <div className="space-y-5">
        {/* ROW 1: Stat Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <StatCards activeCourses={dashboardData?.activeCourses ?? 0} />
        </motion.div>

        {/* ROW 2: Career Matches (8 cols) + Sidebar (4 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
        >
          <div className="lg:col-span-8">
            {allAssessmentsComplete ? (
              <CareerMatchHub
                aiSummary={dashboardData?.aiSummary || dashboardData?.AiSummary}
              />
            ) : (
              <Card className="p-6 rounded-2xl border-border h-full">
                <div className="flex flex-col items-center justify-center py-8 text-center h-full">
                  <Lock className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {t("dashboard.recommendationsLocked", "Recommendations Locked")}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    {t(
                      "dashboard.completeAllAssessments",
                      "Complete all 4 assessments (PCA, LIA, 360° Evaluation, and Personality) to unlock your personalized career matches and recommendations."
                    )}
                  </p>
                  <Link
                    href="/dashboard/assessments"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {t("dashboard.goToAssessments", "Go to Assessments")}
                  </Link>
                </div>
              </Card>
            )}
          </div>
          <div className="lg:col-span-4">
            <QuickActions className="h-full" />
          </div>
        </motion.div>

        {/* ROW 3: Your Journey Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <AdminTimeline
            title={t("dashboard.journey.title")}
            items={[
              {
                id: "1",
                title: t("dashboard.journey.assessmentsTitle"),
                description: t("dashboard.journey.assessmentsDesc"),
                status: allAssessmentsComplete ? "completed" : "active",
                icon: <FileText style={{ width: 12, height: 12 }} />,
              },
              {
                id: "2",
                title: t("dashboard.journey.careersTitle"),
                description: t("dashboard.journey.careersDesc"),
                status: isCareerJourneyComplete(dashboardData) ? "completed" : "pending",
                icon: <Target style={{ width: 12, height: 12 }} />,
              },
              {
                id: "3",
                title: t("dashboard.journey.learningTitle"),
                description: t("dashboard.journey.learningDesc"),
                status: (dashboardData?.activeCourses ?? 0) > 0 ? "completed" : "pending",
                icon: <BookOpen style={{ width: 12, height: 12 }} />,
              },
              {
                id: "4",
                title: t("dashboard.journey.portfolioTitle"),
                description: t("dashboard.journey.portfolioDesc"),
                status: (dashboardData?.portfolioItems ?? 0) > 0 ? "completed" : "pending",
                icon: <GraduationCap style={{ width: 12, height: 12 }} />,
              },
            ]}
          />
        </motion.div>

        {/* ROW 5: Bottom trio (4 + 4 + 4) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-16"
        >
          {allAssessmentsComplete ? (
            <UniversityMatches />
          ) : (
            <Card className="p-5 rounded-2xl border-border flex flex-col items-center justify-center text-center min-h-[180px]">
              <Lock className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                {t("dashboard.universityMatchesLocked", "Complete all assessments to see university matches")}
              </p>
            </Card>
          )}
          <SkillBridgingCard className="h-full" />
          <PortfolioSnapshot className="h-full" />
        </motion.div>
      </div>
    </div>
  );
}
