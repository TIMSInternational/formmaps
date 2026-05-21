// MIL Assessment Service - Integrated with PCA API

import { apiRequest } from "@/lib/api/apiClient";

// --- Retry helper with exponential backoff ---
async function submitWithRetry(
  url: string,
  body: any,
  headers: Record<string, string>,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (response.ok) return response;
      if (attempt < maxRetries)
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Failed after retries");
}

// --- Pending submission persistence for offline recovery ---
const PENDING_KEY = "nexa_pending_mil_submissions";

interface PendingSubmission {
  key: string;
  url: string;
  body: any;
  timestamp: string;
}

function savePendingSubmission(key: string, url: string, data: any): void {
  try {
    const existing: PendingSubmission[] = JSON.parse(
      localStorage.getItem(PENDING_KEY) || "[]"
    );
    // Replace any existing entry with the same key
    const filtered = existing.filter((s) => s.key !== key);
    filtered.push({ key, url, body: data, timestamp: new Date().toISOString() });
    localStorage.setItem(PENDING_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage unavailable
  }
}

function removePendingSubmission(key: string): void {
  try {
    const existing: PendingSubmission[] = JSON.parse(
      localStorage.getItem(PENDING_KEY) || "[]"
    );
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(existing.filter((s) => s.key !== key))
    );
  } catch {
    // localStorage unavailable
  }
}

export function getPendingSubmissions(): PendingSubmission[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch {
    return [];
  }
}

export async function retryPendingSubmissions(): Promise<void> {
  const pending = getPendingSubmissions();
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
  for (const submission of pending) {
    // Skip stale submissions (>1 hour old) or those missing sessionId
    const age = Date.now() - new Date(submission.timestamp).getTime();
    if (age > 3600000 || !submission.body?.sessionId) {
      removePendingSubmission(submission.key);
      continue;
    }
    try {
      const response = await submitWithRetry(
        submission.url,
        submission.body,
        headers,
        2
      );
      if (response.ok) {
        removePendingSubmission(submission.key);
      }
    } catch {
      // Will be retried on next page load
    }
  }
}

export interface MILQuestion {
  questionNumber: number;
  questionText: string;
  type: number;
  data: {
    letterPairs?: Array<{
      topLetter: string;
      bottomLetter: string;
    }>;
    statements?: string[] | null;
    options?: string[] | null;
    letters?: string[] | null;
    middleLetterIndex?: number | null;
    numbers?: number[] | null;
    figurePairs?: Array<{
      topFigure: string;
      bottomFigure: string;
    }> | null;
    letterSequence?: {
      letters: string[];
      outerLetters: string[];
      middleLetter: string;
    } | null;
    visualRotationItems?: Array<{
      letter: string;
      rotationDegree: number;
      isMirrored: boolean;
    }> | null;
  };
  explanation: string;
  correctAnswer?: number | string; // Index of the correct answer or actual value (for letters/numbers)
}

export interface MILExam {
  id: string;
  name: string;
  description: string;
  type: number;
  timeLimitMinutes: number;
  totalQuestions: number;
  questions: MILQuestion[];
}

export interface MILExamMetadata {
  id: string;
  name: string;
  description: string;
  type: number;
  timeLimitMinutes: number;
  totalQuestions: number;
}

export interface MILAnswer {
  questionNumber: number;
  answer: number | string;
  timeSpent: number;
  timestamp: string;
}

export interface MILSession {
  examId: string;
  apiSessionId?: string;
  startTime: string;
  answers: MILAnswer[];
  currentQuestion: number;
  isCompleted: boolean;
}

// Available MIL Exams
export const MIL_EXAMS = {
  FEATURE_DETECTION: "feature-detection-001",
  VERBAL_REASONING: "verbal-reasoning-001",
  WORKING_MEMORY: "working-memory-001",
  NUMERICAL_SPEED_ACCURACY: "numerical-speed-accuracy-001",
  SPATIAL_ORIENTATION: "spatial-orientation-001",
} as const;

export type MILExamId = (typeof MIL_EXAMS)[keyof typeof MIL_EXAMS];

/**
 * Enhanced API response interfaces matching actual API structure
 */
export interface EnhancedUserExamHistory {
  userId: string;
  username: string;
  totalExams: number;
  completedExams: number;
  inProgressExams: number;
  notStartedExams: number;
  completionPercentage: number;
  examStatus: ExamStatus[];
}

export interface ExamStatus {
  examId: string;
  examName: string;
  examType: number;
  status: "completed" | "in_progress" | "not_started";
  startDate?: string;
  completionDate?: string;
  scorePercentage: number;
  accuracyPercentage: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  totalTimeSpent: string;
  isTimeExpired: boolean;
  sessionId?: string;
  timeLimitMinutes: number;
  description: string;
}

