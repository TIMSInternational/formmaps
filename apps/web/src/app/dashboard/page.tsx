"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { ActionCards } from "./_components/ActionCards";
import { OpportunitiesTable } from "./_components/OpportunitiesTable";
import { Top3Careers } from "@/components/career/Top3Careers";
import { PCAResults } from "./_components/PCAResults";
import { MILResults } from "./_components/MILResults";
import { FeaturedCoaches } from "./_components/FeaturedCoaches";
import { LiveStatus } from "./_components/LiveStatus";
import { ActiveCoursePlan } from "./_components/ActiveCoursePlan";
import { AssessmentProgressCard } from "@/components/dashboard/AssessmentProgressCard";
import { motion } from "framer-motion";


const fade = (delay = 0): any => ({
  hidden: { opacity: 0, y: 28, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, ease: [0.32, 0.72, 0, 1], delay },
  },
});

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="lg:col-span-12 flex items-center gap-4 mt-8 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-200/70" />
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    if (!user || user.role?.toLowerCase() === "coach") return;
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
            console.log(
              "[Dashboard] milResults sample:",
              JSON.stringify(
                (
                  resJson.data?.milResults ||
                  resJson.data?.MilResults ||
                  []
                ).slice(0, 2),
                null,
                2,
              ),
            );
            setDashboardData(resJson.data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      }
    };
    fetchDashboard();
  }, [user]);

  const isCoach = user.role && user.role.toLowerCase() === "coach";
  if (isCoach) {
    const CoachDashboard = dynamic(
      () => import("@/components/dashboard/CoachDashboard"),
      { ssr: false },
    );
    return <CoachDashboard />;
  }

  const firstName =
    user.name?.split(" ")[0] || t("dashboard.defaultUserName", "there");

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-24 min-h-[100dvh]">
      {/* COMPACT HEADER */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fade(0)}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10"
      >
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/60 mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              {t("dashboard.studentPortal")}
            </span>
          </div>
          <h1 className="text-3xl md:text-[2.25rem] font-semibold text-slate-900 tracking-tight leading-none">
            {t("dashboard.greeting", { name: firstName })}
          </h1>
          <p className="text-sm text-slate-500 mt-2.5 leading-relaxed max-w-[44ch]">
            {t("dashboard.monitorProgress")}
          </p>
        </div>

        {/* Quick status pills */}
        <div className="flex items-center gap-2.5 flex-wrap md:pb-0.5">
          <div className="px-3.5 py-2 rounded-full bg-white border border-slate-200/80 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-600">
              {t("dashboard.profileComplete", "67% Complete")}
            </span>
          </div>
          <div className="px-3.5 py-2 rounded-full bg-white border border-slate-200/80 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-600">
              {t("dashboard.assessmentPending", "1 Pending Assessment")}
            </span>
          </div>
        </div>
      </motion.div>

      {/* MASTER BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ZONE 1: Assessment Progress (full width) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.05)}
          className="col-span-1 lg:col-span-12"
        >
          <AssessmentProgressCard />
        </motion.div>

        {/* ZONE 2: Action Cards (left 8 cols) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.1)}
          className="col-span-1 lg:col-span-8"
        >
          <ActionCards
            data={dashboardData?.actionCards || dashboardData?.ActionCards}
            className="h-full"
          />
        </motion.div>

        {/* ZONE 3: Live Status (right 4 cols) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.12)}
          className="col-span-1 lg:col-span-4"
        >
          <LiveStatus />
        </motion.div>

        {/* DIVIDER: Cognitive Profile */}
        <SectionLabel
          label={t(
            "dashboard.cogProfile",
            "Cognitive Profile & Assessment Results",
          )}
        />

        {/* ZONE 4: PCA Results (left 6 cols) + MIL/LIA Results (right 6 cols) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.18)}
          className="col-span-1 lg:col-span-6"
        >
          <PCAResults
            pcaDataProp={dashboardData?.pcaResults || dashboardData?.PcaResults}
            className="h-full"
          />
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.22)}
          className="col-span-1 lg:col-span-6"
        >
          <MILResults
            milDataProp={dashboardData?.milResults || dashboardData?.MilResults}
            className="h-full"
          />
        </motion.div>

        {/* DIVIDER: Careers */}
        <SectionLabel label={t("dashboard.careers", "Top Career Matches")} />

        {/* ZONE 5: Top 3 Careers (full width) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.26)}
          className="col-span-1 lg:col-span-12"
        >
          <Top3Careers
            topCareersProp={
              dashboardData?.topCareers || dashboardData?.TopCareers
            }
          />
        </motion.div>

        {/* DIVIDER: Learning Path */}
        <SectionLabel
          label={t("dashboard.learningPath", "Active Learning Path")}
        />

        {/* ZONE 5: Active Course Plan (full width) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.3)}
          className="col-span-1 lg:col-span-12"
        >
          <ActiveCoursePlan
            courseData={
              dashboardData?.activeCourse || dashboardData?.ActiveCourse || null
            }
          />
        </motion.div>

        {/* DIVIDER: Your Network */}
        <SectionLabel label={t("dashboard.network", "Your Network")} />

        {/* ZONE 6: Featured Coaches (full width) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.34)}
          className="col-span-1 lg:col-span-12"
        >
          <FeaturedCoaches />
        </motion.div>

        {/* ZONE 7: Opportunities Table (full width) */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fade(0.38)}
          className="col-span-1 lg:col-span-12 pb-20"
        >
          <OpportunitiesTable />
        </motion.div>
      </div>
    </div>
  );
}
