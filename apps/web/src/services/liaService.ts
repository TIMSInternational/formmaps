/**
 * LIA (Labor Intelligence Assessment / MIL) client — tims-suite parity engine.
 * Types mirror tims-suite's api/mutations/liaAssessment.ts verbatim; endpoints
 * hit the FormMaps /api/v1/lia surface ({ success, data } envelope unwrapped
 * here so callers get the tims-shaped payloads).
 */
import { apiRequest } from "@/lib/api/apiClient";

// ============================================
// TYPES (tims-suite parity)
// ============================================

export type LIASubtest =
  | "pattern_recognition"
  | "verbal_reasoning"
  | "numerical_speed"
  | "working_memory"
  | "visual_rotation";

export type LIASessionStatus = "not_started" | "practice" | "in_progress" | "completed" | "abandoned";

export type LIAPerformanceLevel = "insufficient" | "low" | "acceptable" | "high" | "outstanding";

// Promoted to the shared proctoring layer; imported + re-exported here for
// back-compat so existing `@/services/liaService` importers keep working.
import type { LockdownViolation } from "@/components/proctoring/types";
export type { LockdownViolation };

export interface DeviceInfo {
  userAgent?: string;
  screenWidth?: number;
  screenHeight?: number;
}

// Question data types
export interface PatternRecognitionData {
  row1: string[];
  row2: string[];
}

export interface VerbalReasoningData {
  premises: string[];
  question: string;
  options: string[];
}

export interface NumericalSpeedData {
  numbers: number[];
}

export interface WorkingMemoryData {
  letters: string[];
}

export type VisualRotationFigure =
  | "R" | "R_90" | "R_180" | "R_270"
  | "ᖉ" | "ᖉ_90" | "ᖉ_180" | "ᖉ_270";

export interface VisualRotationData {
  topRow: VisualRotationFigure[];
  bottomRow: VisualRotationFigure[];
}

export type LIAQuestionData =
  | PatternRecognitionData
  | VerbalReasoningData
  | NumericalSpeedData
  | WorkingMemoryData
  | VisualRotationData;

export interface LIAQuestion {
  id: string;
  subtest: LIASubtest;
  item_number: number;
  question_data: LIAQuestionData;
  is_practice: boolean;
}

export interface ResponseCounts {
  correct: number;
  incorrect: number;
  unanswered: number;
}

