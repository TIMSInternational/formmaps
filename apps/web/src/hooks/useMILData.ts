import { useState, useEffect } from "react";
import {
  getAllMILExams,
  MILExamMetadata,
  loadMILSession,
  getMILResults,
  MILResultsData,
  EnhancedUserExamHistory,
  ExamStatus,
} from "@/services/milService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";

export interface MILProgress {
  completedExams: string[];
  totalExams: number;
  isCompleted: boolean;
  lastUpdated: string;
  enhancedData?: EnhancedUserExamHistory;
  examStatuses?: {
    completed: ExamStatus[];
    inProgress: ExamStatus[];
    notStarted: ExamStatus[];
  };
}

/**
 * Normalize MILResultsData (from /api/v1/mil/results/{userId})
 * into EnhancedUserExamHistory shape used throughout the UI.
 */
function toEnhancedData(data: MILResultsData): EnhancedUserExamHistory {
  const completed = data.examResults.filter((e) => e.status === "completed");
  const inProgress = data.examResults.filter((e) => e.status === "in_progress");
  const notStarted = data.examResults.filter((e) => e.status === "not_started");

  return {
    userId: data.userId,
    username: "",
    totalExams: data.totalExams,
    completedExams: data.completedExams,
    inProgressExams: inProgress.length,
    notStartedExams: notStarted.length,
    completionPercentage:
      data.totalExams > 0 ? (data.completedExams / data.totalExams) * 100 : 0,
    examStatus: data.examResults.map((exam) => ({
      examId: exam.examId,
      examName: exam.examName,
      examType: 0,
      status: exam.status as "completed" | "in_progress" | "not_started",
      scorePercentage: exam.scorePercentage ?? 0,
      accuracyPercentage: exam.scorePercentage ?? 0,
      totalQuestions: exam.totalQuestions,
      correctAnswers: exam.correctAnswers ?? 0,
      incorrectAnswers: exam.incorrectAnswers ?? 0,
      totalTimeSpent: exam.timeSpent || "0:00",
      isTimeExpired: exam.isTimeExpired ?? false,
      timeLimitMinutes: exam.timeLimitMinutes,
      completionDate: exam.completedAt || undefined,
    })) as ExamStatus[],
  } as EnhancedUserExamHistory;
}

