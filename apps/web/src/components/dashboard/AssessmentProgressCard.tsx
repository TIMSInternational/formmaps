"use client";

import { motion } from "motion/react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { useDashboardAssessmentSummary } from "@/hooks/useAssessmentQueries";
import {
  CheckCircle2,
  Circle,
  Clock,
  Brain,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function AssessmentProgressCard() {
  const { user } = useGlobalStore();
  const { t } = useTranslation();

  // Use React Query for assessment data
  const {
    data: assessmentData,
    isLoading: loading,
    error,
  } = useDashboardAssessmentSummary(user?.id || "");

  const getAssessmentIcon = (type: string) => {
    switch (type) {
      case "pca":
        return <Brain className="w-5 h-5 text-blue-600" />;
      case "mil":
        return <Target className="w-5 h-5 text-purple-600" />;
      case "evaluation":
        return <Users className="w-5 h-5 text-orange-600" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "in_progress":
        return "bg-amber-50 text-amber-700 border-amber-100";
      default:
        return "bg-slate-50 text-slate-600 border-slate-100";
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card
          className="p-8 pb-6 h-full text-slate-900 rounded-[2rem] border border-slate-200/50 shadow-sm"
          role="status"
        >
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-slate-100 rounded w-1/3"></div>
            <div className="h-4 bg-slate-100 rounded w-1/2"></div>
            <div className="h-16 bg-slate-100 rounded-xl"></div>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (!assessmentData) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <Card className="p-8 pb-6 h-full flex flex-col justify-between rounded-[2rem] border border-slate-200/50  bg-white">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 tracking-tight leading-none mb-1.5">
              {t("dashboard.assessmentJourney")}
            </h3>
            <p className="text-sm text-slate-500 leading-none">
              {t("dashboard.assessmentSubtitle")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-indigo-600 tracking-tighter">
              {assessmentData.overallCompletion}%
            </div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-8">
          <div
            className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={assessmentData.overallCompletion}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall completion"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${assessmentData.overallCompletion}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="bg-indigo-600 h-full rounded-full"
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-400 font-medium px-1">
            <span>{t("common.start")}</span>
            <span>{t("dashboard.professionalCertified")}</span>
          </div>
        </div>

        {/* Individual Assessments - Horizontal Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="list">
          {assessmentData.assessments.map((assessment: any, index: number) => (
            <motion.div
              key={assessment.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="group flex flex-col p-4 rounded-2xl border border-slate-200/60 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all"
              role="listitem"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 shrink-0",
                    assessment.type === "pca"
                      ? "bg-blue-100/50"
                      : assessment.type === "mil"
                        ? "bg-purple-100/50"
                        : "bg-orange-100/50",
                  )}
                  aria-hidden="true"
                >
                  {getAssessmentIcon(assessment.type)}
                </div>
                {assessment.status === "completed" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1" />
                ) : (
                  <span className="text-sm font-bold text-slate-400 mt-1">
                    {assessment.completion}%
                  </span>
                )}
              </div>

              <div>
                <div className="font-semibold text-slate-800 text-sm leading-tight flex-1 line-clamp-1 mb-2">
                  {assessment.name}
                </div>
                <div className="flex items-center">
                  <span
                    className={cn(
                      "text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border",
                      getStatusColor(assessment.status),
                    )}
                  >
                    {assessment.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Action */}
        <div className="mt-8 pt-5 border-t border-slate-100 flex justify-end">
          <a
            href="/dashboard/assessments"
            className="group flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-semibold text-sm transition-all bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]"
          >
            <span>Continue Assessment</span>
            <Clock className="w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>
      </Card>
    </motion.div>
  );
}