export interface SubtestTiming {
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CheckAccessResponse {
  has_access: boolean;
  has_completed: boolean;
  existing_session_id?: string;
  reason?: string;
}

export interface StartSessionRequest {
  device_info?: DeviceInfo;
  language?: string;
}

export interface StartSessionResponse {
  session_id: string;
  current_subtest: LIASubtest;
  practice_questions: LIAQuestion[];
}

export interface SubmitPracticeAnswerResponse {
  is_correct: boolean;
  correct_answer: string;
  practice_complete: boolean;
  next_question?: LIAQuestion;
}

export interface StartSubtestResponse {
  session_id: string;
  subtest: LIASubtest;
  questions: LIAQuestion[];
  time_limit_seconds: number;
  started_at: string;
}

export interface SubmitAnswerResponse {
  session_id: string;
  items_completed: number;
  total_items: number;
  time_remaining_seconds: number;
  subtest_complete: boolean;
  next_subtest?: LIASubtest;
  assessment_complete: boolean;
}

export interface CompleteSessionResponse {
  session_id: string;
  raw_scores: Record<LIASubtest, number>;
  final_scores: Record<LIASubtest, number>;
  percentiles: Record<LIASubtest, number>;
  global_percentile: number;
  performance_level: LIAPerformanceLevel;
  response_counts: Record<LIASubtest, ResponseCounts>;
  completed_at: string;
}

export interface LIAResults {
  session_id: string;
  user_name: string;
  raw_scores: Record<LIASubtest, number>;
  final_scores: Record<LIASubtest, number>;
  percentiles: Record<LIASubtest, number>;
  global_percentile: number;
  performance_level: LIAPerformanceLevel;
  performance_level_display: { es: string; en: string };
  performance_level_description: { es: string; en: string };
  subtest_performance_levels: Record<LIASubtest, LIAPerformanceLevel>;
  response_counts: Record<LIASubtest, ResponseCounts>;
  subtest_times: Record<LIASubtest, SubtestTiming>;
  total_time_seconds: number;
  violation_count: number;
  lockdown_violations?: LockdownViolation[];
  started_at: string | null;
  completed_at: string;
}

export interface LIASession {
  id: string;
  status: LIASessionStatus;
  current_subtest?: LIASubtest;
  current_item: number;
  practice_completed: Record<LIASubtest, boolean>;
  subtest_times: Record<LIASubtest, SubtestTiming>;
  language: string;
  started_at?: string;
  completed_at?: string;
}

// ============================================
// API CLIENT
// ============================================

interface Envelope<T> {
  success: boolean;
  data: T;
}

const BASE = "/api/v1/lia";

async function get<T>(path: string): Promise<T> {
  const res = await apiRequest<Envelope<T>>(`${BASE}${path}`, { method: "GET" });
  return res.data;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiRequest<Envelope<T>>(`${BASE}${path}`, { method: "POST", data: body });
  return res.data;
}

export const liaAssessmentApi = {
  checkAccess: (): Promise<CheckAccessResponse> => get("/access"),

  start: (request: StartSessionRequest): Promise<StartSessionResponse> =>
    post("/start", request as unknown as Record<string, unknown>),

  getSession: (sessionId: string): Promise<LIASession> => get(`/session/${sessionId}`),

  getPracticeQuestions: (sessionId: string): Promise<LIAQuestion[]> => get(`/session/${sessionId}/practice`),

  submitPracticeAnswer: (
    sessionId: string,
    request: { question_id: string; answer: string },
  ): Promise<SubmitPracticeAnswerResponse> => post(`/session/${sessionId}/practice/answer`, request),

  startSubtest: (sessionId: string, request: { subtest: LIASubtest }): Promise<StartSubtestResponse> =>
    post(`/session/${sessionId}/subtest/start`, request),

  submitAnswer: (
    sessionId: string,
    request: { question_id: string; answer?: string; time_spent_ms: number },
  ): Promise<SubmitAnswerResponse> => post(`/session/${sessionId}/answer`, request),

  handleTimeout: (
    sessionId: string,
    request: { subtest: LIASubtest; unanswered_question_ids: string[] },
  ): Promise<SubmitAnswerResponse> => post(`/session/${sessionId}/timeout`, request),

  complete: (sessionId: string): Promise<CompleteSessionResponse> => post(`/session/${sessionId}/complete`, {}),

  getResults: (sessionId: string): Promise<LIAResults> => get(`/session/${sessionId}/results`),

  getUserResults: (userId: string): Promise<LIAResults> => get(`/user/${userId}/results`),

  saveViolations: (sessionId: string, violations: LockdownViolation[]): Promise<{ saved: number }> =>
    post(`/session/${sessionId}/violations`, { violations }),
};

// ============================================
// CONSTANTS (tims-suite parity)
// ============================================

/**
 * Resolve the assessment CONTENT language from the resolved UI locale (i18next
 * `i18n.language`). This must be the single source of truth so a Spanish user
 * never gets English items mid-test: deriving it from a persisted store default
 * (which defaults to English) let the session start in the wrong language.
 */
export function resolveContentLanguage(i18nLanguage: string | undefined): "es" | "en" {
  const l = (i18nLanguage ?? "").toLowerCase();
  return l.startsWith("es") || l === "spanish" ? "es" : "en";
}

export const SUBTEST_ORDER: LIASubtest[] = [
  "pattern_recognition",
  "verbal_reasoning",
  "numerical_speed",
  "working_memory",
  "visual_rotation",
];

export const SUBTEST_CONFIG: Record<LIASubtest, {
  itemCount: number;
  timeSeconds: number;
  displayName: { es: string; en: string };
}> = {
  pattern_recognition: {
    itemCount: 60,
    timeSeconds: 3 * 60,
    displayName: { es: "Reconocimiento de Patrones", en: "Pattern Recognition" },
  },
  verbal_reasoning: {
    itemCount: 50,
    timeSeconds: 4 * 60,
    displayName: { es: "Razonamiento Verbal", en: "Verbal Reasoning" },
  },
  numerical_speed: {
    itemCount: 60,
    timeSeconds: 4 * 60,
    displayName: { es: "Velocidad Numérica", en: "Numerical Speed" },
  },
  working_memory: {
    // The official Working Memory instrument is 60 items (the 72-item form is
    // retired). The backend serves 60; keep this in sync so progress never
    // targets a count the served bank can't reach.
    itemCount: 60,
    timeSeconds: 4 * 60,
    displayName: { es: "Memoria de Trabajo", en: "Working Memory" },
  },
  visual_rotation: {
    itemCount: 60,
    timeSeconds: 5 * 60,
    displayName: { es: "Rotación Visual", en: "Visual Rotation" },
  },
};
