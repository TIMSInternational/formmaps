import type { LIAReportData } from "./LIAReportPDF";
import {
  EXAM_TYPE_TO_ID,
  type LIAWeightedComposite,
} from "@/services/milService";

/**
 * Minimal real-data input the LIA results page already has in scope.
 * Narrative / percentile fields are deliberately absent — we do NOT have real
 * values for them yet, so the builder emits null/empty placeholders rather than
 * fabricating.
 *
 * `weightedComposite` (optional) carries the TIMS 300-point composite + the
 * PROVISIONAL quintile bands. When present, the overall classification and each
 * subtest's band interpretation are populated from it. Percentiles/narratives
 * still stay empty — bands are the only real classification we have.
 */
export interface BuildLIAReportInput {
  user: { id: string | null; name: string | null; email: string | null };
  overallScore: number;
  averageAccuracy?: number;
  weightedComposite?: LIAWeightedComposite;
  subtests: Array<{
    name: string;
    score: number;
    accuracy: number;
    timeSpent?: string;
    /** Canonical exam id — used to match per-domain bands from weightedComposite. */
    examId?: string;
  }>;
}

/**
 * Map the REAL student results into the `LIAReportData` shape used by the PDF.
 *
 * Only fields we actually have are populated:
 *   - user (name/id/email)
 *   - overallScore.percentage
 *   - subtests[].name / score / accuracy / timeSpent
 *
 * Everything we do NOT have real values for is left null/empty so the PDF can
 * omit those sections. We never invent percentiles, classifications, or
 * narrative prose here.
 */
export function buildLIAReportData(input: BuildLIAReportInput): LIAReportData {
  const name = input.user.name?.trim() || "Student";
  const composite = input.weightedComposite;

  // Index per-domain bands by canonical exam id so we can match them to subtests.
  const bandByExamId = new Map<string, string>();
  for (const d of composite?.perDomain ?? []) {
    const examId = EXAM_TYPE_TO_ID[d.type];
    if (examId) bandByExamId.set(examId, d.labelEn);
  }

  return {
    user: {
      id: input.user.id ?? "",
      name,
      email: input.user.email ?? "",
    },
    reportDate: new Date().toISOString(),
    overallScore: {
      percentage: input.overallScore,
      // No real percentile data yet (TIMS norm tables outstanding).
      percentileRank: null,
      // Real band classification from the weighted composite (provisional cut-offs).
      classification: composite?.labelEn ?? "",
    },
    executiveSummary: {
      highlights: [],
      developmentAreas: [],
      strategicImplications: "",
    },
    subtests: input.subtests.map((s) => ({
      name: s.name,
      score: s.score,
      percentile: null,
      timeSpent: s.timeSpent ?? "",
      accuracy: s.accuracy,
      // Per-domain band label (provisional) when matched; otherwise empty.
      interpretation: (s.examId && bandByExamId.get(s.examId)) || "",
    })),
    cognitiveSynergy: "",
    behavioralObservations: {
      speedAccuracyBalance: "",
      attentionPattern: "",
      problemSolvingApproach: "",
      stressResponse: "",
    },
    workStyleAnalysis: {
      workPreference: "",
      decisionMaking: "",
      communicationStyle: "",
      leadershipPotential: "",
      teamDynamics: "",
    },
    environmentalFit: "",
    careerRecommendations: {
      roles: [],
      industries: [],
      skillsGap: [],
      motivators: [],
    },
    learningDevelopment: {
      learningStyle: "",
      agilityScore: null,
      recommendedCourses: [],
      actionPlan: [],
      coachingRecommended: false,
    },
    summary: {
      keyTakeaways: [],
      successFactors: [],
      riskFactors: [],
      nextAssessmentDate: "",
      methodology: "",
    },
  };
}
