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

export const CATEGORY_LABELS: Record<ChecklistItem["category"], string> = {
  test_scores: "Test Scores",
  transcripts: "Transcripts",
  recommendations: "Recommendations",
  financial_aid: "Financial Aid",
  other: "Other",
};

export const CATEGORY_ORDER: ChecklistItem["category"][] = [
  "test_scores",
  "transcripts",
  "recommendations",
  "financial_aid",
  "other",
];

export const ESSAY_STATUS_CONFIG: Record<Essay["status"], { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "var(--admin-font-tertiary)", bg: "var(--admin-bg-hover)" },
  drafting:    { label: "Drafting",    color: "var(--admin-accent-amber)",  bg: "rgba(245,158,11,0.1)" },
  review:      { label: "In Review",   color: "var(--admin-accent-blue)",   bg: "rgba(59,130,246,0.1)" },
  final:       { label: "Final",       color: "var(--admin-accent-green)",  bg: "rgba(16,185,129,0.1)" },
};

export const COLUMN_LABELS: Record<string, string> = {
  researching: "Researching",
  shortlisted: "Shortlisted",
  applying: "Applying",
  applied: "Applied",
  accepted: "Accepted",
};

export function fitBadge(score?: number) {
  if (!score) return null;
  if (score >= 75) return { label: "Safety", color: "var(--admin-accent-green)", bg: "rgba(16,185,129,0.1)" };
  if (score >= 55) return { label: "Match", color: "var(--admin-accent-blue)", bg: "rgba(59,130,246,0.1)" };
  return { label: "Reach", color: "var(--admin-accent-amber)", bg: "rgba(245,158,11,0.1)" };
}

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
