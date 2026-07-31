"use client";

/**
 * LIA / MIL assessment — tims-suite parity flow.
 *
 * Phases: overview → general-instructions → subtest-intro → practice →
 * assessment (per subtest; later subtests skip the intro) → completed.
 * Runs under lockdown-lite (fullscreen + violation capture); face
 * verification is stubbed behind NEXT_PUBLIC_LIA_FACE_VERIFY.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  SUBTEST_ORDER,
  resolveContentLanguage,
  type PatternRecognitionData,
  type VerbalReasoningData,
  type NumericalSpeedData,
  type WorkingMemoryData,
  type VisualRotationData,
} from "@/services/liaService";
import {
  LIAGeneralInstructions,
  LIASubtestIntro,
  LIAPractice,
  TimerWarningToast,
  PatternRecognitionItem,
  VerbalReasoningItem,
  NumericalSpeedItem,
  WorkingMemoryItem,
  VisualRotationItem,
} from "./_tims";
import { useLiaFlow } from "./_tims/useLiaFlow";
import { useLockdown } from "./_tims/useLockdown";
import { ErrorScreen, ProgressHeader, OverviewCard } from "./_tims/FlowScreens";
import { ProctoredShell } from "@/components/proctoring/ProctoredShell";
import { RequireChromium } from "@/components/proctoring/RequireChromium";
import { installViolationFlush, postViolations } from "@/components/proctoring/flushViolations";
import type { LockdownViolation } from "@/components/proctoring/types";
import MILCompletion from "./_components/MILCompletion";

export default function LIAAssessmentPage() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const { setAssessmentActive, user } = useGlobalStore();
  // Content language follows the RESOLVED UI locale (i18next), not the store's
  // English default — otherwise a Spanish user's session was created in English
  // and switched to English items at Verbal Reasoning.
  const language: "es" | "en" = resolveContentLanguage(i18n.language);

  // The session id only exists once `useLiaFlow` (below) starts a session, but
  // `useLockdown`/`useProctoring` must be constructed first (the flow needs
  // `lockdown.begin`/`end`/`drainViolations`) — a ref bridges that ordering so
  // the live per-event flush (onFlush) can reach the current session id
  // without re-creating the proctoring hook every time it changes.
  const sessionIdRef = useRef<string | null>(null);
  const lockdown = useLockdown({
    onFlush: (v) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      postViolations(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/api/v1/lia/session/${sid}/violations`,
        v,
        {
          token: useGlobalStore.getState().user.accessToken,
          // Failed live-flush violations go back into the buffer so the
          // pagehide/tab-hide backstop below re-sends them — no evidence loss.
          requeue: (failed) => { lockdown.violations.current.unshift(...failed); },
        },
      );
    },
  });
  const flow = useLiaFlow({
    language,
    onLockdownBegin: lockdown.begin,
    onLockdownEnd: lockdown.end,
    drainViolations: lockdown.drainViolations,
  });
  const [timerWarning, setTimerWarning] = useState<number | null>(null);

  // Block the AI chat while the exam is live (existing FormMaps behavior).
  useEffect(() => {
    const examLive = flow.phase === "practice" || flow.phase === "assessment";
    setAssessmentActive(examLive);
    return () => setAssessmentActive(false);
  }, [flow.phase, setAssessmentActive]);

  // Incremental violation flush that survives a killed tab (keepalive fetch,
  // cookie + Bearer authed). The completion path drains too; this covers a
  // student closing/killing the tab mid-exam so flag_for_review still lands.
  const { sessionId } = flow;
  sessionIdRef.current = sessionId ?? null;
  const { drainViolations: drainLockdown, violations: lockdownViolations } = lockdown;
  useEffect(() => {
    if (!sessionId) return;
    return installViolationFlush({
      url: `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/api/v1/lia/session/${sessionId}/violations`,
      transport: "keepalive",
      drain: drainLockdown,
      token: () => useGlobalStore.getState().user.accessToken,
      requeue: (v: LockdownViolation[]) => { lockdownViolations.current.unshift(...v); },
    });
  }, [sessionId, drainLockdown, lockdownViolations]);

  // Wrap a live exam phase in the browser gate + proctoring chrome.
  const watermark = user?.email ? { email: user.email } : undefined;
  const proctored = (node: ReactNode) => (
    <RequireChromium>
      <ProctoredShell proctoring={lockdown} watermark={watermark}>{node}</ProctoredShell>
    </RequireChromium>
  );

  const handleTimerWarning = useCallback((secondsLeft: number) => setTimerWarning(secondsLeft), []);

  // A ≤10s/≤30s warning from the PREVIOUS subtest can outlive its toast (the
  // toast unmounts on the phase change before its auto-close fires), which
  // made the red "¡10 segundos!" banner appear at the start of the next
  // subtest. Every entry into the assessment phase goes through here, so
  // clearing now guarantees each subtest starts warning-free.
  const { startAssessment } = flow;
  const handlePracticeComplete = useCallback(() => {
    setTimerWarning(null);
    void startAssessment();
  }, [startAssessment]);

  if (flow.sessionError) {
    return <ErrorScreen language={language} onRetry={flow.retry} />;
  }

  if (flow.phase === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#102B47] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (flow.phase === "already-completed") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {language === "es" ? "Evaluación Completada" : "Assessment Completed"}
          </h2>
          <p className="text-gray-600 mb-6">
            {language === "es"
              ? "Ya completaste la evaluación MIL. Puedes revisar tus resultados."
              : "You already completed the LIA assessment. You can review your results."}
          </p>
          <button
            onClick={() => router.push("/dashboard/assessments/lia/results")}
            className="w-full py-3 bg-[#102B47] text-white rounded-xl font-semibold hover:bg-[#0b1f33] transition-colors"
          >
            {language === "es" ? "Ver Resultados" : "View Results"}
          </button>
        </div>
      </div>
    );
  }

  if (flow.phase === "overview") {
    return <OverviewCard language={language} resuming={flow.hasResumableSession} onBegin={flow.begin} />;
  }

  if (flow.phase === "locked") {
    return <OverviewCard language={language} resuming={false} locked onBegin={flow.begin} />;
  }

  if (flow.phase === "completed") {
    return (
      <MILCompletion
        onViewResults={() => router.push("/dashboard/assessments/lia/results")}
        onReturnToDashboard={() => router.push("/dashboard")}
      />
    );
  }

  if (flow.phase === "general-instructions") {
    return (
      <div className="min-h-screen bg-gray-50">
        {proctored(<LIAGeneralInstructions onContinue={flow.continueToIntro} language={language} />)}
      </div>
    );
  }

  if (flow.phase === "subtest-intro") {
    return (
      <div className="min-h-screen bg-gray-50">
        {proctored(
          <LIASubtestIntro
            subtest={flow.currentSubtest}
            subtestNumber={flow.currentSubtestIndex + 1}
            onStartPractice={flow.startPractice}
            language={language}
          />
        )}
      </div>
    );
  }

  if (flow.phase === "practice") {
    return (
      <div className="min-h-screen bg-gray-50">
        {proctored(
          <LIAPractice
            subtest={flow.currentSubtest}
            questions={flow.practiceQuestions}
            onComplete={handlePracticeComplete}
            onSubmitAnswer={flow.submitPracticeAnswer}
            language={language}
          />
        )}
      </div>
    );
  }

  if (flow.phase === "assessment" && flow.subtestStartTime) {
    const question = flow.assessmentQuestions[flow.currentQuestionIndex];
    const data = question?.question_data;

    return (
      <div className="min-h-screen bg-gray-50">
        {proctored(
        <>
        {timerWarning !== null && <TimerWarningToast secondsLeft={timerWarning} onClose={() => setTimerWarning(null)} />}
        <ProgressHeader
          language={language}
          currentSubtest={flow.currentSubtest}
          currentSubtestIndex={flow.currentSubtestIndex}
          currentQuestionIndex={flow.currentQuestionIndex}
          lockdownActive={lockdown.active}
          subtestStartTime={flow.subtestStartTime}
          timeLimitSeconds={flow.timeLimitSeconds}
          onTimeout={flow.handleTimeout}
          onWarning={handleTimerWarning}
        />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-sm p-8">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {language === "es"
                  ? `Sección ${flow.currentSubtestIndex + 1} de ${SUBTEST_ORDER.length}`
                  : `Section ${flow.currentSubtestIndex + 1} of ${SUBTEST_ORDER.length}`}
              </span>
            </div>
            <div className="mb-8">
              {data ? (
                flow.currentSubtest === "pattern_recognition" ? (
                  <PatternRecognitionItem data={data as PatternRecognitionData} onAnswer={flow.submitAssessmentAnswer} disabled={flow.isSubmitting} />
                ) : flow.currentSubtest === "verbal_reasoning" ? (
                  <VerbalReasoningItem data={data as VerbalReasoningData} onAnswer={flow.submitAssessmentAnswer} disabled={flow.isSubmitting} />
                ) : flow.currentSubtest === "numerical_speed" ? (
                  <NumericalSpeedItem data={data as NumericalSpeedData} onAnswer={flow.submitAssessmentAnswer} disabled={flow.isSubmitting} />
                ) : flow.currentSubtest === "working_memory" ? (
                  <WorkingMemoryItem data={data as WorkingMemoryData} onAnswer={flow.submitAssessmentAnswer} disabled={flow.isSubmitting} />
                ) : (
                  <VisualRotationItem data={data as VisualRotationData} onAnswer={flow.submitAssessmentAnswer} disabled={flow.isSubmitting} />
                )
              ) : (
                <div className="flex items-center justify-center p-8">
                  <p className="text-gray-500">{language === "es" ? "Cargando pregunta..." : "Loading question..."}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => flow.submitAssessmentAnswer(undefined)}
                disabled={flow.isSubmitting}
                className="px-6 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {language === "es" ? "Omitir →" : "Skip →"}
              </button>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-4">
            {language === "es"
              ? "Esta sección es cronometrada. Responde lo más rápido y preciso que puedas."
              : "This section is timed. Answer as quickly and accurately as you can."}
          </p>
        </main>
        </>
        )}
      </div>
    );
  }

  return null;
}
