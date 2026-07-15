/**
 * Personality (proprietary binary A/B) client — consumes the FormMaps
 * /api/v1/personality surface. Types mirror the backend contracts verbatim;
 * the { success, data } envelope is unwrapped here so callers get the payloads
 * directly (frontend data-extraction rule).
 */
import { apiRequest } from "@/lib/api/apiClient";

// ============================================
// TYPES (backend contract parity)
// ============================================

export type PersonalityVariant = "estudiantil" | "laboral";
export type PersonalityLanguage = "es" | "en";
export type PersonalityDimension = "EI" | "SN" | "TF" | "JP";
export type BinaryChoice = "A" | "B";

/** A single served item — prompt + option TEXT only; the answer key is withheld. */
export interface ServedItem {
  n: number;
  dimension: PersonalityDimension;
  prompt: string;
  optionA: string;
  optionB: string;
}

export interface PersonalityAccess {
  has_access: boolean;
  has_completed: boolean;
  existing_session_id?: string;
  reason?: string;
}

export interface StartSessionResponse {
  session_id: string;
  status: string;
  variant: PersonalityVariant;
  language: PersonalityLanguage;
  items: ServedItem[];
  answered_item_numbers: number[];
}

export interface AnswerResponse {
  session_id: string;
  answered_count: number;
  total_items: number;
  complete: boolean;
}

export interface DimensionScore {
  dimension: PersonalityDimension;
  firstCount: number;
  secondCount: number;
  winningPole: string;
  intensity: number;
  answered: number;
  maxPerDimension: number;
  /** 0-100 normalized intensity, for the radar / intensity bars. */
  normalizedIntensity: number;
  balanced: boolean;
}

export interface PersonalityScore {
  variant: PersonalityVariant;
  type: string;
  dimensions: Record<PersonalityDimension, DimensionScore>;
}

/** A profile with all bilingual fields collapsed to the session language. */
export interface LocalizedProfile {
  type: string;
  alias: string;
  tagline: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
  howToDevelop: string[];
  motivation: string[];
  howToWorkWith: string[];
  communication: string[];
  potential: { social: string; laboral: string };
  coachingStrategy: { objective: string; practices: string[] };
}

export interface PersonalityResults {
  session_id: string;
  user_name: string;
  variant: PersonalityVariant;
  language: PersonalityLanguage;
  type: string;
  score: PersonalityScore;
  dimension_scores: DimensionScore[];
  profile: LocalizedProfile;
  started_at: string | null;
  completed_at: string | null;
  violation_count: number;
  flag_for_review: boolean;
}

export interface SaveViolationsResponse {
  saved: number;
  count: number;
  flag: boolean;
}

// Reuse the shared proctoring violation shape.
import type { LockdownViolation } from "@/components/proctoring/types";
export type { LockdownViolation };

// ============================================
// API CLIENT
// ============================================

interface Envelope<T> {
  success: boolean;
  data: T;
}

const BASE = "/api/v1/personality";

async function get<T>(path: string): Promise<T> {
  const res = await apiRequest<Envelope<T>>(`${BASE}${path}`, { method: "GET" });
  return res.data;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiRequest<Envelope<T>>(`${BASE}${path}`, { method: "POST", data: body });
  return res.data;
}

export const personalityApi = {
  getAccess: (): Promise<PersonalityAccess> => get("/access"),

  start: (options?: { variant?: PersonalityVariant; language?: PersonalityLanguage }): Promise<StartSessionResponse> =>
    post("/start", { ...(options ?? {}) }),

  answer: (sessionId: string, itemNumber: number, choice: BinaryChoice): Promise<AnswerResponse> =>
    post(`/session/${sessionId}/answer`, { itemNumber, choice }),

  complete: (sessionId: string): Promise<PersonalityResults> => post(`/session/${sessionId}/complete`, {}),

  getResults: (sessionId: string): Promise<PersonalityResults> => get(`/session/${sessionId}/results`),

  getUserResults: (userId: string): Promise<PersonalityResults> => get(`/user/${userId}/results`),

  saveViolations: (sessionId: string, violations: LockdownViolation[]): Promise<SaveViolationsResponse> =>
    post(`/session/${sessionId}/violations`, { violations }),
};
