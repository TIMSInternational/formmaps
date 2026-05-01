"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import { useDashboardAssessmentSummary } from "@/hooks/useAssessmentQueries";
import { useEvaluationGroups } from "@/hooks/useAssessmentQueries";
import { useAssessmentCache } from "@/contexts/AssessmentCacheContext";
import { useState } from "react";
import { toast } from "sonner";
import {
  getUserEvaluationGroups,
  createEvaluationGroup,
} from "@/services/evaluationService";
import {
  Brain,
  Target,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  BookOpen,
  Layout,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state/EmptyState";

export default function AssessmentsPage() {
  const { user, language } = useGlobalStore();
  const { t } = useTranslation();
  const { pcaData, hasPCA, isCompleted } = usePCAData();
  const { isLoading } = useEvaluationData();
  const { invalidateSpecificAssessment } = useAssessmentCache();
  const [isStartingEvaluation, setIsStartingEvaluation] = useState(false);

  const {
    data: assessmentProgress,
    isLoading: loadingProgress,
  } = useDashboardAssessmentSummary(user?.id || "");

  const {
    data: evaluationGroups,
    isLoading: loadingGroups,
  } = useEvaluationGroups(user?.id || "");

  const getPCAStatus = () => {
    if (!hasPCA) return "not_started";
    if (hasPCA && !isCompleted) return "in_progress";
    return "completed";
  };

  const pcaStatus = getPCAStatus();

  const handleInviteEvaluators = async () => {
    window.location.href = "/dashboard/assessments/evaluators";
  };

  const handleStart360Evaluation = async () => {
    try {
      setIsStartingEvaluation(true);
      let groups = evaluationGroups;
      if (!groups) {
        groups = await getUserEvaluationGroups(user?.id || "", language);
      }

      let selfGroup = groups?.find(
        (group) => group.groupType === "Parent" && group.relation === "Self"
      );

      if (!selfGroup || !selfGroup.id) {
        selfGroup = await createEvaluationGroup({
          evaluatorName: user?.name || "Self",
          evaluatorEmail: user?.email || "",
          relation: "Self",
          groupType: "Parent",
          evaluatedUserId: user?.id || "",
        });
      }

      if (selfGroup && selfGroup.id) {
        invalidateSpecificAssessment(user?.id || "", "evaluation");
        window.location.href = `/evaluation/evaluator?t=${selfGroup.id}`;
      } else {
        toast.error("Failed to create self evaluation. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to start evaluation. Please try again.");
    } finally {
      setIsStartingEvaluation(false);
    }
  };

  const liaAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "mil");
  const evaluationAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "evaluation");

  const completedCount = assessmentProgress?.assessments?.filter((a: any) => a.status === "completed").length ?? 0;
  const totalCount = assessmentProgress?.assessments?.length ?? 3;

  const getStatusBadge = (status: string) => (
    <span className={cn(
      "text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border",
      status === "completed"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : status === "in_progress"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-secondary text-muted-foreground border-border"
    )}>
      {status === "completed" ? t("dashboard.statusCompleted") :
       status === "in_progress" ? t("dashboard.statusInProgress") :
       t("dashboard.statusNotStarted")}
    </span>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8"
      >
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2 block">
            {t("dashboard.assessments", "Assessments")}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t("dashboard.professionalAssessments")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[52ch]">
            {t("dashboard.assessmentsDescription")}
          </p>
        </div>

        {!loadingProgress && assessmentProgress && (
          <div className="flex items-center gap-2.5 flex-wrap md:pb-0.5">
            <div className="px-3.5 py-2 rounded-full bg-card border border-border flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-foreground shrink-0" />
              <span className="text-[11px] font-semibold text-foreground tabular-nums">
                {completedCount}/{totalCount} {t("dashboard.completed")}
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-full bg-card border border-border flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[11px] font-semibold text-foreground tabular-nums">
                {assessmentProgress.overallCompletion}%
              </span>
            </div>
          </div>
        )}
      </motion.header>

      <div className="space-y-5">
        {/* Loading state */}
        {(loadingProgress || isLoading) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[200px] rounded-xl" />
            ))}
          </div>
        )}

        {/* Assessment Cards — 3 columns */}
        {!loadingProgress && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* PCA Card */}
          <Link
            href={pcaStatus === "completed" ? "/dashboard/assessments/pca?showResults=true" : "/dashboard/assessments/pca"}
            className="dash-card p-5 flex flex-col gap-4 hover:border-foreground/20 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
              {getStatusBadge(pcaStatus)}
            </div>

            <div>
              <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                {t("dashboard.pcaTitle")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {t("dashboard.pcaDescription")}
              </p>
            </div>

            {pcaStatus === "completed" && pcaData?.results?.data && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "D", value: pcaData.results.data.pcaD1, color: "bg-red-500" },
                  { label: "I", value: pcaData.results.data.pcaI1, color: "bg-yellow-500" },
                  { label: "S", value: pcaData.results.data.pcaS1, color: "bg-green-500" },
                  { label: "C", value: pcaData.results.data.pcaC1, color: "bg-blue-500" },
                ].map((d) => (
                  <div key={d.label} className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-medium">{d.label}</span>
                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", d.color)} style={{ width: `${d.value || 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground flex items-center gap-1 transition-colors mt-auto">
              {pcaStatus === "completed" ? t("dashboard.viewResults") : pcaStatus === "in_progress" ? t("dashboard.continuePCA") : t("dashboard.startPCA")}
              <ArrowRight className="w-3 h-3" />
            </span>
          </Link>

          {/* LIA Card */}
          <Link
            href={(liaAssessment?.status === "completed") ? "/dashboard/assessments/mil/results" : "/dashboard/assessments/mil"}
            className="dash-card p-5 flex flex-col gap-4 hover:border-foreground/20 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              {getStatusBadge(liaAssessment?.status || "not_started")}
            </div>

            <div>
              <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                {t("dashboard.liaTitle")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {t("dashboard.liaDescription")}
              </p>
            </div>

            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground flex items-center gap-1 transition-colors mt-auto">
              {liaAssessment?.status === "completed" ? t("dashboard.viewResults") : liaAssessment?.status === "in_progress" ? t("dashboard.continueLIA") : t("dashboard.startLIA")}
              <ArrowRight className="w-3 h-3" />
            </span>
          </Link>

          {/* 360 Evaluation Card */}
          <div className="dash-card p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-orange-600" />
              </div>
              {getStatusBadge(evaluationAssessment?.status || "not_started")}
            </div>

            <div>
              <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                {t("dashboard.evaluationTitle")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {t("dashboard.evaluationDescription")}
              </p>
            </div>

            <div className="space-y-2 mt-auto">
              {evaluationAssessment?.status === "completed" ? (
                <Link
                  href="/dashboard/assessments/evaluation/results"
                  className="w-full py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold bg-secondary text-foreground hover:bg-border transition-colors border border-border"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {t("dashboard.viewResults")}
                </Link>
              ) : (
                <>
                  <button
                    onClick={handleInviteEvaluators}
                    disabled={isLoading}
                    className="w-full py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold bg-card border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {isLoading ? t("dashboard.loading") : t("dashboard.inviteEvaluators")}
                  </button>
                  <button
                    disabled={
                      evaluationAssessment?.status !== "in_progress" ||
                      isStartingEvaluation ||
                      loadingGroups
                    }
                    onClick={handleStart360Evaluation}
                    className={cn(
                      "w-full py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors",
                      evaluationAssessment?.status === "in_progress" && !isStartingEvaluation && !loadingGroups
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-secondary text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    {isStartingEvaluation || loadingGroups
                      ? t("dashboard.loading")
                      : t("dashboard.start360Evaluation")}
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
        )}

        {/* Assessment Guide */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="dash-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 bg-indigo-50 rounded-lg">
                <Sparkles className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {t("dashboard.assessmentGuide")}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: Brain, color: "text-blue-500", title: t("dashboard.pcaAssessmentTitle"), items: [
                  { icon: Clock, text: t("dashboard.pcaDuration") },
                  { icon: CheckCircle2, text: t("dashboard.pcaEvaluates") },
                ]},
                { icon: Target, color: "text-purple-500", title: t("dashboard.liaAssessmentTitle"), items: [
                  { icon: Layout, text: t("dashboard.liaSubtests") },
                  { icon: Clock, text: t("dashboard.liaDuration") },
                ]},
                { icon: Users, color: "text-orange-500", title: t("dashboard.evaluationAssessmentTitle"), items: [
                  { icon: Users, text: t("dashboard.evaluationFeedback") },
                  { icon: Activity, text: t("dashboard.evaluationSelfAssessment") },
                ]},
              ].map((section, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                    <section.icon className={cn("w-3.5 h-3.5", section.color)} />
                    {section.title}
                  </h4>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <item.icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
