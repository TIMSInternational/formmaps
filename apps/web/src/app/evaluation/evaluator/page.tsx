"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { LoadingScreen, ErrorScreen, SuccessScreen, AlreadySubmittedScreen } from "./_components/EvaluatorStatusScreens";
import { QuestionCard } from "./_components/QuestionCard";
import { EvaluatorNavigation } from "./_components/EvaluatorNavigation";
import type { EvaluationQuestion, ApiQuestion, ApiEvaluatorData, ApiResponse, EvaluationData, QuestionResponse } from "./_components/types";
import { DEFAULT_RESPONSE_SCALE } from "./_components/types";

export default function EvaluatorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useGlobalStore();
  const token = searchParams.get("t");

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

  useEffect(() => {
    if (!token) {
      setError("No evaluation token provided.");
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    loadEvaluationData();
  }, [token]);

  const loadEvaluationData = async () => {
    try {
      setIsLoading(true);
      setIsValidating(true);

      const langParam = language === "spanish" ? "sp" : "en";
      const response = await fetch(
        `${API_BASE_URL}/evaluation/360evolutor/${token}?lang=${langParam}`,
        { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.errorMessage || `Failed to load evaluation (${response.status})`);
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
        questionText: q.questionEnglishText,
        questionTextSpanish: q.questionSpanishText,
        questionType: "both" as const,
        isRequired: true,
        order: q.questionNumber || index + 1,
        category: q.category,
        relationType: q.relationType,
        isSubQuestion: q.isSubQuestion,
        parentQuestionId: q.parentQuestionId,
      }));

      if (questions.length === 0) {
        throw new Error("No questions available for this evaluation.");
      }

      setEvaluationData({
        questions,
        evaluatorGroupId: (responseData as any).evolutorGroupId || token!,
        responseScale: scale,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluation.");
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

      const answers = evaluationData.questions
        .filter((q) => responses[q.id]?.rating || responses[q.id]?.textResponse)
        .map((q) => ({
          questionNumber: q.order,
          questionText: q.questionText || `Question ${q.order}`,
          rating: responses[q.id]?.rating || null,
          comment: responses[q.id]?.textResponse || "",
        }));

      const submitData = {
        evaluationGroupId: token || "",
        evaluatorEmail: evaluatorData?.evaluatorEmail || "",
        token: invitationToken || "",
        answers,
        comment: "",
      };

      const langParam = language === "spanish" ? "sp" : "en";
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
        throw new Error(errorData?.message || "Failed to submit evaluation.");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit evaluation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER STATES ---
  if (isLoading || isValidating) return <LoadingScreen />;
  if (error && !evaluationData) return <ErrorScreen error={error} />;

  if (success) {
    setTimeout(() => { router.push("/dashboard/assessments"); }, 2500);
    return <SuccessScreen />;
  }

  if (alreadySubmitted) return <AlreadySubmittedScreen />;
  if (!evaluationData) return null;

  const currentQuestion = evaluationData.questions[currentStep];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-28 md:pb-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            360° {language === "spanish" ? "Evaluacion" : "Evaluation"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "spanish"
              ? "Ayudanos a comprender las fortalezas profesionales"
              : "Help us understand career strengths"}
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
                {language === "spanish" ? "Detalles" : "Details"}
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
                    <div><span className="text-muted-foreground">Evaluator:</span> <span className="font-medium text-foreground">{evaluatorData.evaluatorName}</span></div>
                    <div><span className="text-muted-foreground">Evaluating:</span> <span className="font-medium text-foreground">{evaluatorData.evaluatedUserName}</span></div>
                    <div><span className="text-muted-foreground">Relation:</span> <span className="font-medium text-foreground">{evaluatorData.relation}</span></div>
                    <div><span className="text-muted-foreground">Group:</span> <span className="font-medium text-foreground">{evaluatorData.groupType}</span></div>
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
              {language === "spanish" ? "Pregunta" : "Question"} {currentStep + 1}/{evaluationData.questions.length}
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
            language={language}
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
        language={language}
        onPrev={prevStep}
        onNext={nextStep}
        onGoToStep={goToStep}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