/**
 * Legacy interfaces for backward compatibility
 */
export interface UserExamResult {
  sessionId: string;
  username: string;
  examName: string;
  examType: number;
  result: {
    scorePercentage: number;
    accuracyPercentage: number;
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unansweredQuestions: number;
    isTimeExpired: boolean;
    isCompleted: boolean;
  };
  date: string;
  endDate: string;
  totalTimeSpent: string;
  answers: Array<{
    questionNumber: number;
    userAnswer: string | number;
    correctAnswer: string | number;
    isCorrect: boolean;
    isAnswered: boolean;
    timeSpent: string;
    explanation: string;
  }>;
}

export interface UserProgressSummary {
  totalAttempts: number;
  completedExams: number;
  averageScore: number;
  bestScore: number;
  examResults: UserExamResult[];
  examTypes: {
    [key: string]: {
      name: string;
      attempts: number;
      bestScore: number;
      lastAttempt?: string;
    };
  };
}

/**
 * PRIMARY endpoint for MIL/LIA results — single source of truth.
 * Calls /api/v1/mil/results/{userId} which returns complete data
 * including scores, percentiles, and cognitive profile.
 *
 * Response is wrapped: { success, data: MILResultsResponse }
 * where data.examResults[] has the same exam IDs used throughout
 * (pattern-recognition-001, verbal-reasoning-001, etc.)
 */
export interface MILResultsData {
  userId: string;
  overallScore: number;
  overallPercentile: number;
  completedExams: number;
  totalExams: number;
  lastCompletedAt: string | null;
  examResults: Array<{
    examId: string;
    examName: string;
    status: "completed" | "in_progress" | "not_started";
    scorePercentage: number | null;
    percentile: number | null;
    correctAnswers: number | null;
    incorrectAnswers: number | null;
    skippedAnswers: number | null;
    totalQuestions: number;
    timeSpent: string | null;
    timeLimitMinutes: number;
    isTimeExpired: boolean | null;
    completedAt: string | null;
    answeredQuestions: number | null;
  }>;
  cognitiveProfile: {
    logicalReasoning: number;
    verbalProcessing: number;
    workingMemory: number;
    processingSpeed: number;
    spatialOrientation: number;
  };
}

export async function getMILResults(userId: string): Promise<MILResultsData | null> {
  try {
    const json = await apiRequest(`/api/v1/mil/results/${userId}`);
    return json.data || json;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use getMILResults() instead. This returns ALL users' results.
 */
export async function getAllUserExamResults(
  language: "english" | "spanish" = "english"
): Promise<UserExamResult[]> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const json = await apiRequest(`/api/pcaexam/all-results?lang=${langParam}`);
    return Array.isArray(json) ? json : json.data || [];
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403) return [];
    throw error;
  }
}

/**
 * Get user exam history for specific user (Enhanced API)
 */
export async function getUserExamHistory(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<EnhancedUserExamHistory> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    return await apiRequest(`/api/pcaexam/history/${userId}?lang=${langParam}`);
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403)
      return { exams: [], totalExams: 0, completedExams: 0 } as any;
    throw error;
  }
}

/**
 * Get user progress summary from exam results
 */
export function getUserProgressSummary(
  examResults: UserExamResult[]
): UserProgressSummary {
  if (!examResults || !examResults.length) {
    return {
      totalAttempts: 0,
      completedExams: 0,
      averageScore: 0,
      bestScore: 0,
      examResults: [],
      examTypes: {},
    };
  }

  // Filter out invalid results and ensure result property exists
  const validResults = examResults.filter(
    (r) => r && r.result && typeof r.result === "object"
  );
  const completedExams = validResults.filter((r) => r.result.isCompleted);
  const scores = completedExams
    .map((r) => r.result.scorePercentage)
    .filter((s) => typeof s === "number" && s > 0);

  const examTypeMap: { [key: number]: string } = {
    0: "Pattern Recognition",
    1: "Verbal Reasoning",
    2: "Working Memory",
    3: "Numeric Velocity",
    4: "Visual Rotation",
  };

  const examTypes: { [key: string]: any } = {};

  validResults.forEach((result) => {
    const typeName =
      examTypeMap[result.examType] || `Exam Type ${result.examType}`;
    if (!examTypes[typeName]) {
      examTypes[typeName] = {
        name: typeName,
        attempts: 0,
        bestScore: 0,
        lastAttempt: result.date,
      };
    }

    examTypes[typeName].attempts++;
    examTypes[typeName].bestScore = Math.max(
      examTypes[typeName].bestScore,
      result.result.scorePercentage
    );

    if (new Date(result.date) > new Date(examTypes[typeName].lastAttempt)) {
      examTypes[typeName].lastAttempt = result.date;
    }
  });

  return {
    totalAttempts: validResults.length,
    completedExams: completedExams.length,
    averageScore: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0,
    bestScore: scores.length ? Math.max(...scores) : 0,
    examResults: validResults,
    examTypes,
  };
}

