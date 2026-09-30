import { apiRequest } from "@/lib/api/apiClient";

export interface DimensionScore {
  key: string;
  nameEs: string;
  /** English dimension name (from the instrument catalog); absent/null → show nameEs. */
  nameEn?: string | null;
  score: number | null;
  band: string | null;
  byGroup: Record<string, number>;
}
export interface Rankings {
  interests: { value: string; points: number }[];
  industries: { value: string; count: number }[];
  workType: { value: string; count: number } | null;
  openInsights: { group: string; text: string }[];
}
export interface VocationalScoreResult {
  status: "ready";
  instrumentVersion?: string;
  composite: number;
  band: string;
  respondentCount: number;
  groupsIncluded: string[];
  dimensionScores: DimensionScore[];
  rankings: Rankings;
}
export type VocationalScoreOutcome =
  | VocationalScoreResult
  | { status: "not_ready"; reason?: string }
  | { status: "never_computed" };

export interface IntegratedResult {
  status: "ready";
  instrumentVersion?: string;
  integratedComposite: number;
  band: string;
  threeSixtyScore: number;
  pcaScore: number;
  milScore: number;
  weightsApplied: { threeSixty: number; pca: number; mil: number };
}
export type IntegratedOutcome =
  | IntegratedResult
  | { status: "not_ready"; missing: string[] }
  | { status: "never_computed" };

function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | T;
  return (r as { data?: T })?.data ?? (r as T);
}

const enc = encodeURIComponent;

export async function recompute360(evaluatedUserId: string): Promise<VocationalScoreOutcome> {
  const res = await apiRequest(`/api/v1/vocational360/score/${enc(evaluatedUserId)}/recompute`, { method: "POST" });
  return unwrap<VocationalScoreOutcome>(res);
}
export async function recomputeIntegrated(evaluatedUserId: string): Promise<IntegratedOutcome> {
  const res = await apiRequest(`/api/v1/vocational360/integrated/${enc(evaluatedUserId)}/recompute`, { method: "POST" });
  return unwrap<IntegratedOutcome>(res);
}
export async function getScore(evaluatedUserId: string): Promise<VocationalScoreOutcome> {
  const res = await apiRequest(`/api/v1/vocational360/score/${enc(evaluatedUserId)}`);
  return unwrap<VocationalScoreOutcome>(res);
}
/** Dimension key → English name, from the active instrument catalog (GET /api/v1/vocational360/instrument). */
export async function getDimensionNamesEn(): Promise<Record<string, string>> {
  const res = await apiRequest(`/api/v1/vocational360/instrument`);
  const instrument = unwrap<{ dimensions?: { key: string; nameEn?: string | null }[] } | null>(res);
  const names: Record<string, string> = {};
  for (const d of instrument?.dimensions ?? []) {
    if (d?.key && d.nameEn) names[d.key] = d.nameEn;
  }
  return names;
}

/** The rater groups GET /api/v1/vocational360/questionnaire accepts (both backends 400 without one). */
const QUESTIONNAIRE_GROUPS = ["self", "parent", "teacher", "sibling_friend"] as const;

/**
 * Option value → display label in the given language, from the active questionnaire
 * (GET /api/v1/vocational360/questionnaire?group=&lang=). Rankings store option VALUES (slugs such
 * as "ingenieria"); this turns them back into the labels the evaluators saw. `group` is required,
 * and the group-specific questions carry their own options, so every group is read and merged; a
 * group that fails to load only costs its own labels.
 */
export async function getOptionLabels(lang: "es" | "en"): Promise<Record<string, string>> {
  const responses = await Promise.allSettled(
    QUESTIONNAIRE_GROUPS.map((group) => apiRequest(`/api/v1/vocational360/questionnaire?group=${group}&lang=${lang}`)),
  );
  const labels: Record<string, string> = {};
  for (const r of responses) {
    if (r.status !== "fulfilled") continue;
    type Question = { options?: { value: string; label?: string; labelEs?: string; labelEn?: string | null }[] | null };
    // Both backends put the question ARRAY straight in `data`; `{ questions }` is tolerated too.
    const data = unwrap<Question[] | { questions?: Question[] } | null>(r.value);
    const questions = Array.isArray(data) ? data : data?.questions ?? [];
    for (const q of questions) {
      for (const o of q.options ?? []) {
        const label = o.label ?? (lang === "en" ? o.labelEn : null) ?? o.labelEs;
        if (label && !(o.value in labels)) labels[o.value] = label;
      }
    }
  }
  return labels;
}

export async function getIntegrated(evaluatedUserId: string): Promise<IntegratedOutcome> {
  const res = await apiRequest(`/api/v1/vocational360/integrated/${enc(evaluatedUserId)}`);
  return unwrap<IntegratedOutcome>(res);
}

export interface Guidance {
  summary: string;
  recommendedPaths: { title: string; why: string }[];
  strengths: string[];
  growthAreas: string[];
  nextSteps: string[];
}
export interface CareerMatch {
  programId: string; programTitle: string; cluster: string;
  totalScore: number; confidence: string; needsBridging: boolean; bridgingPaths: string;
}
export type VocationalRecommendations =
  | { locked: true }
  | { locked: false; careerMatches: CareerMatch[]; guidance: Guidance; industries: { value: string; count: number }[] };

export async function getRecommendations(evaluatedUserId: string): Promise<VocationalRecommendations> {
  const res = await apiRequest(`/api/v1/vocational360/recommendations/${enc(evaluatedUserId)}`);
  return unwrap<VocationalRecommendations>(res);
}
