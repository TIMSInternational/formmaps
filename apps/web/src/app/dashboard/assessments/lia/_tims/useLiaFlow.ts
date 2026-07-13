"use client";

/**
 * LIA flow state machine — the tims-suite LIAEvaluation orchestration:
 * overview → general-instructions → subtest-intro → practice → assessment,
 * with between-subtest transitions going straight to practice (intro skipped),
 * timeout marking, and auto-completion on the last subtest.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  liaAssessmentApi,
  SUBTEST_ORDER,
  type LIAQuestion,
  type LIASubtest,
  type LockdownViolation,
} from "@/services/liaService";

export type LiaPhase =
  | "loading"
  | "overview"
  | "already-completed"
  | "general-instructions"
  | "subtest-intro"
  | "practice"
  | "assessment"
  | "completed";

export interface LiaFlow {
  phase: LiaPhase;
  sessionId: string | null;
  hasResumableSession: boolean;
  sessionError: string | null;
  currentSubtest: LIASubtest;
  currentSubtestIndex: number;
  practiceQuestions: LIAQuestion[];
  assessmentQuestions: LIAQuestion[];
  currentQuestionIndex: number;
  subtestStartTime: Date | null;
  timeLimitSeconds: number;
  isSubmitting: boolean;
  begin: () => Promise<void>;
  continueToIntro: () => void;
  startPractice: () => void;
  submitPracticeAnswer: (
    questionId: string,
    answer: string,
  ) => Promise<{ is_correct: boolean; correct_answer: string; practice_complete: boolean; error?: boolean }>;
  startAssessment: () => Promise<void>;
  submitAssessmentAnswer: (answer?: string) => Promise<void>;
  handleTimeout: () => Promise<void>;
  retry: () => void;
}

interface FlowCallbacks {
  language: "es" | "en";
  onLockdownBegin: () => void;
  onLockdownEnd: () => void;
  drainViolations: () => LockdownViolation[];
}

export function useLiaFlow({ language, onLockdownBegin, onLockdownEnd, drainViolations }: FlowCallbacks): LiaFlow {
  const [phase, setPhase] = useState<LiaPhase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasResumableSession, setHasResumableSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currentSubtest, setCurrentSubtest] = useState<LIASubtest>("pattern_recognition");
  const [practiceQuestions, setPracticeQuestions] = useState<LIAQuestion[]>([]);
  const [assessmentQuestions, setAssessmentQuestions] = useState<LIAQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [subtestStartTime, setSubtestStartTime] = useState<Date | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const questionStartTimeRef = useRef<number>(Date.now());
  // Guards against a double-tap / answer-then-Omitir firing two POSTs for the
  // same item — the desync that over-advanced the client into the freeze.
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    liaAssessmentApi
      .checkAccess()
      .then((access) => {
        if (cancelled) return;
        setHasResumableSession(!!access.existing_session_id && !access.has_completed);
        setPhase(access.has_completed ? "already-completed" : "overview");
      })
      .catch(() => {
        if (!cancelled) setSessionError("access_check_failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const begin = useCallback(async () => {
    try {
      const result = await liaAssessmentApi.start({
        language,
        device_info:
          typeof window !== "undefined"
            ? { userAgent: navigator.userAgent, screenWidth: window.screen.width, screenHeight: window.screen.height }
            : undefined,
      });
      setSessionId(result.session_id);
      setCurrentSubtest(result.current_subtest);
      setPracticeQuestions(result.practice_questions);
      onLockdownBegin();
      setPhase("general-instructions");
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 409) setPhase("already-completed");
      else setSessionError("start_failed");
    }
  }, [language, onLockdownBegin]);

  const continueToIntro = useCallback(() => setPhase("subtest-intro"), []);
  const startPractice = useCallback(() => setPhase("practice"), []);

  const submitPracticeAnswer = useCallback(
    async (questionId: string, answer: string) => {
      if (!sessionId) return { is_correct: false, correct_answer: "", practice_complete: false };
      try {
        return await liaAssessmentApi.submitPracticeAnswer(sessionId, { question_id: questionId, answer });
      } catch {
        // NEVER echo the user's own answer back as "the correct answer" — that
        // fabricated a rotating key and trapped users in practice. Surface an
        // honest error flag so the UI shows a retry, not a false correct answer.
        return { is_correct: false, correct_answer: "", practice_complete: false, error: true };
      }
    },
    [sessionId],
  );

  const startAssessment = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await liaAssessmentApi.startSubtest(sessionId, { subtest: currentSubtest });
      setAssessmentQuestions(result.questions);
      setCurrentQuestionIndex(0);
      setSubtestStartTime(new Date(result.started_at));
      setTimeLimitSeconds(result.time_limit_seconds);
      questionStartTimeRef.current = Date.now();
      setPhase("assessment");
    } catch {
      setSessionError("subtest_start_failed");
    }
  }, [sessionId, currentSubtest]);

  const finishAssessment = useCallback(async () => {
    if (!sessionId) return;
    const violations = drainViolations();
    if (violations.length > 0) {
      await liaAssessmentApi.saveViolations(sessionId, violations).catch(() => {});
    }
    // Server auto-completes on the final answer; this explicit call is the
    // idempotent tims-parity fallback for the timeout/last-answer race.
    await liaAssessmentApi.complete(sessionId).catch(() => {});
    onLockdownEnd();
    setPhase("completed");
  }, [sessionId, drainViolations, onLockdownEnd]);

  const advanceToNextSubtest = useCallback(
    async (nextSubtest: LIASubtest) => {
      if (!sessionId) return;
      // Phase first, then swap data — prevents rendering the old subtest's
      // items against the new subtest (tims ordering).
      setPhase("practice");
      setAssessmentQuestions([]);
      setCurrentSubtest(nextSubtest);
      setCurrentQuestionIndex(0);
      const questions = await liaAssessmentApi.getPracticeQuestions(sessionId);
      setPracticeQuestions(questions);
    },
    [sessionId],
  );

  const handleTimeout = useCallback(async () => {
    if (!sessionId) return;
    const unansweredIds = assessmentQuestions.slice(currentQuestionIndex).map((q) => q.id);
    try {
      const result = await liaAssessmentApi.handleTimeout(sessionId, {
        subtest: currentSubtest,
        unanswered_question_ids: unansweredIds,
      });
      if (result.assessment_complete) await finishAssessment();
      else if (result.next_subtest) await advanceToNextSubtest(result.next_subtest);
    } catch {
      setSessionError("timeout_failed");
    }
  }, [sessionId, assessmentQuestions, currentQuestionIndex, currentSubtest, finishAssessment, advanceToNextSubtest]);

  const submitAssessmentAnswer = useCallback(
    async (answer?: string) => {
      if (!sessionId || !assessmentQuestions[currentQuestionIndex]) return;
      if (submittingRef.current) return; // in-flight: ignore duplicate taps for this item
      submittingRef.current = true;
      setIsSubmitting(true);
      const question = assessmentQuestions[currentQuestionIndex];
      const timeSpentMs = Date.now() - questionStartTimeRef.current;
      try {
        const result = await liaAssessmentApi.submitAnswer(sessionId, {
          question_id: question.id,
          answer,
          time_spent_ms: timeSpentMs,
        });
        if (result.subtest_complete) {
          if (result.assessment_complete) await finishAssessment();
          else if (result.next_subtest) await advanceToNextSubtest(result.next_subtest);
        } else {
          // Server-authoritative position: items_completed = distinct answered =
          // the next index. Following the server (not a client i+1) means a
          // deduped/duplicate submit can never drift the client past the served
          // array into a permanent "Cargando pregunta..." freeze.
          const nextIndex =
            typeof result.items_completed === "number" ? result.items_completed : currentQuestionIndex + 1;
          if (nextIndex >= assessmentQuestions.length) {
            // Server expects more items than were served (short/misconfigured
            // bank): converge via the timeout path instead of rendering a
            // permanent "Cargando pregunta...".
            await handleTimeout();
          } else {
            setCurrentQuestionIndex(nextIndex);
            questionStartTimeRef.current = Date.now();
          }
        }
      } catch {
        // tims behavior: swallow and let the user retry the same item.
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [sessionId, assessmentQuestions, currentQuestionIndex, finishAssessment, advanceToNextSubtest, handleTimeout],
  );

  const retry = useCallback(() => {
    setSessionError(null);
    setPhase("loading");
    liaAssessmentApi
      .checkAccess()
      .then((access) => setPhase(access.has_completed ? "already-completed" : "overview"))
      .catch(() => setSessionError("access_check_failed"));
  }, []);

  return {
    phase,
    sessionId,
    hasResumableSession,
    sessionError,
    currentSubtest,
    currentSubtestIndex: SUBTEST_ORDER.indexOf(currentSubtest),
    practiceQuestions,
    assessmentQuestions,
    currentQuestionIndex,
    subtestStartTime,
    timeLimitSeconds,
    isSubmitting,
    begin,
    continueToIntro,
    startPractice,
    submitPracticeAnswer,
    startAssessment,
    submitAssessmentAnswer,
    handleTimeout,
    retry,
  };
}
