import { apiRequest } from "@/lib/api/apiClient";

export interface DimensionScore {
  key: string;
  nameEs: string;
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
export async function getIntegrated(evaluatedUserId: string): Promise<IntegratedOutcome> {
  const res = await apiRequest(`/api/v1/vocational360/integrated/${enc(evaluatedUserId)}`);
  return unwrap<IntegratedOutcome>(res);
}
