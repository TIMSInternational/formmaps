"use client";

/**
 * LIA / MIL assessment — tims-suite parity flow.
 *
 * Phases: overview → general-instructions → subtest-intro → practice →
 * assessment (per subtest; later subtests skip the intro) → completed.
 * Runs under lockdown-lite (fullscreen + violation capture); face
 * verification is stubbed behind NEXT_PUBLIC_LIA_FACE_VERIFY.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  SUBTEST_ORDER,
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
import { FullscreenOverlay, LockdownBar, ErrorScreen, ProgressHeader, OverviewCard } from "./_tims/FlowScreens";
import MILCompletion from "./_components/MILCompletion";

export default function LIAAssessmentPage() {
  const router = useRouter();
  const { language: storeLanguage, setAssessmentActive } = useGlobalStore();
  const language: "es" | "en" = storeLanguage === "english" ? "en" : "es";

  const lockdown = useLockdown();
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

  const handleTimerWarning = useCallback((secondsLeft: number) => setTimerWarning(secondsLeft), []);

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
    return <OverviewCard language={language} resuming={false} onBegin={flow.begin} />;
  }

  if (flow.phase === "completed") {
    return (
      <MILCompletion
        onViewResults={() => router.push("/dashboard/assessments/lia/results")}
        onReturnToDashboard={() => router.push("/dashboard")}
      />
    );
  }

  const lockdownChrome = (
    <>
      {lockdown.active && lockdown.needsFullscreenPrompt && (
        <FullscreenOverlay language={language} onEnter={lockdown.enterFullscreen} />
      )}
      {lockdown.active && <LockdownBar language={language} elapsedTime={lockdown.elapsedTime} />}
    </>
  );

  if (flow.phase === "general-instructions") {
    return (
      <div className="min-h-screen bg-gray-50">
        {lockdownChrome}
        <LIAGeneralInstructions onContinue={flow.continueToIntro} language={language} />
      </div>
    );
  }

  if (flow.phase === "subtest-intro") {
    return (
      <div className="min-h-screen bg-gray-50">
        {lockdownChrome}
        <LIASubtestIntro
          subtest={flow.currentSubtest}
          subtestNumber={flow.currentSubtestIndex + 1}
          onStartPractice={flow.startPractice}
          language={language}
        />
      </div>
    );
  }

  if (flow.phase === "practice") {
    return (
      <div className="min-h-screen bg-gray-50">
        {lockdownChrome}
        <LIAPractice
          subtest={flow.currentSubtest}
          questions={flow.practiceQuestions}
          onComplete={flow.startAssessment}
          onSubmitAnswer={flow.submitPracticeAnswer}
          language={language}
        />
      </div>
    );
  }

  if (flow.phase === "assessment" && flow.subtestStartTime) {
    const question = flow.assessmentQuestions[flow.currentQuestionIndex];
    const data = question?.question_data;

    return (
      <div className="min-h-screen bg-gray-50">
        {lockdownChrome}
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
                  <PatternRecognitionItem data={data as PatternRecognitionData} onAnswer={flow.submitAssessmentAnswer} />
                ) : flow.currentSubtest === "verbal_reasoning" ? (
                  <VerbalReasoningItem data={data as VerbalReasoningData} onAnswer={flow.submitAssessmentAnswer} />
                ) : flow.currentSubtest === "numerical_speed" ? (
                  <NumericalSpeedItem data={data as NumericalSpeedData} onAnswer={flow.submitAssessmentAnswer} />
                ) : flow.currentSubtest === "working_memory" ? (
                  <WorkingMemoryItem data={data as WorkingMemoryData} onAnswer={flow.submitAssessmentAnswer} />
                ) : (
                  <VisualRotationItem data={data as VisualRotationData} onAnswer={flow.submitAssessmentAnswer} />
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
                className="px-6 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
      </div>
    );
  }

  return null;
}