/**
 * Get all available MIL exams
 */
export async function getAllMILExams(
  language: "english" | "spanish" = "english"
): Promise<MILExamMetadata[]> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const json = await apiRequest(`/api/pcaexam/exams?lang=${langParam}`);
    return Array.isArray(json) ? json : json.data || [];
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403) return [];
    throw error;
  }
}

/**
 * Get specific MIL exam by ID
 */
export async function getMILExamById(
  examId: MILExamId,
  language: "english" | "spanish" = "english"
): Promise<MILExam> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const result = await apiRequest(`/api/pcaexam/exams/${examId}?lang=${langParam}`);
    return result?.data || result;
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403) return null as any;
    throw error;
  }
}

/**
 * Start MIL exam session
 */
export async function startMILExam(
  examId: MILExamId,
  language: "english" | "spanish" = "english"
): Promise<MILExam> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const result = await apiRequest(
      `/api/pcaexam/exams/${examId}/start?lang=${langParam}`,
      { method: "POST" }
    );
    // API returns { success, data: { sessionId, questions, ... } } — unwrap
    return result?.data || result;
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403) return null as any;
    throw error;
  }
}

/**
 * Get exam instructions
 */
export async function getMILExamInstructions(
  examId: MILExamId,
  language: "english" | "spanish" = "english"
): Promise<any> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const result = await apiRequest(
      `/api/pcaexam/exams/${examId}/instructions?lang=${langParam}`
    );
    return result?.data || result;
  } catch (error) {
    if ((error as any)?.response?.status === 401 || (error as any)?.response?.status === 403) return null;

    // Fallback to local instructions for pattern recognition and numeric velocity
    if (examId === MIL_EXAMS.FEATURE_DETECTION) {
      const { getPatternRecognitionInstructions } = await import(
        "@/utils/milTestUtils"
      );
      return {
        instructions: getPatternRecognitionInstructions(language),
        timeLimit: 3,
        examType: 1,
      };
    } else if (examId === MIL_EXAMS.NUMERICAL_SPEED_ACCURACY) {
      const { getNumericVelocityInstructions } = await import(
        "@/utils/milTestUtils"
      );
      return {
        instructions: getNumericVelocityInstructions(language),
        timeLimit: 4,
        examType: 4,
      };
    } else if (examId === MIL_EXAMS.WORKING_MEMORY) {
      const { getWorkingMemoryInstructions } = await import(
        "@/utils/milTestUtils"
      );
      return {
        instructions: getWorkingMemoryInstructions(language),
        timeLimit: 4,
        examType: 3,
      };
    } else if (examId === MIL_EXAMS.SPATIAL_ORIENTATION) {
      const { getVisualRotationInstructions } = await import(
        "@/utils/milTestUtils"
      );
      return {
        instructions: getVisualRotationInstructions(language),
        timeLimit: 5,
        examType: 5,
      };
    }

    throw error;
  }
}

/**
 * Submit MIL exam for scoring
 */
