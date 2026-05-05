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
import { motion } from "framer-motion";
import { normalizeRole } from "@/lib/roleUtils";
import { AdminTimeline } from "@/components/ui/admin-timeline";
import { BookOpen, Target, FileText, GraduationCap, Lock } from "lucide-react";
import { Roles } from "@/lib/permissions";
import { useAssessmentProgress } from "@/hooks/useAssessmentQueries";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [dashboardData, setDashboardData] = useState<any>(null);

  const userRole = normalizeRole(user?.role || "");

  useEffect(() => {
    if (!user?.id || userRole === Roles.COACH) return;
    const fetchDashboard = async () => {
      try {
        const res = await apiRequest(`/api/v1/Dashboard/student/${user.id}`, { method: "GET" });
        const data = res?.data ?? res;
        if (data) setDashboardData(data);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      }
    };
    fetchDashboard();
  }, [user?.id]);

  if (userRole === Roles.COACH) {
    const CoachDashboard = dynamic(
      () => import("@/components/dashboard/CoachDashboard"),
      { ssr: false },
    );
    return <CoachDashboard />;
  }

  const firstName =
    user.name?.split(" ")[0] || t("dashboard.defaultUserName", "there");

  const { data: assessmentProgress } = useAssessmentProgress(user?.id || "");
  const allAssessmentsComplete =
    assessmentProgress?.overallCompletion?.completedAssessments === 3;

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
          <StatCards
            courseData={
              dashboardData?.activeCourse || dashboardData?.ActiveCourse || null
            }
          />
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
                      "Complete all 3 assessments (PCA, LIA, and 360° Evaluation) to unlock your personalized career matches and recommendations."
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
            title="Your Journey"
            items={[
              {
                id: "1",
                title: "Complete Assessments",
                description: "Take PCA and MIL evaluations to discover your strengths",
                status: dashboardData?.pcaResults ? "completed" : "active",
                icon: <FileText style={{ width: 12, height: 12 }} />,
              },
              {
                id: "2",
                title: "Explore Career Paths",
                description: "Browse careers matched to your profile and interests",
                status: dashboardData?.aiSummary ? "completed" : "pending",
                icon: <Target style={{ width: 12, height: 12 }} />,
              },
              {
                id: "3",
                title: "Start Learning",
                description: "Enroll in courses to build skills for your target career",
                status: "pending",
                icon: <BookOpen style={{ width: 12, height: 12 }} />,
              },
              {
                id: "4",
                title: "Build Your Portfolio",
                description: "Create your resume and showcase your achievements",
                status: "pending",
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
