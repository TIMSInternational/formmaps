// ============================================
// Graduation Plan ("Path to MIT") Types
// Mirrors api/src/services/graduationPlanService.ts + planWorkflowService.ts DTOs
// ============================================

export interface GraduationTarget {
  id?: string;
  universityId: string | null;
  universityName: string | null;
  major: string | null;
  fieldKey?: string;
  selectivityTier?: string;
  templateKey?: string;
  templateLabel?: string;
  /** true when this is a non-persisted suggestion derived from matches */
  suggested: boolean;
}

export interface SetGraduationTargetPayload {
  universityId?: string;
  universityName?: string;
  major: string;
}

export type GraduationPlanStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "superseded";

export type GraduationPlanItemSource =
  | "depth-track"
  | "required"
  | "category-fill"
  | "elective";

export interface GraduationPlanItem {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  gradeLevel: number;
  term: string | null;
  category: string | null;
  reason: string | null;
  source: GraduationPlanItemSource | string;
  sortOrder: number;
}

export interface GraduationPlanGap {
  category: string;
  missingCredits: number;
  reason: string;
}

export interface GraduationPlan {
  id: string;
  status: GraduationPlanStatus;
  templateKey: string;
  templateLabel: string;
  gapReport: GraduationPlanGap[];
  warnings: string[];
  rationale: string | null;
  totalPlannedCredits: number;
  submittedAt: string | null;
  reviewNote: string | null;
  createdDate?: string;
  items: GraduationPlanItem[];
}

export interface AssessmentCompletion {
  allDone: boolean;
  liaCompleted: number;
  pcaCompleted: boolean;
  evalCompleted: number;
  evalTotal: number;
}

/** POST /graduation-plan/generate returns the locked shape until assessments are done. */
export type GenerateGraduationPlanResult =
  | { locked: true; completion: AssessmentCompletion }
  | GraduationPlan;

export function isLockedResult(
  r: GenerateGraduationPlanResult,
): r is { locked: true; completion: AssessmentCompletion } {
  return typeof r === "object" && r !== null && "locked" in r && (r as { locked?: boolean }).locked === true;
}

export interface SupplementalCourse {
  id: string;
  title: string;
  provider: string | null;
  category: string | null;
  rating: number | null;
  matchScore: number;
  fillsGap: string | null;
  reason: string;
}

// ─── Counselor view ──────────────────────────────────────────────────────────

export interface StudentGraduationPlanResponse {
  plan: GraduationPlan | null;
  target: {
    universityName: string | null;
    major: string;
    templateKey: string;
  } | null;
}

export interface ReviewGraduationPlanPayload {
  status: "approved" | "rejected";
  note?: string;
}

// ─── Parent view ─────────────────────────────────────────────────────────────

export interface ChildCoursePlanResponse {
  target: { universityName: string | null; major: string | null } | null;
  approvedPlan: {
    approvedAt: string | null;
    items: Array<{
      courseCode: string;
      courseName: string;
      credits: number;
      gradeLevel: number;
      term: string | null;
    }>;
  } | null;
  currentCourses: Array<{ courseId: string; term: string | null; status: string }>;
}

// ─── Plan-error codes (api PLAN_ERROR_STATUS) ────────────────────────────────

export type GraduationPlanErrorCode =
  | "NO_SCHOOL"
  | "NO_TARGET"
  | "NO_DRAFT"
  | "NO_CURRENT_YEAR"
  | "NO_RULESET"
  | "NO_CATALOG"
  | "PLAN_PROPOSED";

/** apiClient rejects with Error & { status, data: { code? } } — narrow to the plan code. */
export function getPlanErrorCode(err: unknown): GraduationPlanErrorCode | null {
  const data = (err as { data?: { code?: string } } | null)?.data;
  const code = data?.code;
  const known: GraduationPlanErrorCode[] = [
    "NO_SCHOOL", "NO_TARGET", "NO_DRAFT", "NO_CURRENT_YEAR", "NO_RULESET", "NO_CATALOG", "PLAN_PROPOSED",
  ];
  return known.includes(code as GraduationPlanErrorCode) ? (code as GraduationPlanErrorCode) : null;
}
