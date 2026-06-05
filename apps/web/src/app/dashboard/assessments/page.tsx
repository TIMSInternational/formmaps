"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import { useDashboardAssessmentSummary } from "@/hooks/useAssessmentQueries";
import { useEvaluationGroups } from "@/hooks/useAssessmentQueries";
import { useAssessmentCache } from "@/contexts/AssessmentCacheContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { retryPendingSubmissions } from "@/services/milService";
import { getSelfEvaluationUrl } from "@/services/evaluationService";
import {
  Brain,
  Target,
  Users,
  CheckCircle2,
  Circle,
  ArrowRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssessmentsPage() {
  const { user, language } = useGlobalStore();
  const { t } = useTranslation();
  const router = useRouter();
  const { hasPCA, isCompleted } = usePCAData();
  const { isLoading } = useEvaluationData();
  const { invalidateSpecificAssessment } = useAssessmentCache();
  const [isStartingEvaluation, setIsStartingEvaluation] = useState(false);

  useEffect(() => {
    retryPendingSubmissions().catch(() => {});
  }, []);

  const {
    data: assessmentProgress,
    isLoading: loadingProgress,
  } = useDashboardAssessmentSummary(user?.id || "");

  const {
    data: evaluationGroups,
    isLoading: loadingGroups,
  } = useEvaluationGroups(user?.id || "");

  const pcaStatus = !hasPCA ? "not_started" : !isCompleted ? "in_progress" : "completed";

  const handleStart360Evaluation = async () => {
    try {
      setIsStartingEvaluation(true);
      const selfEval = await getSelfEvaluationUrl(
        user?.id || "",
        user?.name || "Self",
        user?.email || "",
        language
      );
      if (selfEval) {
        invalidateSpecificAssessment(user?.id || "", "evaluation");
        router.push(selfEval.url);
      } else {
        toast.error("Failed to create self evaluation. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to start evaluation. Please try again.");
    } finally {
      setIsStartingEvaluation(false);
    }
  };

  const liaAssessment = assessmentProgress?.assessments?.find((a: { type: string }) => a.type === "mil");
  const evaluationAssessment = assessmentProgress?.assessments?.find((a: { type: string }) => a.type === "evaluation");

  const assessments = [
    {
      key: "pca",
      icon: Brain,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: t("dashboard.pcaTitle"),
      description: t("dashboard.pcaDescription"),
      status: pcaStatus,
      href: pcaStatus === "completed" ? "/dashboard/assessments/pca?showResults=true" : "/dashboard/assessments/pca",
      actionLabel: pcaStatus === "completed" ? t("dashboard.viewResults") : pcaStatus === "in_progress" ? t("dashboard.continuePCA") : t("dashboard.startPCA"),
      isLink: true,
    },
    {
      key: "lia",
      icon: Target,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
      title: t("dashboard.liaTitle"),
      description: t("dashboard.liaDescription"),
      status: liaAssessment?.status || "not_started",
      href: (liaAssessment?.status === "completed") ? "/dashboard/assessments/lia/results" : "/dashboard/assessments/lia",
      actionLabel: liaAssessment?.status === "completed" ? t("dashboard.viewResults") : liaAssessment?.status === "in_progress" ? t("dashboard.continueLIA") : t("dashboard.startLIA"),
      isLink: true,
    },
    {
      key: "360",
      icon: Users,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-600",
      title: t("dashboard.evaluationTitle"),
      description: t("dashboard.evaluationDescription"),
      status: evaluationAssessment?.status || "not_started",
      href: "/dashboard/assessments/evaluation",
      actionLabel: evaluationAssessment?.status === "completed"
        ? t("dashboard.viewResults")
        : evaluationAssessment?.status === "in_progress"
        ? t("dashboard.continue360", "Continue Evaluation")
        : t("dashboard.inviteEvaluators"),
      isLink: true,
    },
  ];

  const completedCount = assessments.filter((a) => a.status === "completed").length;

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {t("dashboard.professionalAssessments")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {t("dashboard.assessmentsDescription")}
        </p>
      </motion.div>

      {/* Loading */}
      {(loadingProgress || isLoading) && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!loadingProgress && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4"
        >
          {/* Progress summary */}
          <div className="dash-card p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-foreground">
                {t("dashboard.overallProgress", "Overall Progress")}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedCount}/3 {t("dashboard.completed")}
              </span>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i < completedCount ? "bg-emerald-500" : "bg-secondary"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Assessment cards — vertical list */}
          <div className="space-y-3">
            {assessments.map((assessment, idx) => {
              const isDone = assessment.status === "completed";
              const isActive = assessment.status === "in_progress";
              const Icon = assessment.icon;

              return (
                <motion.div
                  key={assessment.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + idx * 0.05 }}
                >
                  <Link
                    href={assessment.href}
                    className={cn(
                      "dash-card p-4 flex items-center gap-4 transition-all group",
                      isDone
                        ? "border-emerald-200/60 hover:border-emerald-300"
                        : "hover:border-foreground/20"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", assessment.iconBg)}>
                      <Icon className={cn("w-5 h-5", assessment.iconColor)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {assessment.title}
                        </h3>
                        <span className={cn(
                          "text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border shrink-0",
                          isDone
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : isActive
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-secondary text-muted-foreground border-border"
                        )}>
                          {isDone ? t("dashboard.statusCompleted") :
                           isActive ? t("dashboard.statusInProgress") :
                           t("dashboard.statusNotStarted")}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
                        {assessment.description}
                      </p>
                    </div>

                    {/* Status icon + arrow */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                      ) : (
                        <Circle className={cn("w-4 h-4", isActive ? "text-amber-400" : "text-muted-foreground/25")} />
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* 360° quick actions */}
          {(() => {
            const selfGroup = evaluationGroups?.find(
              (g) => g.relation === "Self" || (g.groupType === "Parent" && g.relation === "Self")
            );
            const selfCompleted = selfGroup?.isEvaluationCompleted === true;

            return evaluationAssessment?.status !== "completed" && (
              <div className="dash-card p-4">
                <p className="text-xs font-semibold text-foreground mb-3">
                  {t("dashboard.evaluationTitle")} — {t("dashboard.quickActions", "Quick Actions")}
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/dashboard/assessments/evaluation"
                    className="flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold bg-card border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {t("dashboard.inviteEvaluators")}
                  </Link>
                  {selfCompleted ? (
                    <div className="flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("dashboard.selfEvaluationCompleted", "Self-Evaluation Done")}
                    </div>
                  ) : (
                    <button
                      disabled={
                        isStartingEvaluation ||
                        loadingGroups
                      }
                      onClick={handleStart360Evaluation}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors",
                        !isStartingEvaluation && !loadingGroups
                          ? "bg-foreground text-background hover:bg-foreground/90"
                          : "bg-secondary text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      {isStartingEvaluation || loadingGroups
                        ? t("dashboard.loading")
                        : t("dashboard.start360Evaluation")}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </motion.div>
      )}
    </div>
  );
}
