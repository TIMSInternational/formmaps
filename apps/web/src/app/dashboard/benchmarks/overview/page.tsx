"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  TrendingUp,
  Users,
  Globe,
  BookOpen,
  DollarSign,
  Briefcase,
  Zap,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";

// Components
import MarketInsights from "../_components/MarketInsights";
import SalaryTrendsChart from "../_components/SalaryTrendsChart";
import SkillsChart from "../_components/SkillsChart";
import WorkModeChart from "../_components/WorkModeChart";
import CostOfLiving from "../_components/CostOfLiving";

// Services
import {
  getMarketInsights,
  getSalaryTrends,
  getTopSkills,
  getWorkModeDistribution,
  getCostOfLiving,
  getRecommendedCertifications,
  getEmployabilityTrends,
  SalaryData,
  InsightData,
  SkillData,
  PieData,
  IndexData,
  CertData,
  BenchmarkData,
} from "@/services/benchmarkService";

export default function OverviewPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const country = searchParams.get("country") || "USA";
  const career = searchParams.get("career") || "Software Engineer";

  // State
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    salary: SalaryData[];
    insights: InsightData[];
    skills: SkillData[];
    workMode: PieData[];
    col: IndexData | null;
    certs: CertData[];
    employability: BenchmarkData[];
  }>({
    salary: [],
    insights: [],
    skills: [],
    workMode: [],
    col: null,
    certs: [],
    employability: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [salary, insights, skills, workMode, col, certs, employability] =
          await Promise.all([
            getSalaryTrends(country, career),
            getMarketInsights(country, career),
            getTopSkills(career),
            getWorkModeDistribution(career),
            getCostOfLiving(country),
            getRecommendedCertifications(career),
            getEmployabilityTrends(country, career),
          ]);
        setData({
          salary,
          insights,
          skills,
          workMode,
          col,
          certs,
          employability,
        });
      } catch (error) {
      // error handled silently
    } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [country, career]);

  const { user } = useGlobalStore(); // Assuming useGlobalStore is available for user name if needed, else ignore

  // Calculate current employability score
  const currentEmployability =
    data.employability.length > 0
      ? data.employability[data.employability.length - 1].value
      : 0;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Decorative Background */}
      <div className="fixed top-0 left-0 w-full h-[300px] bg-gradient-to-b from-slate-50 to-transparent -z-10 pointer-events-none" />

      {/* Top Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50 flex items-start justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-16 h-16 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-600 mb-1">
              {t("benchmarks.marketDemand")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900">
              {t("benchmarks.high")}
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              {t("benchmarks.topGrowth")}
            </p>
          </div>
          <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100/50 flex items-start justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users className="w-16 h-16 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-600 mb-1">
              {t("benchmarks.talentSupply")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900">
              {t("benchmarks.moderate")}
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              {t("benchmarks.balancedCompetition")}
            </p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100/50 flex items-start justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="w-16 h-16 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-600 mb-1">
              {t("benchmarks.employability")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900">
              {Math.round(currentEmployability)}%
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              {t("benchmarks.basedOnProfile")}
            </p>
          </div>
          <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
        </div>
      </motion.div>

      {/* Main Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 xl:grid-cols-3 gap-6"
      >
        {/* ROW 1: Charts (Salary & Skills) */}
        <div className="xl:col-span-2 h-full">
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 group h-full"
          >
            <div className="p-6 h-full flex flex-col">
              <div className="flex flex-row items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {t("dashboard.benchmarks.overview.salaryTitle")}
                    </h3>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg hidden sm:flex h-8"
                >
                  <Link
                    href={`/dashboard/benchmarks/compensation?country=${country}&career=${career}`}
                  >
                    {t("benchmarks.details")} <ArrowRight className="ml-2 w-3 h-3" />
                  </Link>
                </Button>
              </div>
              <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100/50 flex-1">
                <SalaryTrendsChart data={data.salary} isLoading={loading} />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="xl:col-span-1 h-full">
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full group"
          >
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-violet-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {t("dashboard.benchmarks.overview.topSkills")}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg h-8 px-2"
                >
                  <Link
                    href={`/dashboard/benchmarks/skills?country=${country}&career=${career}`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>

              <div className="flex-1 min-h-[250px] bg-white rounded-xl">
                <SkillsChart data={data.skills} isLoading={loading} />
              </div>
            </div>
          </motion.div>
        </div>

        {/* ROW 2: Secondary Metrics (Work, COL, Certs) */}
        <div className="xl:col-span-1 h-full">
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 group h-full"
          >
            <div className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t("dashboard.benchmarks.overview.workMode")}
                </h3>
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[200px]">
                <WorkModeChart data={data.workMode} isLoading={loading} />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="xl:col-span-1 h-full">
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 group h-full"
          >
            <div className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t("dashboard.benchmarks.overview.costOfLiving")}
                </h3>
              </div>
              <div className="flex-1 min-h-[200px]">
                {data.col && (
                  <CostOfLiving data={data.col} isLoading={loading} />
                )}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="xl:col-span-1 h-full">
          {/* Quick Certs */}
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 p-6 h-full flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <h4 className="font-bold text-gray-900">
                  {t("dashboard.benchmarks.overview.certifications")}
                </h4>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              {data.certs.slice(0, 3).map((cert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 group/item cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                >
                  <CheckCircle2 className="w-5 h-5 text-violet-400 mt-0.5 shrink-0 group-hover/item:text-violet-600 transition-colors" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 group-hover/item:text-violet-700 transition-colors line-clamp-1">
                      {cert.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {cert.provider}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              className="w-full mt-4 text-xs text-gray-500 hover:text-violet-600 hover:bg-violet-50 h-9"
              asChild
            >
              <Link
                href={`/dashboard/benchmarks/skills?country=${country}&career=${career}`}
              >
                {t("dashboard.benchmarks.overview.viewAll")}
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* ROW 3: Market Pulse (Full Width) */}
        <div className="xl:col-span-3">
          <motion.div
            variants={item}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Globe className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">
                    {t("dashboard.benchmarks.overview.marketPulse")}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {t("dashboard.benchmarks.overview.marketPulseDesc")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-gray-200 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-gray-600">
                  {t("dashboard.benchmarks.overview.liveUpdates")}
                </span>
              </div>
            </div>
            <div className="p-6">
              <MarketInsights data={data.insights} isLoading={loading} />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
