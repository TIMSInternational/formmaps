// ─── Shared types & constants for application detail ─────────────────────────

export interface Essay {
  id: string;
  title: string;
  prompt?: string;
  wordLimit?: number;
  dueDate?: string;
  status: "not_started" | "drafting" | "review" | "final";
  currentDraft?: string;
}

// Field names match the API rows (itemName/isCompleted) — the old name/completed
// shape made every item render blank and toggles never persist.
export interface ChecklistItem {
  id: string;
  itemName: string;
  category: "test_scores" | "transcripts" | "recommendations" | "financial_aid" | "other";
  dueDate?: string;
  notes?: string;
  isCompleted: boolean;
}

// Label values below are i18n keys (common namespace) — render them with t().
export const CATEGORY_LABELS: Record<ChecklistItem["category"], string> = {
  test_scores: "studentUi.applications.category.testScores",
  transcripts: "studentUi.applications.category.transcripts",
  recommendations: "studentUi.applications.category.recommendations",
  financial_aid: "studentUi.applications.category.financialAid",
  other: "studentUi.applications.category.other",
};

export const CATEGORY_ORDER: ChecklistItem["category"][] = [
  "test_scores",
  "transcripts",
  "recommendations",
  "financial_aid",
  "other",
];

export const ESSAY_STATUS_CONFIG: Record<Essay["status"], { label: string; color: string; bg: string }> = {
  not_started: { label: "studentUi.applications.essayStatus.notStarted", color: "var(--admin-font-tertiary)", bg: "var(--admin-bg-hover)" },
  drafting:    { label: "studentUi.applications.essayStatus.drafting", color: "var(--admin-accent-amber)",  bg: "rgba(245,158,11,0.1)" },
  review:      { label: "studentUi.applications.essayStatus.review", color: "var(--admin-accent-blue)",   bg: "rgba(59,130,246,0.1)" },
  final:       { label: "studentUi.applications.essayStatus.final", color: "var(--admin-accent-green)",  bg: "rgba(16,185,129,0.1)" },
};

export const COLUMN_LABELS: Record<string, string> = {
  researching: "studentUi.applications.column.researching",
  shortlisted: "studentUi.applications.column.shortlisted",
  applying: "studentUi.applications.column.applying",
  applied: "studentUi.applications.column.applied",
  accepted: "studentUi.applications.column.accepted",
};

export function fitBadge(score?: number) {
  if (!score) return null;
  if (score >= 75) return { label: "studentUi.applications.fit.safety", color: "var(--admin-accent-green)", bg: "rgba(16,185,129,0.1)" };
  if (score >= 55) return { label: "studentUi.applications.fit.match", color: "var(--admin-accent-blue)", bg: "rgba(59,130,246,0.1)" };
  return { label: "studentUi.applications.fit.reach", color: "var(--admin-accent-amber)", bg: "rgba(245,158,11,0.1)" };
}

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
