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
      console.warn("Could not extract user ID from token:", error);
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

      console.log("🔄 Progress Data Loaded:", {
        liaResults: liaResults.length,
        liaProgress: liaProgressSummary,
        evaluationGroups: evaluationGroups.length,
      });
    } catch (error) {
      console.error("Failed to load progress data:", error);
    } finally {
      setProgressLoading(false);
    }
  };

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading LIA Assessment...</p>
        </div>
      </div>
    );
  }

  if (error && assessmentType === "mil") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Failed to Load Assessment
          </h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadExams}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm border p-8 text-center"
          >
            {/* Header */}
            <div className="mb-8">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-10 h-10 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {t("dashboard.liaTitle")}
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                {t("dashboard.liaAssessmentDescription")}
              </p>
            </div>

            {/* Progress Overview Section */}
            {!progressLoading &&
              (liaProgress || evaluationProgress.length > 0) && (
                <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 text-left">
                    {t("dashboard.assessmentProgressOverview")}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* LIA Progress */}
                    {liaProgress && (
                      <div className="bg-white p-4 rounded-lg border">
                        <div className="flex items-center mb-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <svg
                              className="w-4 h-4 text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                              />
                            </svg>
                          </div>
                          <h3 className="font-semibold text-gray-900">
                            {t("dashboard.liaProgress")}
                          </h3>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              {t("dashboard.totalSubAssessments")}:
                            </span>
                            <span className="font-medium">
                              {liaProgress.totalAttempts}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              {t("dashboard.completed")}:
                            </span>
                            <span className="font-medium">
                              {liaProgress.completedExams}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              {t("dashboard.bestScore")}:
                            </span>
                            <span className="font-medium">
                              {liaProgress.bestScore.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              {t("dashboard.averageScore")}:
                            </span>
                            <span className="font-medium">
                              {liaProgress.averageScore.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 360° Evaluation Progress */}
                    <div className="bg-white p-4 rounded-lg border">
                      <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                          <svg
                            className="w-4 h-4 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-gray-900">
                          {t("dashboard.360Evaluations")}
                        </h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        {evaluationProgress.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                {t("dashboard.totalGroups")}:
                              </span>
                              <span className="font-medium">
                                {evaluationProgress.length}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                {t("dashboard.completed")}:
                              </span>
                              <span className="font-medium">
                                {
                                  evaluationProgress.filter(
                                    (g) => g.isEvaluationCompleted
                                  ).length
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                {t("dashboard.pending")}:
                              </span>
                              <span className="font-medium">
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
                              <span className="text-gray-600">Expired:</span>
                              <span className="font-medium">
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
                          <p className="text-gray-500 italic">
                            No evaluation groups created yet
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {progressLoading && (
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span className="text-gray-600">
                    Loading progress data...
                  </span>
                </div>
              </div>
            )}

            {/* Subtests Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {exams.map((exam, index) => {
                const isCompleted = completedExams.includes(exam.id);
                const isNext = index === completedExams.length;

                return (
                  <div
                    key={exam.id}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isCompleted
                        ? "border-green-200 bg-green-50"
                        : isNext
                        ? "border-blue-200 bg-blue-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{exam.name}</h3>
                      {isCompleted && (
                        <svg
                          className="w-5 h-5 text-green-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {exam.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{exam.timeLimitMinutes} min</span>
                      <span>{exam.totalQuestions} questions</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Progress
                </span>
                <span className="text-sm text-gray-600">
                  {completedExams.length}/{exams.length} subtests completed
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-100"
                  style={{
                    width: `${(completedExams.length / exams.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Action Button */}
            {completedExams.length < exams.length ? (
              <button
                onClick={() => handleStartExam(completedExams.length)}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
              >
                {completedExams.length === 0
                  ? t("dashboard.startAssessment")
                  : t("dashboard.continueAssessment")}
              </button>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Assessment Complete!
                </h3>
                <p className="text-gray-600 mb-4">
                  You have completed all MIL subtests.
                </p>
                <a
                  href="/dashboard"
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Return to Dashboard
                </a>
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
