import type { LIAReportData } from "./LIAReportPDF";

/**
 * Minimal real-data input the LIA results page already has in scope.
 * Narrative / percentile / band fields are deliberately absent — we do NOT have
 * real values for them yet (weighted 300-pt bands are a separate TIMS-blocked
 * task), so the builder emits null/empty placeholders rather than fabricating.
 */
export interface BuildLIAReportInput {
  user: { id: string | null; name: string | null; email: string | null };
  overallScore: number;
  averageAccuracy?: number;
  subtests: Array<{
    name: string;
    score: number;
    accuracy: number;
    timeSpent?: string;
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

  return {
    user: {
      id: input.user.id ?? "",
      name,
      email: input.user.email ?? "",
    },
    reportDate: new Date().toISOString(),
    overallScore: {
      percentage: input.overallScore,
      // No real percentile data yet (band rebuild is TIMS-blocked).
      percentileRank: null,
      classification: "",
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
      interpretation: "",
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
