"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  getAllMILExams,
  MILExamMetadata,
  getAllUserExamResults,
  getUserExamHistory,
  getUserProgressSummary,
  UserExamResult,
  UserProgressSummary,
  retryPendingSubmissions,
} from "@/services/milService";
import {
  getUserEvaluationGroups,
  getUserEvaluationProgressSummary,
  EvaluationGroupProgress,
  UserEvaluationProgress,
} from "@/services/evaluationService";
import MILInstructions from "./_components/MILInstructions";
import MILExamRunner from "./_components/MILExamRunner";
import MILCompletion from "./_components/MILCompletion";
import MILSubtestCompletion from "./_components/MILSubtestCompletion";
import {
  EvaluationSession,
  EvaluationResponse,
  EvaluatorGroup,
} from "@/services/evaluationService";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Lightbulb,
  Users,
  CheckCircle2,
  Clock,
  HelpCircle,
} from "lucide-react";

type AssessmentType = "mil" | "360-evaluation";
type AssessmentStep =
  | "selection"
  | "overview"
  | "instructions"
  | "exam"
  | "subtest-completed"
  | "completed"
  | "evaluator-management"
  | "evaluation-form"
  | "evaluation-completed";

export default function MILAssessmentPage() {
  const { t } = useTranslation();
  const { language } = useGlobalStore();
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("mil");
  const [currentStep, setCurrentStep] = useState<AssessmentStep>("overview");
  const [exams, setExams] = useState<MILExamMetadata[]>([]);
  const [currentExamIndex, setCurrentExamIndex] = useState(0);
  const [completedExams, setCompletedExams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Progress data states
  const [liaProgress, setLiaProgress] = useState<UserProgressSummary | null>(
    null
  );
  const [evaluationProgress, setEvaluationProgress] = useState<
    EvaluationGroupProgress[]
  >([]);
  const [progressLoading, setProgressLoading] = useState(true);

  // Get current user ID from localStorage or token
  const getCurrentUserId = (): string => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return (
          payload[
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
          ] || "unknown"
        );
      }
    } catch (error) {
      // error handled silently
    }
    return "unknown";
  };

  const loadProgressData = async () => {
    try {
      setProgressLoading(true);
      const userId = getCurrentUserId();

      // Load LIA progress
      const liaResults = await getAllUserExamResults(language);
      const liaProgressSummary = getUserProgressSummary(liaResults);
      setLiaProgress(liaProgressSummary);

      // Load 360° Evaluation progress
      const evaluationGroups = await getUserEvaluationGroups(userId, language);
      setEvaluationProgress(evaluationGroups);

    } catch (error) {
      // error handled silently
    } finally {
      setProgressLoading(false);
    }
  };

  useEffect(() => {
    retryPendingSubmissions().catch(() => {});
  }, []);

  useEffect(() => {
    loadExams();
    loadProgress();
    loadProgressData();
  }, [language]);

  const loadExams = async () => {
    try {
      setLoading(true);
      const examData = await getAllMILExams(language);
      setExams(examData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exams");
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = () => {
    const saved = localStorage.getItem("mil_completed_exams");
    if (saved) {
      setCompletedExams(JSON.parse(saved));
    }
  };

  const saveProgress = (examId: string) => {
    const updated = [...completedExams, examId];
    setCompletedExams(updated);
    localStorage.setItem("mil_completed_exams", JSON.stringify(updated));
  };

  const handleStartExam = (examIndex: number) => {
    setCurrentExamIndex(examIndex);
    setCurrentStep("instructions");
  };

  const handleStartTest = () => {
    setCurrentStep("exam");
  };

  const handleExamComplete = () => {
    const currentExam = exams[currentExamIndex];
    saveProgress(currentExam.id);

    // Always go to subtest completion screen first
    setCurrentStep("subtest-completed");
  };

  const handleContinueToNext = () => {
    // Check if all exams are completed
    if (currentExamIndex < exams.length - 1) {
      setCurrentExamIndex(currentExamIndex + 1);
      setCurrentStep("instructions");
    } else {
      setCurrentStep("completed");
    }
  };

  const handleViewResults = () => {
    window.location.href = "/dashboard/assessments/mil/results";
  };

  const handleReturnToDashboard = () => {
    window.location.href = "/dashboard";
  };

  const handleReturnToDashboardFromSubtest = () => {
    // Progress is already saved, just navigate
    window.location.href = "/dashboard";
  };

  const handleBackToOverview = () => {
    setCurrentStep("overview");
  };

  if (loading && assessmentType === "mil") {
    return (
      <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading LIA Assessment...</p>
        </div>
      </div>
    );
  }

  if (error && assessmentType === "mil") {
    return (
      <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Failed to Load Assessment
          </h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={loadExams}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // MIL Assessment Overview Screen
  if (currentStep === "overview") {
    return (
      <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Link
            href="/dashboard/assessments"
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("dashboard.assessments", "Assessments")}
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t("dashboard.liaTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[52ch]">
            {t("dashboard.liaAssessmentDescription")}
          </p>
        </motion.header>

        <div className="space-y-5 max-w-4xl">
          {/* Progress Overview Section */}
          {!progressLoading &&
            (liaProgress || evaluationProgress.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="dash-card p-5"
              >
                <h2 className="text-base font-semibold text-foreground mb-4">
                  {t("dashboard.assessmentProgressOverview")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LIA Progress */}
                  {liaProgress && (
                    <div className="p-4 rounded-xl bg-secondary border border-border">
                      <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                          <Lightbulb className="w-4 h-4 text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-foreground">
                          {t("dashboard.liaProgress")}
                        </h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("dashboard.totalSubAssessments")}:
                          </span>
                          <span className="font-medium text-foreground">
                            {liaProgress.totalAttempts}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("dashboard.completed")}:
                          </span>
                          <span className="font-medium text-foreground">
                            {liaProgress.completedExams}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("dashboard.bestScore")}:
                          </span>
                          <span className="font-medium text-foreground">
                            {liaProgress.bestScore.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("dashboard.averageScore")}:
                          </span>
                          <span className="font-medium text-foreground">
                            {liaProgress.averageScore.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 360 Evaluation Progress */}
                  <div className="p-4 rounded-xl bg-secondary border border-border">
                    <div className="flex items-center mb-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mr-3">
                        <Users className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h3 className="font-semibold text-foreground">
                        {t("dashboard.360Evaluations")}
                      </h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      {evaluationProgress.length > 0 ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("dashboard.totalGroups")}:
                            </span>
                            <span className="font-medium text-foreground">
                              {evaluationProgress.length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("dashboard.completed")}:
                            </span>
                            <span className="font-medium text-foreground">
                              {
                                evaluationProgress.filter(
                                  (g) => g.isEvaluationCompleted
                                ).length
                              }
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("dashboard.pending")}:
                            </span>
                            <span className="font-medium text-foreground">
                              {
                                evaluationProgress.filter(
                                  (g) =>
                                    !g.isEvaluationCompleted &&
                                    new Date(g.tokenExpiryDate) > new Date()
                                ).length
                              }
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expired:</span>
                            <span className="font-medium text-foreground">
                              {
                                evaluationProgress.filter(
                                  (g) =>
                                    !g.isEvaluationCompleted &&
                                    new Date(g.tokenExpiryDate) <= new Date()
                                ).length
                              }
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground italic">
                          No evaluation groups created yet
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          {progressLoading && (
            <div className="dash-card p-5">
              <div className="flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                <span className="text-muted-foreground text-sm">
                  Loading progress data...
                </span>
              </div>
            </div>
          )}

          {/* Subtests Overview */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="dash-card p-5"
          >
            <h2 className="text-base font-semibold text-foreground mb-4">Subtests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {exams.map((exam, index) => {
                const isCompleted = completedExams.includes(exam.id);
                const isNext = index === completedExams.length;

                return (
                  <div
                    key={exam.id}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isCompleted
                        ? "border-emerald-200 bg-emerald-50/50"
                        : isNext
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-foreground">{exam.name}</h3>
                      {isCompleted && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {exam.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {exam.timeLimitMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        {exam.totalQuestions} questions
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Progress Bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="dash-card p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Progress
              </span>
              <span className="text-sm text-muted-foreground">
                {completedExams.length}/{exams.length} subtests completed
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-100"
                style={{
                  width: `${(completedExams.length / exams.length) * 100}%`,
                }}
              />
            </div>
          </motion.div>

          {/* Action Button */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            {completedExams.length < exams.length ? (
              <button
                onClick={() => handleStartExam(completedExams.length)}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-8 py-3 font-medium text-base transition-colors"
              >
                {completedExams.length === 0
                  ? t("dashboard.startAssessment")
                  : t("dashboard.continueAssessment")}
              </button>
            ) : (
              <div className="dash-card p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground">
                      Assessment Complete!
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      You have completed all MIL subtests.
                    </p>
                  </div>
                  <a
                    href="/dashboard"
                    className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-2 text-sm font-medium transition-colors"
                  >
                    Return to Dashboard
                  </a>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Instructions Screen
  if (currentStep === "instructions") {
    return (
      <MILInstructions
        exam={exams[currentExamIndex]}
        onStart={handleStartTest}
        onBack={() => setCurrentStep("overview")}
      />
    );
  }

  // Exam Screen
  if (currentStep === "exam") {
    return (
      <MILExamRunner
        examId={exams[currentExamIndex].id as any}
        onComplete={handleExamComplete}
        onBack={() => setCurrentStep("overview")}
      />
    );
  }

  // Subtest Completion Screen
  if (currentStep === "subtest-completed") {
    return (
      <MILSubtestCompletion
        completedExam={exams[currentExamIndex]}
        currentIndex={currentExamIndex}
        totalExams={exams.length}
        onContinue={handleContinueToNext}
        onReturnToDashboard={handleReturnToDashboardFromSubtest}
      />
    );
  }

  // Final Completion Screen
  if (currentStep === "completed") {
    return (
      <MILCompletion
        onViewResults={handleViewResults}
        onReturnToDashboard={handleReturnToDashboard}
      />
    );
  }

  return null;
}
