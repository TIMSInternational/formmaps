"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Loader2,
  Users,
  LinkIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useGlobalStore } from "@/store/useGlobalStore";

interface EvaluationQuestion {
  id: string;
  questionText: string;
  questionTextSpanish?: string;
  questionType: "rating" | "open_ended" | "both";
  isRequired: boolean;
  order: number;
  helpText?: string;
  hasRealQuestionText?: boolean;
  category?: string;
  relationType?: string;
  isSubQuestion?: boolean;
  parentQuestionId?: string | null;
}

interface EvaluationGroup {
  id: string;
  evaluatorName: string;
  evaluatorEmail: string;
  relation: string;
  groupType: string;
  evaluatedUserId: string;
  token: string;
  expiresAt: string;
  isTokenUsed: boolean;
  isEvaluationCompleted: boolean;
}

interface ApiQuestion {
  id?: string;
  questionEnglishText: string;
  questionSpanishText?: string;
  questionNumber: number;
  category?: string;
  relationType?: string;
  isSubQuestion?: boolean;
  parentQuestionId?: string | null;
}

interface ApiEvaluatorData {
  evolutorGroupId: string;
  evaluatedUserId: string;
  evaluatedUserEmail: string;
  evaluatedUserName: string;
  evaluatorName: string;
  evaluatorEmail: string;
  relationType: string;
  relation: string;
  groupType: string;
  isEvaluationCompleted: boolean;
  totalQuestions: number;
  limitedQuestions: number;
  responseScale?: ResponseScale;
  expiresAt?: string;
  isTokenUsed?: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: {
    evolutorGroupId: string;
    evaluatedUserId: string;
    evaluatedUserEmail: string;
    evaluatedUserName: string;
    evaluatorName: string;
    evaluatorEmail: string;
    relationType: string;
    relation: string;
    groupType: string;
    isEvaluationCompleted: boolean;
    totalQuestions: number;
    limitedQuestions: number;
    questions: ApiQuestion[];
    responseScale?: ResponseScale;
    expiresAt?: string;
    isTokenUsed?: boolean;
  };
  questions?: ApiQuestion[];
  evaluatorData?: ApiEvaluatorData;
  responseScale?: ResponseScale;
  totalQuestions?: number;
  message?: string;
  errorMessage?: string;
}

interface ResponseScale {
  minValue: number;
  maxValue: number;
  labels: Array<{
    value: number;
    label: string;
    labelSpanish?: string;
  }>;
}

interface EvaluationData {
  questions: EvaluationQuestion[];
  evaluatorGroupId: string;
  responseScale: ResponseScale;
}

interface QuestionResponse {
  rating?: number;
  textResponse?: string;
}

