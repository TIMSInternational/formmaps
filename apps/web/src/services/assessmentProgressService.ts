// Assessment Progress Service - Combines all assessment data
import { apiRequest } from "@/lib/api/apiClient";
import {
  getAllUserExamResults,
  getUserProgressSummary,
  getUserExamHistory,
  getMILResults,
  UserExamResult,
  UserProgressSummary,
} from "./milService";
import {
  getUserEvaluationGroups,
  getUserEvaluationProgressSummary,
  EvaluationGroupProgress,
  UserEvaluationProgress,
} from "./evaluationService";
import { checkPCAStatus } from "./pcaService";

interface MILEnhancedData {
  completedExams: number;
  totalExams: number;
  completionPercentage: number;
  examStatus: Array<{
    examId: string;
    examName: string;
    status: "completed" | "in_progress" | "not_started";
    scorePercentage: number | null;
    percentile: number | null;
    correctAnswers: number | null;
    incorrectAnswers: number | null;
    skippedAnswers: number | null;
    totalQuestions: number;
    timeSpent: string | null;
    timeLimitMinutes: number;
    isTimeExpired: boolean | null;
    completedAt: string | null;
    answeredQuestions: number | null;
  }>;
}

export interface AssessmentOverallProgress {
  milAssessment: {
    status: "not_started" | "in_progress" | "completed";
    progress: UserProgressSummary;
    lastActivity?: string;
    enhancedData?: MILEnhancedData | null;
  };
  evaluationAssessment: {
    status: "not_started" | "in_progress" | "completed";
    progress: UserEvaluationProgress["summary"];
    evaluationGroups: EvaluationGroupProgress[];
    lastActivity?: string;
  };
  pcaAssessment: {
    status: "not_started" | "in_progress" | "completed";
    progress?: number;
    lastActivity?: string;
  };
  overallCompletion: {
    totalAssessments: number;
    completedAssessments: number;
    percentageComplete: number;
  };
}

/**
 * Get comprehensive assessment progress for a user
 */