export async function submitMILExam(
  session: MILSession,
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<any> {
  const examAnswers = session.answers.map((answer) => ({
    questionNumber: answer.questionNumber,
    selectedAnswer: answer.answer.toString(),
    isAnswered: true,
    timeSpent: formatTimeSpent(answer.timeSpent),
  }));

  const submissionData = {
    sessionId: session.apiSessionId,
    examId: session.examId,
    userId: userId,
    startTime: session.startTime,
    endTime: new Date().toISOString(),
    isTimeExpired: false,
    answers: examAnswers,
  };

  const langParam = language === "spanish" ? "sp" : "en";
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const url = `${baseUrl}/api/pcaexam/submit?lang=${langParam}`;
  const submissionKey = `submit_${session.examId}_${userId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  try {
    const response = await submitWithRetry(url, submissionData, headers);
    // Success — remove any pending submission for this exam
    removePendingSubmission(submissionKey);
    return await response.json();
  } catch (retryError) {
    // All retries failed — persist for later
    savePendingSubmission(submissionKey, url, submissionData);
    throw retryError;
  }
}

/**
 * Complete MIL exam (for time-expired scenarios)
 */
export async function completeMILExam(
  session: MILSession,
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<any> {
  const examAnswers = session.answers.map((answer) => ({
    questionNumber: answer.questionNumber,
    selectedAnswer: answer.answer.toString(),
    isAnswered: true,
    timeSpent: formatTimeSpent(answer.timeSpent),
  }));

  const completionData = {
    sessionId: session.apiSessionId,
    examId: session.examId,
    userId: userId,
    startTime: session.startTime,
    endTime: new Date().toISOString(),
    isTimeExpired: true,
    isCompleted: false,
    answers: examAnswers,
  };

  const langParam = language === "spanish" ? "sp" : "en";
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const url = `${baseUrl}/api/pcaexam/complete?lang=${langParam}`;
  const completionKey = `complete_${session.examId}_${userId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  try {
    const response = await submitWithRetry(url, completionData, headers);
    // Success — remove any pending submission for this exam
    removePendingSubmission(completionKey);
    return await response.json();
  } catch (retryError) {
    // All retries failed — persist for later
    savePendingSubmission(completionKey, url, completionData);
    throw retryError;
  }
}

/**
 * Format time spent in HH:MM:SS format for API
 */
function formatTimeSpent(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Save MIL session to localStorage
 */
export function saveMILSession(session: MILSession): void {
  try {
    localStorage.setItem(
      `mil_session_${session.examId}`,
      JSON.stringify(session)
    );
  } catch (error) {
    // error handled silently
  }
}

/**
 * Load MIL session from localStorage
 */
export function loadMILSession(examId: string): MILSession | null {
  try {
    const sessionData = localStorage.getItem(`mil_session_${examId}`);
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Clear MIL session from localStorage
 */
export function clearMILSession(examId: string): void {
  try {
    localStorage.removeItem(`mil_session_${examId}`);
  } catch (error) {
    // error handled silently
  }
}

/**
 * Calculate matching letter pairs for pattern recognition
 */
export function calculateMatchingPairs(
  letterPairs: Array<{ topLetter: string; bottomLetter: string }>
): number {
  return letterPairs.filter(
    (pair) => pair.topLetter.toLowerCase() === pair.bottomLetter.toLowerCase()
  ).length;
}

/**
 * Validate answer for pattern recognition questions
 */
export function validatePatternRecognitionAnswer(
  question: MILQuestion,
  answer: number
): boolean {
  if (!question.data.letterPairs) return false;
  const correctAnswer = calculateMatchingPairs(question.data.letterPairs);
  return answer === correctAnswer;
}

/**
 * Generic answer validation for all question types
 */
export function validateAnswer(question: MILQuestion, answer: number): boolean {
  // If API provides correctAnswer, use it
  if (question.correctAnswer !== undefined) {
    return answer === question.correctAnswer;
  }

  // For Pattern Recognition, calculate from letter pairs
  if (question.data.letterPairs) {
    return validatePatternRecognitionAnswer(question, answer);
  }

  // For other types without correctAnswer, we can't validate in practice
  return true; // Allow to proceed
}

/**
 * Format time in MM:SS format
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Check if user has tab focus (for preventing cheating)
 */
export function setupTabFocusMonitoring(
  onTabLeave: () => void,
  onTabReturn: () => void
): () => void {
  let isCurrentlyActive = !document.hidden && document.hasFocus();
  let debounceTimeout: NodeJS.Timeout | null = null;
  let lastEventTime = 0;

  const checkAndUpdateState = (eventType: string) => {
    const now = Date.now();

    // Clear any pending debounce
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    // Debounce to prevent rapid fire events from multiple sources
    debounceTimeout = setTimeout(() => {
      // Only process if enough time has passed since last event
      if (now - lastEventTime < 50) {
        return;
      }

      lastEventTime = now;

      // Determine current state using multiple checks
      const isDocumentVisible = !document.hidden;
      const isWindowFocused = document.hasFocus();
      const isNowActive = isDocumentVisible && isWindowFocused;

      if (isCurrentlyActive && !isNowActive) {
        // Tab became inactive
        isCurrentlyActive = false;
        onTabLeave();
      } else if (!isCurrentlyActive && isNowActive) {
        // Tab became active
        isCurrentlyActive = true;
        onTabReturn();
      }
    }, 150); // Increased debounce time
  };

  const handleVisibilityChange = () => {
    checkAndUpdateState("visibility");
  };

  const handleBlur = () => {
    checkAndUpdateState("blur");
  };

  const handleFocus = () => {
    checkAndUpdateState("focus");
  };

  // Add event listeners
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("focus", handleFocus);

  // Return cleanup function
  return () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("focus", handleFocus);
  };
}
