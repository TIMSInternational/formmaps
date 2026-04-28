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

export function AssessmentProgressCard() {
  const { user } = useGlobalStore();
  const { t } = useTranslation();

  const {
    data: assessmentData,
    isLoading: loading,
    error,
  } = useDashboardAssessmentSummary(user?.id || "");

  const getAssessmentIcon = (type: string) => {
    switch (type) {
      case "pca":
        return <Brain className="w-5 h-5 text-indigo-600" />;
      case "mil":
        return <Target className="w-5 h-5 text-violet-600" />;
      case "evaluation":
        return <Users className="w-5 h-5 text-amber-600" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "in_progress":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-secondary text-muted-foreground border-border";
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="dash-card p-8 pb-6" role="status">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-secondary rounded w-1/3" />
            <div className="h-4 bg-secondary rounded w-1/2" />
            <div className="h-16 bg-secondary rounded-xl" />
          </div>
        </div>
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
      <div className="dash-card p-8 pb-6 h-full flex flex-col justify-between">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-semibold text-foreground tracking-tight leading-none mb-1.5">
              {t("dashboard.assessmentJourney")}
            </h3>
            <p className="text-sm text-muted-foreground leading-none">
              {t("dashboard.assessmentSubtitle")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-foreground tracking-tighter tabular-nums">
              {assessmentData.overallCompletion}%
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div
            className="w-full bg-secondary rounded-full h-2 overflow-hidden"
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
              className="bg-foreground h-full rounded-full"
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-muted-foreground font-medium px-1">
            <span>{t("common.start")}</span>
            <span>{t("dashboard.professionalCertified")}</span>
          </div>
        </div>

        {/* Individual Assessments */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="list">
          {assessmentData.assessments.map((assessment: any, index: number) => (
            <motion.div
              key={assessment.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="group flex flex-col p-4 rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors"
              role="listitem"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    assessment.type === "pca"
                      ? "bg-indigo-100"
                      : assessment.type === "mil"
                        ? "bg-violet-100"
                        : "bg-amber-100",
                  )}
                  aria-hidden="true"
                >
                  {getAssessmentIcon(assessment.type)}
                </div>
                {assessment.status === "completed" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground mt-1 tabular-nums">
                    {assessment.completion}%
                  </span>
                )}
              </div>

              <div>
                <div className="font-semibold text-foreground text-sm leading-tight flex-1 line-clamp-1 mb-2">
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
        <div className="mt-8 pt-5 border-t border-border flex justify-end">
          <a
            href="/dashboard/assessments"
            className="group flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]"
          >
            <span>Continue Assessment</span>
            <Clock className="w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