export function useMILData() {
  const { language, user: storeUser } = useGlobalStore();
  const [exams, setExams] = useState<MILExamMetadata[]>([]);
  const [progress, setProgress] = useState<MILProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getCurrentUserId = (): string => {
    if (storeUser?.id) return storeUser.id;
    return "unknown";
  };

  const loadMILData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load available exam metadata (for names, descriptions, question counts)
      const examData = await getAllMILExams(language);
      setExams(examData);

      const userId = getCurrentUserId();
      if (userId === "unknown") {
        setProgress(null);
        return;
      }

      // PRIMARY: Call /api/v1/mil/results/{userId} — single source of truth
      const milResults = await getMILResults(userId);

      if (milResults && milResults.examResults?.length > 0) {
        const enhancedData = toEnhancedData(milResults);
        const completedIds = milResults.examResults
          .filter((e) => e.status === "completed")
          .map((e) => e.examId);
        const completedExamStatuses = enhancedData.examStatus.filter(
          (e) => e.status === "completed"
        );
        const inProgressExamStatuses = enhancedData.examStatus.filter(
          (e) => e.status === "in_progress"
        );
        const notStartedExamStatuses = enhancedData.examStatus.filter(
          (e) => e.status === "not_started"
        );

        // Sync localStorage so the MIL overview page stays in sync
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "mil_completed_exams",
            JSON.stringify(completedIds)
          );
        }

        setProgress({
          completedExams: completedIds,
          totalExams: milResults.totalExams,
          isCompleted: milResults.completedExams >= milResults.totalExams,
          lastUpdated: new Date().toISOString(),
          enhancedData,
          examStatuses: {
            completed: completedExamStatuses,
            inProgress: inProgressExamStatuses,
            notStarted: notStartedExamStatuses,
          },
        });
        return;
      }

      // No API data — user hasn't taken any exams yet
      setProgress({
        completedExams: [],
        totalExams: examData.length || 5,
        isCompleted: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MIL data");
    } finally {
      setLoading(false);
    }
  };

  const markExamCompleted = (examId: string) => {
    if (!progress) return;

    const updatedCompleted = [...progress.completedExams, examId];
    const updatedProgress: MILProgress = {
      ...progress,
      completedExams: updatedCompleted,
      isCompleted: updatedCompleted.length === progress.totalExams,
      lastUpdated: new Date().toISOString(),
    };

    setProgress(updatedProgress);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "mil_completed_exams",
        JSON.stringify(updatedCompleted)
      );
    }
  };

  const clearMILProgress = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("mil_completed_exams");
    exams.forEach((exam) => {
      localStorage.removeItem(`mil_session_${exam.id}`);
    });

    setProgress({
      completedExams: [],
      totalExams: exams.length,
      isCompleted: false,
      lastUpdated: new Date().toISOString(),
    });
  };

  const getExamProgress = (examId: string) => {
    const session = loadMILSession(examId);
    return {
      isStarted: !!session,
      isCompleted: session?.isCompleted || false,
      currentQuestion: session?.currentQuestion || 0,
      totalAnswers: session?.answers.length || 0,
    };
  };

  const getOverallScore = () => {
    if (progress?.enhancedData) {
      const completedExams = progress.enhancedData.examStatus.filter(
        (exam) => exam.status === "completed"
      );
      if (completedExams.length > 0) {
        const totalScore = completedExams.reduce(
          (sum, exam) => sum + exam.scorePercentage,
          0
        );
        return Math.round(totalScore / completedExams.length);
      }
    }

    if (!progress || progress.completedExams.length === 0 || progress.totalExams === 0) return 0;
    return Math.round(
      (progress.completedExams.length / progress.totalExams) * 100
    );
  };

  const getExamResults = () => {
    return progress?.enhancedData?.examStatus || [];
  };

  const getCompletionStats = () => {
    if (!progress?.examStatuses) {
      return {
        completed: progress?.completedExams.length || 0,
        inProgress: 0,
        notStarted:
          (progress?.totalExams || 0) - (progress?.completedExams.length || 0),
        total: progress?.totalExams || 0,
      };
    }

    return {
      completed: progress.examStatuses.completed.length,
      inProgress: progress.examStatuses.inProgress.length,
      notStarted: progress.examStatuses.notStarted.length,
      total: progress.totalExams,
    };
  };

  const getSubtestScores = () => {
    if (!progress?.enhancedData?.examStatus) return [];

    const examColorMap: { [key: string]: string } = {
      "Pattern Recognition": "#8B5CF6",
      "Verbal Reasoning": "#06B6D4",
      "Working Memory": "#10B981",
      "Numeric Velocity": "#F59E0B",
      "Visual Rotation": "#EF4444",
    };

    return progress.enhancedData.examStatus
      .filter((exam) => exam.status === "completed")
      .map((exam) => ({
        name: exam.examName,
        score: Math.round(exam.scorePercentage),
        color: examColorMap[exam.examName] || "#6B7280",
        examId: exam.examId,
        accuracy: Math.round(exam.accuracyPercentage),
        timeSpent: exam.totalTimeSpent,
      }));
  };

  const userRole = normalizeRole(storeUser.role);

  useEffect(() => {
    if (userRole !== Roles.STUDENT) return;
    loadMILData();
  }, [userRole]);

  return {
    exams,
    progress,
    loading,
    error,
    loadMILData,
    markExamCompleted,
    clearMILProgress,
    getExamProgress,
    getOverallScore,
    getExamResults,
    getCompletionStats,
    getSubtestScores,
    hasMIL: !!progress && progress.completedExams.length > 0,
    isCompleted: progress?.isCompleted || false,
    hasEnhancedData:
      !!progress?.enhancedData && progress.enhancedData.examStatus.length > 0,
    completionStats: getCompletionStats(),
  };
}