export async function getUserAssessmentProgress(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<AssessmentOverallProgress> {
  try {
    // Fetch LIA Assessment Progress — use /api/v1/mil/results/{userId} as single source of truth
    let milProgress: UserProgressSummary;
    let milStatus: "not_started" | "in_progress" | "completed" = "not_started";
    let milLastActivity: string | undefined;
    let enhancedMilData: MILEnhancedData | null = null;

    try {
      const milResults = await getMILResults(userId);

      if (milResults && milResults.examResults?.length > 0) {
        const completedExams = milResults.examResults.filter(
          (e) => e.status === "completed"
        );
        const inProgressExams = milResults.examResults.filter(
          (e) => e.status === "in_progress"
        );

        if (milResults.completedExams >= milResults.totalExams) {
          milStatus = "completed";
        } else if (completedExams.length > 0 || inProgressExams.length > 0) {
          milStatus = "in_progress";
        }

        milLastActivity = milResults.lastCompletedAt || undefined;

        milProgress = {
          totalAttempts: milResults.completedExams,
          completedExams: completedExams.length,
          averageScore: milResults.overallScore,
          bestScore:
            completedExams.length > 0
              ? Math.max(
                  ...completedExams.map((e) => e.scorePercentage ?? 0)
                )
              : 0,
          examResults: [],
          examTypes: {},
        };

        // Store for downstream use
        enhancedMilData = {
          completedExams: milResults.completedExams,
          totalExams: milResults.totalExams,
          completionPercentage:
            milResults.totalExams > 0
              ? (milResults.completedExams / milResults.totalExams) * 100
              : 0,
          examStatus: milResults.examResults,
        };
      } else {
        milProgress = {
          totalAttempts: 0,
          completedExams: 0,
          averageScore: 0,
          bestScore: 0,
          examResults: [],
          examTypes: {},
        };
      }
    } catch (error) {
      milProgress = {
        totalAttempts: 0,
        completedExams: 0,
        averageScore: 0,
        bestScore: 0,
        examResults: [],
        examTypes: {},
      };
    }

    // Fetch 360° Evaluation Progress
    let evaluationProgress: UserEvaluationProgress["summary"];
    let evaluationGroups: EvaluationGroupProgress[] = [];
    let evaluationStatus: "not_started" | "in_progress" | "completed" =
      "not_started";
    let evaluationLastActivity: string | undefined;

    try {
      evaluationGroups = await getUserEvaluationGroups(userId, language);
      evaluationProgress = getUserEvaluationProgressSummary(evaluationGroups);

      if (evaluationGroups.length > 0) {
        // Check if 360° evaluation is complete:
        // - Self-evaluation must be completed
        // - At least one from each group type (Parent, Teacher, SiblingFriend) must be completed
        // Self-evaluation has groupType "Parent" but relation "Self"
        const gt = (g: EvaluationGroupProgress) => (g.groupType || "").toLowerCase();
        const rel = (g: EvaluationGroupProgress) => (g.relation || "").toLowerCase();
        const selfCompleted = evaluationGroups.some(
          (g) => (gt(g) === "self" || rel(g) === "self") && g.isEvaluationCompleted
        );
        const parentCompleted = evaluationGroups.some(
          (g) => gt(g) === "parent" && rel(g) !== "self" && g.isEvaluationCompleted
        );
        const teacherCompleted = evaluationGroups.some(
          (g) => gt(g) === "teacher" && g.isEvaluationCompleted
        );
        const otherCompleted = evaluationGroups.some(
          (g) => (gt(g) === "siblingfriend" || gt(g) === "other") && g.isEvaluationCompleted
        );

        evaluationStatus =
          selfCompleted && parentCompleted && teacherCompleted && otherCompleted
            ? "completed"
            : "in_progress";

        const latestGroup = evaluationGroups.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        evaluationLastActivity = latestGroup?.createdAt;
      }
    } catch (error) {
      evaluationProgress = {
        totalGroups: 0,
        completedEvaluations: 0,
        pendingEvaluations: 0,
        expiredInvitations: 0,
        groupsByType: {
          Parent: 0,
          Teacher: 0,
          SiblingFriend: 0,
          Self: 0,
        },
      };
    }

    // Get PCA assessment data
    let pcaStatus: "not_started" | "in_progress" | "completed" = "not_started";
    let pcaProgress = 0;
    let pcaLastActivity = undefined;
    let pcaHasResults = false;
    let pcaCod = null;

    try {
      const pcaData = await checkPCAStatus(userId, language);
      pcaStatus = pcaData.status;
      pcaProgress =
        pcaData.status === "completed"
          ? 100
          : pcaData.status === "in_progress"
            ? 50
            : 0;
      pcaLastActivity = pcaData.lastActivity;
      pcaHasResults = pcaData.hasResults ?? false;
      pcaCod = pcaData.pcaCod;
    } catch (error) {
      // Keep default values
    }

    // Calculate overall completion
    const assessmentStatuses = [milStatus, evaluationStatus, pcaStatus];
    const completedCount = assessmentStatuses.filter(
      (status) => status === "completed"
    ).length;
    const inProgressCount = assessmentStatuses.filter(
      (status) => status === "in_progress"
    ).length;

    let overallPercentage = 0;
    if (completedCount > 0) {
      overallPercentage = (completedCount / 3) * 100;
    } else if (inProgressCount > 0) {
      overallPercentage = (inProgressCount / 3) * 30; // 30% for in progress
    }

    return {
      milAssessment: {
        status: milStatus,
        progress: milProgress,
        lastActivity: milLastActivity,
        enhancedData: enhancedMilData,
      },
      evaluationAssessment: {
        status: evaluationStatus,
        progress: evaluationProgress,
        evaluationGroups,
        lastActivity: evaluationLastActivity,
      },
      pcaAssessment: {
        status: pcaStatus,
        progress: pcaProgress,
        lastActivity: pcaLastActivity,
      },
      overallCompletion: {
        totalAssessments: 3,
        completedAssessments: completedCount,
        percentageComplete: Math.round(overallPercentage),
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get assessment progress summary for dashboard
 */
export async function getDashboardAssessmentSummary(
  userId: string,
  language: "english" | "spanish" = "english"
) {
  try {
    const progress = await getUserAssessmentProgress(userId, language);

    return {
      // Overall progress
      overallCompletion: progress.overallCompletion.percentageComplete,
      completedAssessments: progress.overallCompletion.completedAssessments,
      totalAssessments: progress.overallCompletion.totalAssessments,

      // Individual assessment summaries
      assessments: [
        {
          name: language === "spanish" ? "Evaluación LIA" : "LIA Assessment",
          type: "mil",
          status: progress.milAssessment.status,
          completion: progress.milAssessment.enhancedData
            ? Math.round(
              progress.milAssessment.enhancedData.completionPercentage
            )
            : progress.milAssessment.status === "completed"
              ? 100
              : progress.milAssessment.status === "in_progress"
                ? 50
                : 0,
          lastActivity: progress.milAssessment.lastActivity,
          stats: {
            totalAttempts: progress.milAssessment.progress.totalAttempts,
            bestScore: progress.milAssessment.progress.bestScore,
          },
        },
        {
          name: language === "spanish" ? "Evaluación 360°" : "360° Evaluation",
          type: "evaluation",
          status: progress.evaluationAssessment.status,
          completion:
            progress.evaluationAssessment.status === "completed"
              ? 100
              : progress.evaluationAssessment.status === "in_progress"
                ? 50
                : 0,
          lastActivity: progress.evaluationAssessment.lastActivity,
          stats: {
            totalEvaluators: progress.evaluationAssessment.progress.totalGroups,
            completedEvaluations:
              progress.evaluationAssessment.progress.completedEvaluations,
            pendingEvaluations:
              progress.evaluationAssessment.progress.pendingEvaluations,
          },
        },
        {
          name: language === "spanish" ? "Evaluación PCA" : "PCA Assessment",
          type: "pca",
          status: progress.pcaAssessment.status,
          completion:
            progress.pcaAssessment.status === "completed"
              ? 100
              : progress.pcaAssessment.status === "in_progress"
                ? 50
                : 0,
          lastActivity: progress.pcaAssessment.lastActivity,
          stats: {},
        },
      ],

      // Recent activity
      recentActivity: [
        progress.milAssessment.lastActivity,
        progress.evaluationAssessment.lastActivity,
        progress.pcaAssessment.lastActivity,
      ]
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())
        .slice(0, 3),
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch full assessment report data for PDF generation
 * Returns null on failure so caller can use fallback data
 */
export async function getAssessmentReportData(
  assessmentId: string
): Promise<import("@/types/assessmentReport").AssessmentReportData | null> {
  try {
    const json = await apiRequest(`/api/v1/assessments/${assessmentId}/report`);
    return json.data || json;
  } catch {
    return null;
  }
}
