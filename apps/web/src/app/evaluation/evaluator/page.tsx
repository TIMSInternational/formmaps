"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ChevronDown, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { LoadingScreen, ErrorScreen, SuccessScreen, AlreadySubmittedScreen } from "./_components/EvaluatorStatusScreens";
import { QuestionCard } from "./_components/QuestionCard";
import { EvaluatorNavigation } from "./_components/EvaluatorNavigation";
import type { EvaluationQuestion, ApiQuestion, ApiEvaluatorData, ApiResponse, EvaluationData, QuestionResponse } from "./_components/types";
import { DEFAULT_RESPONSE_SCALE } from "./_components/types";
import { validateEvaluationToken, sendEvaluatorViolations } from "@/services/evaluationService";
import { VocationalEvaluator } from "./_components/VocationalEvaluator";
import { RequireChromium } from "@/components/proctoring/RequireChromium";
import { ProctoredShell } from "@/components/proctoring/ProctoredShell";
import { useProctoring } from "@/components/proctoring/useProctoring";
import { installViolationFlush, flushViolations } from "@/components/proctoring/flushViolations";
import type { LockdownViolation } from "@/components/proctoring/types";

export default function EvaluatorPage() {
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { user } = useGlobalStore();
  // Single source of truth for the evaluator flow's language: i18next. The API
  // content fetch (?lang) and the displayed chrome/content both derive from it,
  // so they can never diverge. I18nProvider keeps i18next in sync with the
  // persisted store preference, so this matches the user's chosen language.
  const isSpanish = i18n.language?.startsWith("es") ?? false;
  const token = searchParams.get("token");

  const [instrument, setInstrument] = useState<string | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(null);
  const [evaluatorData, setEvaluatorData] = useState<ApiEvaluatorData | null>(null);
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [showEvaluationDetails, setShowEvaluationDetails] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string>("");

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  // Proctoring: the evaluator flow is unauthenticated (token-scoped), so
  // violations flush to the token endpoint via sendBeacon, which survives a
  // killed tab and needs no auth header.
  const proctoring = useProctoring();
  // Destructure the individually-stable callbacks/ref. Depending on the whole
  // `proctoring` object would churn these effects every render (its elapsed
  // clock ticks each second), re-firing begin()/tearing down and disabling
  // proctoring mid-exam.
  const { begin: beginProctoring, end: endProctoring, drainViolations, violations: violationsRef } = proctoring;
  const startedRef = useRef(false);
  const violationsUrl = token ? `${API_BASE_URL}/evaluation/vocational/${token}/violations` : "";

  // Begin proctoring once the interactive runner is reachable; end on
  // completion or unmount.
  const interactive =
    (instrument === "vocational" && !!token) ||
    (!!evaluationData && !alreadySubmitted && !success);
  useEffect(() => {
    if (interactive && !startedRef.current) {
      startedRef.current = true;
      beginProctoring();
    }
  }, [interactive, beginProctoring]);
  useEffect(() => {
    if (success || alreadySubmitted) endProctoring();
  }, [success, alreadySubmitted, endProctoring]);

  // Incremental flush that survives a killed tab; flush + cleanup on unmount.
  useEffect(() => {
    if (!violationsUrl) return;
    const cfg = {
      url: violationsUrl,
      transport: "beacon" as const,
      drain: drainViolations,
      requeue: (v: LockdownViolation[]) => { violationsRef.current.unshift(...v); },
    };
    const cleanup = installViolationFlush(cfg);
    return () => {
      flushViolations(cfg);
      cleanup();
      endProctoring();
    };
  }, [violationsUrl, drainViolations, endProctoring, violationsRef]);

  useEffect(() => {
    if (!token) {
      setError(t("evaluation.evaluator.errNoToken"));
      setIsLoading(false);
      setIsValidating(false);
      setInstrument(null);
      return;
    }
    (async () => {
      const result = await validateEvaluationToken(token);
      const resolvedInstrument = result.instrument ?? null;
      setInstrument(resolvedInstrument);
      if (resolvedInstrument === "vocational") {
        setIsLoading(false);
        setIsValidating(false);
        return;
      }
      loadEvaluationData();
    })();
  }, [token]);

  const loadEvaluationData = async () => {
    try {
      setIsLoading(true);
      setIsValidating(true);

      const langParam = isSpanish ? "sp" : "en";
      const response = await fetch(
        `${API_BASE_URL}/evaluation/360evolutor/${token}?lang=${langParam}`,
        { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.errorMessage || t("evaluation.evaluator.errLoadFailed", { status: response.status }));
      }

      const data: ApiResponse = await response.json();
      const responseData = data.data || data;
      const questionsRaw = (responseData as any).questions || data.questions || [];
      const evaluator = (responseData as any).evaluatorName ? responseData as unknown as ApiEvaluatorData : data.evaluatorData;

      const apiInvitationToken = (responseData as any).invitationToken || (responseData as any).InvitationToken || "";
      if (apiInvitationToken) {
        setInvitationToken(apiInvitationToken);
      }

      if (evaluator) {
        setEvaluatorData(evaluator);
        if (evaluator.isEvaluationCompleted) {
          setAlreadySubmitted(true);
          setIsLoading(false);
          setIsValidating(false);
          return;
        }
      }

      const scale = (responseData as any).responseScale || data.responseScale || DEFAULT_RESPONSE_SCALE;

      const questions: EvaluationQuestion[] = questionsRaw.map((q: ApiQuestion, index: number) => ({
        id: q.id || `q-${index}`,
        questionText: q.questionEnglishText || (q as any).questionText || "",
        questionTextSpanish: q.questionSpanishText || (q as any).questionTextEs || "",
        questionType: "both" as const,
        isRequired: true,
        order: q.questionNumber || index + 1,
        category: q.category,
        relationType: q.relationType,
        isSubQuestion: q.isSubQuestion,
        parentQuestionId: q.parentQuestionId,
      }));

      if (questions.length === 0) {
        throw new Error(t("evaluation.evaluator.errNoQuestions"));
      }

      setEvaluationData({
        questions,
        evaluatorGroupId: (responseData as any).evolutorGroupId || token!,
        responseScale: scale,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("evaluation.evaluator.errLoadGeneric"));
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  };

  const handleResponseChange = (questionId: string, field: "rating" | "textResponse", value: number | string) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], [field]: value },
    }));
  };

  const progress = evaluationData
    ? ((currentStep + 1) / evaluationData.questions.length) * 100
    : 0;

  const nextStep = () => {
    if (!evaluationData) return;
    if (currentStep < evaluationData.questions.length - 1) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const handleSubmit = async () => {
    if (!evaluationData) return;
    try {
      setIsSubmitting(true);
      setError(null);

      // Only submit answered questions — a rating is required. Comment-only
      // entries are dropped (the API rejects null ratings). Send the question's
      // category so backend derivation never depends on question numbering.
      const answers = evaluationData.questions
        .filter((q) => typeof responses[q.id]?.rating === "number")
        .map((q) => ({
          questionNumber: q.order,
          questionId: q.id,
          category: q.category,
          questionText: q.questionText || `Question ${q.order}`,
          rating: responses[q.id]!.rating as number,
          comment: responses[q.id]?.textResponse || "",
        }));

      const submitData = {
        // The backend resolves the group by (id + invitationToken). The URL only
        // carries the token, so use the real group id returned by get360EvaluatorForm.
        evaluationGroupId: evaluationData.evaluatorGroupId,
        evaluatorEmail: evaluatorData?.evaluatorEmail || "",
        token: invitationToken || token || "",
        answers,
        comment: "",
      };

      const langParam = isSpanish ? "sp" : "en";
      const response = await fetch(
        `${API_BASE_URL}/evaluation/submit-feedback?lang=${langParam}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || t("evaluation.evaluator.errSubmitFailed"));
      }

      setSuccess(true);
      // Flush any recorded proctoring violations on successful submission.
      const drained = proctoring.drainViolations();
      if (token && drained.length) void sendEvaluatorViolations(token, drained);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("evaluation.evaluator.errSubmitRetry"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Wrap an interactive runner in the browser gate + proctoring chrome.
  const proctored = (node: ReactNode) => (
    <RequireChromium>
      <ProctoredShell proctoring={proctoring}>{node}</ProctoredShell>
    </RequireChromium>
  );

  // --- RENDER STATES ---
  if (isLoading || isValidating) return <LoadingScreen />;
  // instrument branch: early-return before generic 360 body
  if (instrument === undefined) return <LoadingScreen />;
  if (instrument === "vocational" && token) return proctored(<VocationalEvaluator token={token} />);
  if (error && !evaluationData) return <ErrorScreen error={error} />;

  if (success) {
    // NEVER auto-route a token-link evaluator into the app. Only an authenticated
    // user (a student finishing their own self-evaluation) is offered a way back.
    return <SuccessScreen returnHref={user?.isAuthenticated ? "/dashboard/assessments" : undefined} />;
  }

  if (alreadySubmitted) return <AlreadySubmittedScreen />;
  if (!evaluationData) return null;

  const currentQuestion = evaluationData.questions[currentStep];

  return proctored(
    // Own scroll region — the standalone evaluator route renders under
    // body{overflow:hidden} (no AppShell), so content/nav clipped off-screen
    // unless zoomed out. h-dvh + overflow makes the page scrollable at any zoom.
    <div className="h-dvh overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-28 md:pb-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            360° {t("evaluation.evaluator.title360")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("evaluation.evaluator.subtitle")}
          </p>
        </motion.div>

        {/* Evaluator info -- collapsible */}
        {evaluatorData && (
          <div className="dash-card mb-4 overflow-hidden">
            <button
              onClick={() => setShowEvaluationDetails(!showEvaluationDetails)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <span className="text-xs font-semibold text-foreground">
                {t("evaluation.evaluator.details")}
                <span className="text-muted-foreground font-normal ml-2">
                  {evaluatorData.evaluatorName} → {evaluatorData.evaluatedUserName}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showEvaluationDetails ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {showEvaluationDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">{t("evaluation.evaluator.evaluatorLabel")}</span> <span className="font-medium text-foreground">{evaluatorData.evaluatorName}</span></div>
                    <div><span className="text-muted-foreground">{t("evaluation.evaluator.evaluatingLabel")}</span> <span className="font-medium text-foreground">{evaluatorData.evaluatedUserName}</span></div>
                    <div><span className="text-muted-foreground">{t("evaluation.evaluator.relationLabel")}</span> <span className="font-medium text-foreground">{evaluatorData.relation}</span></div>
                    <div><span className="text-muted-foreground">{t("evaluation.evaluator.groupLabel")}</span> <span className="font-medium text-foreground">{evaluatorData.groupType}</span></div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Progress bar */}
        <div className="dash-card p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">
              {t("evaluation.evaluator.question")} {currentStep + 1}/{evaluationData.questions.length}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <motion.div
              className="bg-foreground h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Question card */}
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            stepIndex={currentStep}
            direction={direction}
            responseScale={evaluationData.responseScale}
            response={responses[currentQuestion.id]}
            onResponseChange={handleResponseChange}
          />
        )}
      </div>

      {/* Fixed bottom navigation */}
      <EvaluatorNavigation
        currentStep={currentStep}
        totalQuestions={evaluationData.questions.length}
        questionIds={evaluationData.questions.map((q) => q.id)}
        responses={responses}
        isSubmitting={isSubmitting}
        onPrev={prevStep}
        onNext={nextStep}
        onGoToStep={goToStep}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