const DEFAULT_RESPONSE_SCALE: ResponseScale = {
  minValue: 1,
  maxValue: 5,
  labels: [
    { value: 1, label: "Strongly Disagree", labelSpanish: "Totalmente en desacuerdo" },
    { value: 2, label: "Disagree", labelSpanish: "En desacuerdo" },
    { value: 3, label: "Neutral", labelSpanish: "Neutral" },
    { value: 4, label: "Agree", labelSpanish: "De acuerdo" },
    { value: 5, label: "Strongly Agree", labelSpanish: "Totalmente de acuerdo" },
  ],
};

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
  const [showComments, setShowComments] = useState(false);
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

      // Capture invitation token from response
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

  const currentQuestion = evaluationData?.questions[currentStep];

  const nextStep = () => {
    if (!evaluationData) return;
    if (currentStep < evaluationData.questions.length - 1) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
      setShowComments(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
      setShowComments(false);
    }
  };

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    setShowComments(false);
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

  if (isLoading || isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading evaluation...</p>
        </div>
      </div>
    );
  }

  if (error && !evaluationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <LinkIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Link Not Available</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <p className="text-xs text-muted-foreground">Please contact your administrator</p>
        </div>
      </div>
    );
  }

  if (success) {
    setTimeout(() => {
      router.push("/dashboard/assessments");
    }, 2500);

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Thank You!</h2>
          <p className="text-sm text-muted-foreground">
            Your evaluation has been submitted successfully. Redirecting...
          </p>
        </motion.div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Already Submitted</h2>
          <p className="text-sm text-muted-foreground">
            This evaluation has already been completed. Thank you for your participation!
          </p>
        </div>
      </div>
    );
  }

  if (!evaluationData) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-28 md:pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            360° {language === "spanish" ? "Evaluación" : "Evaluation"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "spanish"
              ? "Ayúdanos a comprender las fortalezas profesionales"
              : "Help us understand career strengths"}
          </p>
        </motion.div>

        {/* Evaluator info — collapsible */}
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
        <AnimatePresence mode="wait" custom={direction}>
          {currentQuestion && (
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 200 : -200 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -200 : 200 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <div className="dash-card p-5">
                {/* Question header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center text-xs font-bold">
                    {currentStep + 1}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {language === "spanish" ? "Pregunta" : "Question"}
                  </span>
                </div>

                {/* Question text */}
                <h2 className="text-base font-semibold text-foreground leading-relaxed mb-5">
                  {language === "spanish" && currentQuestion.questionTextSpanish
                    ? currentQuestion.questionTextSpanish
                    : currentQuestion.questionText}
                </h2>

                {/* Rating label */}
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  {language === "spanish"
                    ? "¿Qué tanto estás de acuerdo?"
                    : "How much do you agree?"}
                </p>

                {/* Rating options */}
                <RadioGroup
                  value={responses[currentQuestion.id]?.rating?.toString() || ""}
                  onValueChange={(value) => handleResponseChange(currentQuestion.id, "rating", parseInt(value))}
                  className="space-y-2"
                >
                  {evaluationData.responseScale.labels.map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`${currentQuestion.id}-${option.value}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-secondary/50 transition-all cursor-pointer"
                    >
                      <RadioGroupItem
                        value={option.value.toString()}
                        id={`${currentQuestion.id}-${option.value}`}
                      />
                      <span className="text-sm text-foreground">
                        {language === "spanish" && option.labelSpanish
                          ? option.labelSpanish
                          : option.label}
                      </span>
                    </label>
                  ))}
                </RadioGroup>

                {/* Add comments toggle */}
                <button
                  onClick={() => setShowComments(!showComments)}
                  className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showComments ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {showComments
                    ? (language === "spanish" ? "Ocultar comentarios" : "Hide comments")
                    : (language === "spanish" ? "Agregar comentarios" : "Add comments")}
                </button>

                {/* Comments textarea */}
                {showComments && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3"
                  >
                    <Textarea
                      placeholder={language === "spanish" ? "Comentarios adicionales..." : "Additional comments..."}
                      value={responses[currentQuestion.id]?.textResponse || ""}
                      onChange={(e) => handleResponseChange(currentQuestion.id, "textResponse", e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed bottom navigation */}
      {evaluationData && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 md:relative md:bg-transparent md:border-0 md:px-0 md:py-0">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{language === "spanish" ? "Anterior" : "Previous"}</span>
            </button>

            {/* Step dots — desktop only */}
            <div className="hidden md:flex flex-1 justify-center gap-1">
              {evaluationData.questions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToStep(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentStep
                      ? "bg-foreground scale-125"
                      : responses[evaluationData.questions[index].id]?.rating
                      ? "bg-emerald-500"
                      : "bg-border hover:bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            <div className="flex-1 md:flex-none">
              {currentStep === evaluationData.questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {language === "spanish" ? "Enviando..." : "Submitting..."}</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> {language === "spanish" ? "Enviar" : "Submit"}</>
                  )}
                </button>
              ) : (
                <button
                  onClick={nextStep}
                  className="w-full px-6 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
                >
                  {language === "spanish" ? "Siguiente" : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
