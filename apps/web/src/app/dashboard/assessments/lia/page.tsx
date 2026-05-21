"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  getAllMILExams,
  MILExamMetadata,
  getMILResults,
  MILResultsData,
  UserProgressSummary,
  retryPendingSubmissions,
} from "@/services/milService";
import {
  getUserEvaluationGroups,
  EvaluationGroupProgress,
} from "@/services/evaluationService";
import MILInstructions from "./_components/MILInstructions";
import MILExamRunner from "./_components/MILExamRunner";
import MILCompletion from "./_components/MILCompletion";
import MILSubtestCompletion from "./_components/MILSubtestCompletion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
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
  const { user, language } = useGlobalStore();
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

  // Get current user ID from global store or token fallback
  const getCurrentUserId = (): string => {
    if (user?.id) return user.id;
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
    } catch {
      // fallback to unknown
    }
    return "unknown";
  };

  const loadProgressData = async () => {
    try {
      setProgressLoading(true);
      const userId = getCurrentUserId();

      // Load LIA progress from /api/v1/mil/results/{userId} — single source of truth
      const milResults = await getMILResults(userId);

      if (milResults && milResults.examResults?.length > 0) {
        const completed = milResults.examResults.filter(
          (e) => e.status === "completed"
        );

        setLiaProgress({
          totalAttempts: milResults.completedExams,
          completedExams: completed.length,
          averageScore: milResults.overallScore,
          bestScore:
            completed.length > 0
              ? Math.max(...completed.map((e) => e.scorePercentage ?? 0))
              : 0,
          examResults: [],
          examTypes: {},
        });

        // Sync completedExams state with API data so subtests cards show correctly
        const completedIds = completed.map((e) => e.examId);
        setCompletedExams((prev) => {
          if (completedIds.length > prev.length) {
            localStorage.setItem(
              "mil_completed_exams",
              JSON.stringify(completedIds)
            );
            return completedIds;
          }
          return prev;
        });
      } else {
        setLiaProgress({
          totalAttempts: 0,
          completedExams: 0,
          averageScore: 0,
          bestScore: 0,
          examResults: [],
          examTypes: {},
        });
      }

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
    window.location.href = "/dashboard/assessments/lia/results";
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading LIA Assessment...</p>
        </div>
      </div>
    );
  }

  if (error && assessmentType === "mil") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
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
    const allComplete = completedExams.length >= exams.length && exams.length > 0;

    return (
      <div className="max-w-4xl mx-auto py-6">
        {/* Back link */}
        <Link
          href="/dashboard/assessments"
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("dashboard.assessments", "Assessments")}
        </Link>

        {/* Header row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {t("dashboard.liaTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {t("dashboard.liaAssessmentDescription")}
            </p>
          </div>
          {allComplete && (
            <div className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700">
                {t("dashboard.allComplete", "All Complete")}
              </span>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4"
        >
          {/* Progress bar inline */}
          <div className="dash-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">Progress</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedExams.length}/{exams.length} subtests
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${exams.length > 0 ? (completedExams.length / exams.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Subtests — compact grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exams.map((exam, index) => {
              const isDone = completedExams.includes(exam.id) || index < completedExams.length;
              const isNext = !isDone && index === completedExams.length;

              return (
                <div
                  key={exam.id}
                  className={`p-3.5 rounded-xl border-2 transition-all ${
                    isDone
                      ? "border-emerald-200 bg-emerald-50/50"
                      : isNext
                      ? "border-blue-200 bg-blue-50/50"
                      : "border-border bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{exam.name}</h3>
                    {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mb-2">
                    {exam.description}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {exam.timeLimitMinutes} min
                    </span>
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" />
                      {exam.totalQuestions} q
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action */}
          {allComplete ? (
            <div className="dash-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">Assessment Complete!</h3>
                <p className="text-xs text-muted-foreground">All 5 cognitive subtests completed.</p>
              </div>
              <Link
                href="/dashboard/assessments/lia/results"
                className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-4 py-2 text-xs font-semibold transition-colors shrink-0"
              >
                View Results
              </Link>
            </div>
          ) : (
            <button
              onClick={() => handleStartExam(completedExams.length)}
              className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-xl px-6 py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {completedExams.length === 0
                ? t("dashboard.startAssessment")
                : t("dashboard.continueAssessment")}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // Instructions Screen
  if (currentStep === "instructions" && exams[currentExamIndex]) {
    return (
      <MILInstructions
        exam={exams[currentExamIndex]}
        onStart={handleStartTest}
        onBack={() => setCurrentStep("overview")}
      />
    );
  }

  // Exam Screen
  if (currentStep === "exam" && exams[currentExamIndex]) {
    return (
      <MILExamRunner
        examId={exams[currentExamIndex].id as any}
        onComplete={handleExamComplete}
        onBack={() => setCurrentStep("overview")}
      />
    );
  }

  // Subtest Completion Screen
  if (currentStep === "subtest-completed" && exams[currentExamIndex]) {
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
