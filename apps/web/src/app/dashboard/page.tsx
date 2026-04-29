"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { StatCards } from "./_components/StatCards";
import { QuickActions } from "./_components/QuickActions";
import { CareerMatchHub } from "./_components/CareerMatchHub";
import { UniversityMatches } from "./_components/UniversityMatches";
import { SkillBridgingCard } from "./_components/SkillBridgingCard";
import { PortfolioSnapshot } from "./_components/PortfolioSnapshot";
import { PCAResults } from "./_components/PCAResults";
import { MILResults } from "./_components/MILResults";
import { LiveStatus } from "./_components/LiveStatus";
import { motion } from "framer-motion";
import { normalizeRole } from "@/lib/roleUtils";
import { AdminTimeline } from "@/components/ui/admin-timeline";
import { BookOpen, Target, FileText, GraduationCap } from "lucide-react";
import { Roles } from "@/lib/permissions";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [dashboardData, setDashboardData] = useState<any>(null);

  const userRole = normalizeRole(user.role);

  useEffect(() => {
    if (!user || userRole === Roles.COACH) return;
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";
        const url = `${API_BASE_URL.replace("/api/v1", "")}/api/v1/Dashboard/student/${user.id}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const resJson = await response.json();
          if (resJson.success) {
            setDashboardData(resJson.data);
          }
        }
      } catch (err) {
        // error handled silently
      }
    };
    fetchDashboard();
  }, [user]);

  if (userRole === Roles.COACH) {
    const CoachDashboard = dynamic(
      () => import("@/components/dashboard/CoachDashboard"),
      { ssr: false },
    );
    return <CoachDashboard />;
  }

  const firstName =
    user.name?.split(" ")[0] || t("dashboard.defaultUserName", "there");

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
          className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
        >
          <div className="lg:col-span-8">
            <CareerMatchHub
              aiSummary={dashboardData?.aiSummary || dashboardData?.AiSummary}
            />
          </div>
          <div className="lg:col-span-4 flex flex-col gap-4">
            <QuickActions />
            <LiveStatus />
          </div>
        </motion.div>

        {/* ROW 3: Cognitive Profile (6 + 6) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        >
          <PCAResults
            pcaDataProp={dashboardData?.pcaResults || dashboardData?.PcaResults}
            className="h-full"
          />
          <MILResults
            milDataProp={dashboardData?.milResults || dashboardData?.MilResults}
            className="h-full"
          />
        </motion.div>

        {/* ROW 4: Your Journey Timeline */}
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
          <UniversityMatches />
          <SkillBridgingCard className="h-full" />
          <PortfolioSnapshot className="h-full" />
        </motion.div>
      </div>
    </div>
  );
}
