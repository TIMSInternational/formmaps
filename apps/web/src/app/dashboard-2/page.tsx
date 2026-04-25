"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { ActionCards } from "../dashboard/_components/ActionCards";
import { OpportunitiesTable } from "../dashboard/_components/OpportunitiesTable";
import { Top3Careers } from "@/components/career/Top3Careers";
import { PCAResults } from "../dashboard/_components/PCAResults";
import { MILResults } from "../dashboard/_components/MILResults";
import { FeaturedCoaches } from "../dashboard/_components/FeaturedCoaches";
import { LiveStatus } from "../dashboard/_components/LiveStatus";
import { ActiveCoursePlan } from "../dashboard/_components/ActiveCoursePlan";
import { AssessmentProgressCard } from "@/components/dashboard/AssessmentProgressCard";
import { motion } from "framer-motion";


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
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson.success) {
            console.log("[Dashboard] milResults sample:", JSON.stringify((resJson.data?.milResults || resJson.data?.MilResults || []).slice(0, 2), null, 2));
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
      { ssr: false }
    );
    return <CoachDashboard />;
  }

  // Common staggered entrance configuration for all sections
  const sectionVariants: any = {
    hidden: { opacity: 0, y: 30, filter: "blur(5px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.32, 0.72, 0, 1] } }
  };

  return (
    <div className="w-full mx-auto sm:px-2 lg:px-4 py-8 lg:py-16 min-h-[100dvh]">
      <motion.header 
        initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        className="mb-12 md:mb-16 px-4"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200/50 mb-6 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-600">
            {t("dashboard.studentPortal")}
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight leading-tight mb-4">
          {t("dashboard.greeting", { name: user.name?.split(" ")[0] || t("dashboard.defaultUserName", "there") })}
        </h1>
        <p className="text-base font-medium text-slate-500 max-w-[50ch] leading-relaxed">
          {t("dashboard.monitorProgress")}
        </p>
      </motion.header>

      {/* Asymmetrical Bento Grid */}
      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.1 } }
        }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-8 gap-6 auto-rows-min pb-24"
      >
        {/* TIER 1: The Command Center & Progress Anchor */}
        
        {/* Top Full Anchor: Overall Progress (Span 8) */}
        <motion.section variants={sectionVariants} className="md:col-span-8 flex w-full mb-2 lg:mb-4">
           <AssessmentProgressCard />
        </motion.section>

        {/* Row 2: Action Cards (Span 5) and Live Status (Span 3) */}
        <motion.section variants={sectionVariants} className="md:col-span-8 lg:col-span-5 flex h-full min-h-[320px]">
           <ActionCards data={dashboardData?.actionCards || dashboardData?.ActionCards} className="flex-1" />
        </motion.section>
        
        <motion.section variants={sectionVariants} className="md:col-span-8 lg:col-span-3 flex h-full min-h-[320px]">
           <LiveStatus />
        </motion.section>

        {/* TIER 2: The Identity Cluster (50/50 Horizontal Split) */}

        {/* Left Gallery Widget: PCAResults (Span 4) */}
        <motion.section variants={sectionVariants} className="md:col-span-4 lg:col-span-4 flex w-full">
          <PCAResults pcaDataProp={dashboardData?.pcaResults || dashboardData?.PcaResults} className="w-full" />
        </motion.section>
        
        {/* Right Gallery Widget: MILResults (Span 4) */}
        <motion.section variants={sectionVariants} className="md:col-span-4 lg:col-span-4 flex w-full">
          <MILResults milDataProp={dashboardData?.milResults || dashboardData?.MilResults} className="w-full" />
        </motion.section>

        {/* TIER 3: The Future Path */}
        <motion.section variants={sectionVariants} className="md:col-span-8 lg:col-span-4 flex mt-8 lg:mt-12">
          <Top3Careers topCareersProp={dashboardData?.topCareers || dashboardData?.TopCareers} />
        </motion.section>

        <motion.section variants={sectionVariants} className="md:col-span-8 lg:col-span-4 flex mt-8 lg:mt-12">
           <ActiveCoursePlan courseData={dashboardData?.activeCourse || dashboardData?.ActiveCourse || null} />
        </motion.section>

        {/* TIER 4: The Network */}
        <motion.section variants={sectionVariants} className="md:col-span-8 mt-12 lg:mt-16">
           <FeaturedCoaches />
        </motion.section>
        
        <motion.section variants={sectionVariants} className="md:col-span-8 mt-4 lg:mt-8">
           <OpportunitiesTable />
        </motion.section>
      </motion.div>
    </div>
  );
}
