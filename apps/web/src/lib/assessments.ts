/**
 * The ONE source of truth for the student assessment instruments (tafurfede/formmaps-platform#398).
 *
 * Every surface that names an instrument or states the career/university
 * unlock rule — Dashboard, Timeline, Career Explorer, University Finder,
 * Vocational 360 readiness, Cmd+K — reads it from here, so they can no longer
 * disagree about how many assessments there are or what they are called.
 *
 * Student-facing copy says "LIA". "MIL" is the legacy TIMS name and survives
 * only in API field names (milAssessment, milScore, …), never in UI text.
 */
import type { AssessmentOverallProgress } from "@/services/assessmentProgressService";

export type AssessmentId = "pca" | "lia" | "evaluation" | "personality";
export type AssessmentStatus = "not_started" | "in_progress" | "completed";

export interface AssessmentDefinition {
  id: AssessmentId;
  /** i18n key prefix: `${i18nKey}.name` (short), `.fullName`, `.description` */
  i18nKey: string;
  href: string;
  /** Required to unlock career matches and university recommendations (the Dashboard gate). */
  requiredForMatches: boolean;
}

export const ASSESSMENTS: readonly AssessmentDefinition[] = [
  { id: "pca", i18nKey: "instruments.pca", href: "/dashboard/assessments/pca", requiredForMatches: true },
  { id: "lia", i18nKey: "instruments.lia", href: "/dashboard/assessments/lia", requiredForMatches: true },
  { id: "evaluation", i18nKey: "instruments.evaluation", href: "/dashboard/assessments/evaluation", requiredForMatches: true },
  { id: "personality", i18nKey: "instruments.personality", href: "/dashboard/assessments/personality", requiredForMatches: true },
];

export const REQUIRED_FOR_MATCHES: readonly AssessmentDefinition[] = ASSESSMENTS.filter(
  (a) => a.requiredForMatches,
);

/**
 * The instruments the Vocational 360 integrated score is computed from
 * (services/api … Application/Assessments/VocationalIntegration.cs — 360 + PCA +
 * LIA). Personality is NOT an input; whether it should be is
 * tafurfede/formmaps-platform#399.
 */
export const VOCATIONAL_INTEGRATED_IDS: readonly AssessmentId[] = ["evaluation", "pca", "lia"];

type Translate = (key: string, options?: Record<string, unknown>) => string;

function byId(id: AssessmentId): AssessmentDefinition {
  const def = ASSESSMENTS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown assessment id: ${id}`);
  return def;
}

export function assessmentName(t: Translate, id: AssessmentId): string {
  return t(`${byId(id).i18nKey}.name`);
}

/** "PCA, LIA, 360° and Personality" / "PCA, LIA, 360° y Personalidad" */
export function formatAssessmentList(
  t: Translate,
  language: string,
  ids: readonly AssessmentId[] = REQUIRED_FOR_MATCHES.map((a) => a.id),
): string {
  const names = ids.map((id) => assessmentName(t, id));
  const locale = language?.toLowerCase().startsWith("es") || language === "spanish" ? "es" : "en";
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** Per-instrument status from the same progress object the Dashboard gate reads. */
export function getAssessmentStatuses(
  progress?: Partial<
    Pick<AssessmentOverallProgress, "pcaAssessment" | "milAssessment" | "evaluationAssessment" | "personalityAssessment">
  > | null,
): Record<AssessmentId, AssessmentStatus> {
  return {
    pca: progress?.pcaAssessment?.status ?? "not_started",
    lia: progress?.milAssessment?.status ?? "not_started",
    evaluation: progress?.evaluationAssessment?.status ?? "not_started",
    personality: progress?.personalityAssessment?.status ?? "not_started",
  };
}

/** Completed-of-required count — the N/M every surface shows. */
export function countCompletedRequired(statuses: Record<AssessmentId, AssessmentStatus>): {
  completed: number;
  total: number;
} {
  return {
    completed: REQUIRED_FOR_MATCHES.filter((a) => statuses[a.id] === "completed").length,
    total: REQUIRED_FOR_MATCHES.length,
  };
}
