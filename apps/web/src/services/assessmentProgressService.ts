// Assessment Progress Service - Combines all assessment data
import { apiRequest } from "@/lib/api/apiClient";
import {
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
import { personalityApi } from "./personalityService";

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

// Single 360-completion rule, mirroring the server's gate
// (computeStudentCompletion in api/src/services/assessmentService.ts):
// a student needs at most 3 completed evaluators, never more than were
// actually invited. One unresponsive evaluator must never permanently lock
// a student out — this is why "3-of-4 done" must read as complete, not
// "one of each relation type" (self/parent/teacher/sibling-friend), which
// is what this file used to require and is the exact bug Madhav reported.
export function EVAL_REQUIRED_RULE(evalTotal: number): number {
  return Math.min(evalTotal, 3);
}

export function isEvalComplete(evalCompleted: number, evalTotal: number): boolean {
  return evalTotal > 0 && evalCompleted >= EVAL_REQUIRED_RULE(evalTotal);
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
  /**
   * The personality assessment — became a required 4th assessment (alongside
   * MIL/360/PCA) in the career/university-unlock gate on 2026-07-30. `gating: true`
   * reflects that; the one exception is a student already unlocked under the old
   * 3-assessment rule at cutover (server-side `legacyUnlockGrandfathered`), which
   * `overallCompletion` below already accounts for via the server's own verdict.
   */
  personalityAssessment: {
    key: "personality";
    gating: boolean;
    status: "not_started" | "in_progress" | "completed";
    hasAccess: boolean;
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
        // 360° evaluation is complete once evalCompleted >= min(evalTotal, 3) —
        // the SAME threshold the server unlocks careers/course-plan with (see
        // EVAL_REQUIRED_RULE above). Requiring one-of-each relation type here
        // let one unresponsive evaluator lock a student out forever even after
        // the server had already unlocked them (3-of-4 done read as "pending").
        const evalTotal = evaluationGroups.length;
        const evalCompleted = evaluationGroups.filter((g) => g.isEvaluationCompleted).length;

        evaluationStatus = isEvalComplete(evalCompleted, evalTotal)
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

    // Fetch personality access. Never throws: any failure falls back to "not_started".
    let personalityStatus: "not_started" | "in_progress" | "completed" = "not_started";
    let personalityHasAccess = false;

    try {
      const access = await personalityApi.getAccess();
      personalityHasAccess = access.has_access;
      personalityStatus = access.has_completed
        ? "completed"
        : access.existing_session_id
          ? "in_progress"
          : "not_started";
    } catch {
      // Keep defaults — a personality-service outage must never break the
      // rest of progress tracking.
    }

    // Overall completion (4 assessments: MIL, 360, PCA, Personality) is fetched from
    // the server's own verdict (GET /api/v1/assessment/completion → checkAssessmentCompletion)
    // rather than re-derived here, so this client-side tally can never drift from the
    // server's actual unlock decision — critically including legacyUnlockGrandfathered,
    // which only the server can evaluate. If the endpoint is unreachable it falls back to
    // a client-derived estimate over the SAME four assessments, so an outage degrades the
    // numbers but never the denominator.
    let completedCount = 0;
    let overallPercentage = 0;
    const totalAssessments = 4;
    let personalityGates = true;

    try {
      const completionJson = await apiRequest<{
        data?: { allDone: boolean; readyForInsights: boolean; personalityCompleted: boolean };
      }>("/api/v1/assessment/completion");
      const serverCompletion = completionJson.data;
      if (!serverCompletion) throw new Error("no completion data");

      const nonPersonalityStatuses = [milStatus, evaluationStatus, pcaStatus];
      const nonPersonalityCompleted = nonPersonalityStatuses.filter((s) => s === "completed").length;
      completedCount = nonPersonalityCompleted + (personalityStatus === "completed" ? 1 : 0);
      overallPercentage = serverCompletion.allDone ? 100 : (completedCount / 4) * 100;
      // The student is grandfathered if the server says allDone despite Personality
      // not actually being complete — the only way that combination can occur.
      personalityGates = !(serverCompletion.allDone && !serverCompletion.personalityCompleted);
    } catch {
      // Client-derived estimate over the same four assessments the server counts. It
      // used to fall back to the pre-2026-07-30 3-assessment shape, which is how the
      // dashboard card came to read "1/3 · 33%" for a student who owes four. The one
      // thing this branch cannot know is legacyUnlockGrandfathered, so a grandfathered
      // student reads as incomplete here.
      const assessmentStatuses = [milStatus, evaluationStatus, pcaStatus, personalityStatus];
      completedCount = assessmentStatuses.filter((s) => s === "completed").length;
      const inProgressCount = assessmentStatuses.filter((s) => s === "in_progress").length;
      if (completedCount > 0) {
        overallPercentage = (completedCount / totalAssessments) * 100;
      } else if (inProgressCount > 0) {
        overallPercentage = (inProgressCount / totalAssessments) * 30; // partial credit
      }
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
      personalityAssessment: {
        key: "personality",
        gating: personalityGates,
        status: personalityStatus,
        hasAccess: personalityHasAccess,
      },
      overallCompletion: {
        totalAssessments,
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
        // Personality has been a required 4th assessment since 2026-07-30 (see
        // AssessmentOverallProgress.personalityAssessment) but was never listed here,
        // so `assessments.length` said 3 while `overallCompletion` counted 4. Any
        // consumer sizing itself off this array was therefore off by one.
        {
          name:
            language === "spanish"
              ? "Evaluación de Personalidad"
              : "Personality Assessment",
          type: "personality",
          status: progress.personalityAssessment.status,
          completion:
            progress.personalityAssessment.status === "completed"
              ? 100
              : progress.personalityAssessment.status === "in_progress"
                ? 50
                : 0,
          lastActivity: undefined,
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
