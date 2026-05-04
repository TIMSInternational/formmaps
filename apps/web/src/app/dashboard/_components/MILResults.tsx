"use client";

import { motion } from "motion/react";
import { useMILData } from "@/hooks/useMILData";
import { useTranslation } from "react-i18next";
import {
  Target,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  BarChart3,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface MILResultsProps {
  className?: string;
  milDataProp?: any;
}

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export function MILResults({ className, milDataProp }: MILResultsProps) {
  const hookData = useMILData();
  const loading = !milDataProp && hookData.loading;

  // map from Dashboard API
  const overallScoreProp =
    milDataProp && milDataProp.length > 0
      ? Math.round(
          milDataProp.reduce(
            (a: any, b: any) =>
              a + (b.scorePercentage || b.ScorePercentage || 0),
            0,
          ) / milDataProp.length,
        )
      : hookData.hasMIL
        ? hookData.getOverallScore()
        : 0;

  const hasMIL = (milDataProp && milDataProp.length > 0) || hookData.hasMIL;
  const {
    progress,
    error,
    getOverallScore,
    getSubtestScores,
    getCompletionStats,
    hasEnhancedData,
    completionStats,
  } = hookData;

  // Derive completion from milDataProp when hook progress is empty
  const milPropCount = milDataProp?.length ?? 0;
  const effectiveCompleted = hasEnhancedData
    ? completionStats.completed
    : progress?.completedExams?.length ?? milPropCount;
  const effectiveTotal = hasEnhancedData
    ? completionStats.total
    : progress?.totalExams ?? 5;
  const isCompleted = milPropCount >= 5 || hookData.isCompleted;
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card className={cn("p-6 h-full glass-card", className)}>
        <div className="animate-pulse space-y-4">
          <div className="flex justify-between">
            <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
            <div className="h-8 w-16 bg-slate-100 rounded-lg"></div>
          </div>
          <div className="h-6 bg-slate-100 rounded w-1/3"></div>
          <div className="space-y-3 pt-4">
            <div className="h-2 bg-slate-100 rounded-full"></div>
            <div className="h-2 bg-slate-100 rounded-full w-5/6"></div>
            <div className="h-2 bg-slate-100 rounded-full w-4/6"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (error || !hasMIL) {
    return (
      <Card
        className={cn(
          "p-6 h-full flex flex-col justify-between glass-card",
          className,
        )}
      >
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-sans font-semibold text-slate-900">
                {t("dashboard.takeLIAAssessment")}
              </h3>
              <p className="text-sm text-slate-500">
                {t("dashboard.measureCognitiveAbilities")}
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <Target className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-slate-600 text-sm mb-6 max-w-[240px]">
              Ready to discover your cognitive strengths?
            </p>
          </div>
        </div>

        <a
          href="/dashboard/assessments/mil"
          className={cn(buttonVariants({ variant: "default" }), "w-full py-3")}
        >
          <span>{t("dashboard.startAssessment")}</span>
          <ArrowRight className="w-4 h-4 ml-2" />
        </a>
      </Card>
    );
  }

  const overallScore = milDataProp ? overallScoreProp : getOverallScore();
  const completionPercentage = (effectiveCompleted / effectiveTotal) * 100;

  // Use enhanced API data for subtest scores
  const subtestScores = getSubtestScores();

  const chartData = subtestScores.map((subtest, index) => ({
    name: subtest.name.split(" ")[0] || subtest.name,
    fullName: subtest.name,
    score: (subtest as any).score > 0 ? (subtest as any).score : 75,
    time: (subtest as any).timeSpent
      ? (subtest as any).timeSpent.split(".")[0]
      : null,
    fill:
      (subtest as any).color ||
      ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5],
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <Card className={cn("p-6 h-full flex flex-col glass-card", className)}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-sans font-semibold text-slate-900">
                {t("dashboard.liaResults")}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Cognitive Assessment
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-sans font-bold text-slate-900">
              {`${effectiveCompleted}/${effectiveTotal}`}
            </div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-1">
              {isCompleted
                ? t("dashboard.allComplete")
                : t("dashboard.examsCompleted")}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              {t("common.progress")}
            </span>
            <span className="text-sm text-slate-600">
              {Math.round(completionPercentage)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="bg-indigo-600 h-full rounded-full"
            />
          </div>
          {hasEnhancedData && completionStats.inProgress > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <Clock className="w-3 h-3" />
              {completionStats.inProgress} {t("dashboard.examsInProgress")}
            </div>
          )}
        </div>

        {/* Subtest Completion Status - Charts */}
        {subtestScores.length > 0 && (
          <div className="w-full mb-8" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barSize={32}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748B", fontSize: 11, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  dx={-10}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-100 flex flex-col gap-1.5 focus:outline-none">
                          <span className="text-sm font-semibold text-slate-800">
                            {data.fullName}
                          </span>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-slate-500">
                              Status
                            </span>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-xs text-emerald-600 font-medium">
                                Complete
                              </span>
                            </div>
                          </div>
                          {data.time && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs text-slate-500">
                                Duration
                              </span>
                              <div className="text-xs font-mono text-slate-700 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {data.time}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="score" radius={[4, 4, 4, 4]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-auto pt-6 border-t border-slate-100/50">
          <a
            href="/dashboard/assessments/mil"
            className={cn(
              buttonVariants({ variant: isCompleted ? "default" : "default" }),
              "flex-1 py-2.5",
              !isCompleted && "bg-indigo-600 hover:bg-indigo-700",
            )}
          >
            <span>
              {isCompleted ? t("dashboard.viewAssessments") : t("common.next")}
            </span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </a>
          <button
            onClick={() => window.location.reload()}
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 font-medium tracking-wide">
          <span className="uppercase">
            {isCompleted
              ? t("dashboard.allAssessmentsComplete")
              : `${effectiveCompleted}/${effectiveTotal} COMPLETED`}
          </span>
          <div className="flex items-center gap-2">
            <span>
              {progress?.lastUpdated
                ? new Date(progress.lastUpdated).toLocaleDateString()
                : "TODAY"}
            </span>
            {hasEnhancedData && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                title={t("dashboard.liveData")}
              />
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
