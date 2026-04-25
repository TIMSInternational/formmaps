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
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Sparkles,
  BookOpen,
  Layout,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AssessmentsPage() {
  const { user, language } = useGlobalStore();
  const { t } = useTranslation();
  const { pcaData, hasPCA, isCompleted } = usePCAData();
  const { isLoading } = useEvaluationData();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const { invalidateSpecificAssessment } = useAssessmentCache();
  const [isStartingEvaluation, setIsStartingEvaluation] = useState(false);
  
  // Use React Query for assessment progress
  const {
    data: assessmentProgress,
    isLoading: loadingProgress,
    error: progressError,
  } = useDashboardAssessmentSummary(user?.id || "");

  // Fetch evaluation groups for evaluators
  const {
    data: evaluationGroups,
    isLoading: loadingGroups,
    error: groupsError,
  } = useEvaluationGroups(user?.id || "");

  const getPCAStatus = () => {
    if (!hasPCA) return "not_started";
    if (hasPCA && !isCompleted) return "in_progress";
    return "completed";
  };

  const pcaStatus = getPCAStatus();

  const handleInviteEvaluators = async () => {
    try {
      window.location.href = "/dashboard/assessments/evaluators";
    } catch (error) {
      // error handled silently
    }
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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {t("dashboard.professionalAssessments")}
              </h1>
              <p className="mt-2 text-gray-600 max-w-2xl text-lg">
                {t("dashboard.assessmentsDescription")}
              </p>
            </div>
            
            {!loadingProgress && assessmentProgress && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4 min-w-[240px]">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-gray-100"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={175.93}
                      strokeDashoffset={175.93 - (175.93 * assessmentProgress.overallCompletion) / 100}
                      className="text-blue-600 transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <span className="absolute text-sm font-bold text-gray-900">
                    {assessmentProgress.overallCompletion}%
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t("dashboard.overallProgress")}</p>
                  <p className="text-lg font-bold text-gray-900">
                    {assessmentProgress.completedAssessments}/{assessmentProgress.totalAssessments} {t("dashboard.completed")}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* 1. PCA Assessment Card */}
          <motion.div variants={item} className="flex flex-col h-full">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full group">
              <div className="p-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Brain className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium border",
                    pcaStatus === "completed" 
                      ? "bg-green-50 text-green-700 border-green-100"
                      : pcaStatus === "in_progress"
                      ? "bg-yellow-50 text-yellow-700 border-yellow-100"
                      : "bg-gray-50 text-gray-600 border-gray-100"
                  )}>
                    {pcaStatus === "completed" ? t("dashboard.statusCompleted") : 
                     pcaStatus === "in_progress" ? t("dashboard.statusInProgress") : 
                     t("dashboard.statusNotStarted")}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {t("dashboard.pcaTitle")}
                </h3>
                <p className="text-gray-600 mb-6 text-sm leading-relaxed flex-1">
                  {t("dashboard.pcaDescription")}
                </p>

                {pcaStatus === "completed" && pcaData?.results?.data ? (
                  <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("dashboard.dominance")}</span>
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${pcaData.results.data.pcaD1 || 0}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("dashboard.influence")}</span>
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${pcaData.results.data.pcaI1 || 0}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("dashboard.steadiness")}</span>
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pcaData.results.data.pcaS1 || 0}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("dashboard.conscientiousness")}</span>
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pcaData.results.data.pcaC1 || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <a
                  href={pcaStatus === "completed" ? "/dashboard/assessments/pca?showResults=true" : "/dashboard/assessments/pca"}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium transition-all duration-200",
                    pcaStatus === "completed"
                      ? "bg-white border-2 border-gray-200 text-gray-700 hover:border-blue-600 hover:text-blue-600"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                  )}
                >
                  {pcaStatus === "completed" ? (
                    <>
                      <BookOpen className="w-4 h-4" />
                      {t("dashboard.viewResults")}
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      {pcaStatus === "in_progress" ? t("dashboard.continuePCA") : t("dashboard.startPCA")}
                    </>
                  )}
                </a>
              </div>
            </div>
          </motion.div>

          {/* 2. LIA Assessment Card */}
          <motion.div variants={item} className="flex flex-col h-full">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full group">
              <div className="p-1 bg-gradient-to-r from-purple-500 to-pink-500" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Target className="w-6 h-6 text-purple-600" />
                  </div>
                  {(() => {
                    const liaAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "mil");
                    const status = liaAssessment?.status || "not_started";
                    return (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium border",
                        status === "completed" 
                          ? "bg-green-50 text-green-700 border-green-100"
                          : status === "in_progress"
                          ? "bg-yellow-50 text-yellow-700 border-yellow-100"
                          : "bg-gray-50 text-gray-600 border-gray-100"
                      )}>
                        {status === "completed" ? t("dashboard.statusCompleted") : 
                         status === "in_progress" ? t("dashboard.statusInProgress") : 
                         t("dashboard.statusNotStarted")}
                      </span>
                    );
                  })()}
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {t("dashboard.liaTitle")}
                </h3>
                <p className="text-gray-600 mb-6 text-sm leading-relaxed flex-1">
                  {t("dashboard.liaDescription")}
                </p>

                {(() => {
                  const liaAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "mil");
                  const isCompleted = liaAssessment?.status === "completed";

                  return (
                    <a
                      href={isCompleted ? "/dashboard/assessments/mil/results" : "/dashboard/assessments/mil"}
                      className={cn(
                        "w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium transition-all duration-200",
                        isCompleted
                          ? "bg-white border-2 border-gray-200 text-gray-700 hover:border-purple-600 hover:text-purple-600"
                          : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"
                      )}
                    >
                      {isCompleted ? (
                        <>
                          <BookOpen className="w-4 h-4" />
                          {t("dashboard.viewResults")}
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          {liaAssessment?.status === "in_progress" ? t("dashboard.continueLIA") : t("dashboard.startLIA")}
                        </>
                      )}
                    </a>
                  );
                })()}
              </div>
            </div>
          </motion.div>

          {/* 3. 360 Evaluation Card */}
          <motion.div variants={item} className="flex flex-col h-full">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full group">
              <div className="p-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Users className="w-6 h-6 text-orange-600" />
                  </div>
                  {(() => {
                    const evaluationAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "evaluation");
                    const status = evaluationAssessment?.status || "not_started";
                    return (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium border",
                        status === "completed" 
                          ? "bg-green-50 text-green-700 border-green-100"
                          : status === "in_progress"
                          ? "bg-yellow-50 text-yellow-700 border-yellow-100"
                          : "bg-gray-50 text-gray-600 border-gray-100"
                      )}>
                        {status === "completed" ? t("dashboard.statusCompleted") : 
                         status === "in_progress" ? t("dashboard.statusInProgress") : 
                         t("dashboard.statusNotStarted")}
                      </span>
                    );
                  })()}
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {t("dashboard.evaluationTitle")}
                </h3>
                <p className="text-gray-600 mb-6 text-sm leading-relaxed flex-1">
                  {t("dashboard.evaluationDescription")}
                </p>

                {(() => {
                  const evaluationAssessment = assessmentProgress?.assessments?.find((a: any) => a.type === "evaluation");
                  const isCompleted = evaluationAssessment?.status === "completed";

                  if (isCompleted) {
                    return (
                      <a
                        href="/dashboard/assessments/evaluation/results"
                        className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium bg-white border-2 border-gray-200 text-gray-700 hover:border-orange-600 hover:text-orange-600 transition-all duration-200"
                      >
                        <BookOpen className="w-4 h-4" />
                        {t("dashboard.viewResults")}
                      </a>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <button
                        onClick={handleInviteEvaluators}
                        disabled={isLoading}
                        className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium bg-white border-2 border-orange-100 text-orange-700 hover:bg-orange-50 transition-all duration-200"
                      >
                        <Users className="w-4 h-4" />
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
                          "w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium transition-all duration-200",
                          evaluationAssessment?.status === "in_progress" && !isStartingEvaluation && !loadingGroups
                            ? "bg-orange-600 text-white hover:bg-orange-700 shadow-lg shadow-orange-600/20"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                      >
                        <Activity className="w-4 h-4" />
                        {isStartingEvaluation || loadingGroups
                          ? t("dashboard.loading")
                          : t("dashboard.start360Evaluation")}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Guide Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {t("dashboard.assessmentGuide")}
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-500" />
                  {t("dashboard.pcaAssessmentTitle")}
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.pcaDuration")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.pcaEvaluates")}</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-500" />
                  {t("dashboard.liaAssessmentTitle")}
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <Layout className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.liaSubtests")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.liaDuration")}</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  {t("dashboard.evaluationAssessmentTitle")}
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.evaluationFeedback")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Activity className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{t("dashboard.evaluationSelfAssessment")}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
