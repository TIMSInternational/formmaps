import { useState, useEffect } from "react";
import {
  getAllMILExams,
  MILExamMetadata,
  loadMILSession,
  getUserExamHistory,
  EnhancedUserExamHistory,
  ExamStatus,
} from "@/services/milService";
import { useGlobalStore } from "@/store/useGlobalStore";

export interface MILProgress {
  completedExams: string[];
  totalExams: number;
  isCompleted: boolean;
  lastUpdated: string;
  // Enhanced progress data from API
  enhancedData?: EnhancedUserExamHistory;
  examStatuses?: {
    completed: ExamStatus[];
    inProgress: ExamStatus[];
    notStarted: ExamStatus[];
  };
}

export function useMILData() {
  const { language } = useGlobalStore();
  const [exams, setExams] = useState<MILExamMetadata[]>([]);
  const [progress, setProgress] = useState<MILProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get current user ID
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

  const loadMILData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load available exams
      const examData = await getAllMILExams(language);
      setExams(examData);

      // Get current user ID
      const userId = getCurrentUserId();

      // Load enhanced exam history from API
      let enhancedData: EnhancedUserExamHistory | undefined;
      let examStatuses: MILProgress["examStatuses"];

      if (userId !== "unknown") {
        try {
          enhancedData = await getUserExamHistory(userId, language);

          // Categorize exam results by status
          const completed = enhancedData.examStatus.filter(
            (exam) => exam.status === "completed"
          );
          const inProgress = enhancedData.examStatus.filter(
            (exam) => exam.status === "in_progress"
          );
          const notStarted = enhancedData.examStatus.filter(
            (exam) => exam.status === "not_started"
          );

          examStatuses = { completed, inProgress, notStarted };
        } catch (apiError) {
          console.warn(
            "Failed to load enhanced exam history, falling back to localStorage:",
            apiError
          );
        }
      }

      // Fallback to localStorage for backward compatibility
      const localCompletedExams = JSON.parse(
        localStorage.getItem("mil_completed_exams") || "[]"
      );

      // Use API data if available, otherwise use localStorage
      const completedExams = enhancedData?.examStatus
        ? enhancedData.examStatus
            .filter((exam) => exam.status === "completed")
            .map((exam) => exam.examId)
        : localCompletedExams;

      const progressData: MILProgress = {
        completedExams,
        totalExams: enhancedData?.totalExams || examData.length,
        isCompleted: enhancedData
          ? enhancedData.completionPercentage === 100
          : completedExams.length === examData.length,
        lastUpdated: new Date().toISOString(),
        enhancedData,
        examStatuses,
      };

      setProgress(progressData);
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
    localStorage.setItem(
      "mil_completed_exams",
      JSON.stringify(updatedCompleted)
    );
  };

  const clearMILProgress = () => {
    localStorage.removeItem("mil_completed_exams");
    // Clear all exam sessions
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
        const totalScore = completedExams.reduce((sum, exam) => {
          return sum + exam.scorePercentage;
        }, 0);
        return Math.round(totalScore / completedExams.length);
      }
    }

    // Final fallback to simple completion percentage
    if (!progress || progress.completedExams.length === 0) return 0;
    return Math.round(
      (progress.completedExams.length / progress.totalExams) * 100
    );
  };

  // Enhanced function to get detailed exam results
  const getExamResults = () => {
    return progress?.enhancedData?.examStatus || [];
  };

  // Enhanced function to get completion statistics
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

  // Enhanced function to get subtest scores
  const getSubtestScores = () => {
    if (!progress?.enhancedData?.examStatus) {
      // Fallback to mock data for display purposes based on completed exams
      const mockScores = [
        {
          name: "Pattern Recognition",
          score: 85,
          color: "#8B5CF6",
          examId: "pattern-recognition-001",
        },
        {
          name: "Verbal Reasoning",
          score: 78,
          color: "#06B6D4",
          examId: "verbal-reasoning-001",
        },
        {
          name: "Working Memory",
          score: 72,
          color: "#10B981",
          examId: "working-memory-001",
        },
        {
          name: "Numeric Velocity",
          score: 68,
          color: "#F59E0B",
          examId: "numeric-velocity-001",
        },
        {
          name: "Visual Rotation",
          score: 75,
          color: "#EF4444",
          examId: "visual-rotation-001",
        },
      ];

      return mockScores.slice(0, progress?.completedExams.length || 0);
    }

    // Use real API data - map exam names to colors
    const examColorMap: { [key: string]: string } = {
      "Pattern Recognition": "#8B5CF6",
      "Verbal Reasoning": "#06B6D4",
      "Working Memory": "#10B981",
      "Numeric Velocity": "#F59E0B",
      "Visual Rotation": "#EF4444",
    };

    return progress.enhancedData.examStatus
      .filter((exam) => exam.status === "completed")
      .map((exam) => {
        return {
          name: exam.examName,
          score: Math.round(exam.scorePercentage),
          color: examColorMap[exam.examName] || "#6B7280",
          examId: exam.examId,
          accuracy: Math.round(exam.accuracyPercentage),
          timeSpent: exam.totalTimeSpent,
        };
      });
  };

  useEffect(() => {
    loadMILData();
  }, []);

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
    // Enhanced properties for better dashboard display
    hasEnhancedData:
      !!progress?.enhancedData && progress.enhancedData.examStatus.length > 0,
    completionStats: getCompletionStats(),
  };
}
