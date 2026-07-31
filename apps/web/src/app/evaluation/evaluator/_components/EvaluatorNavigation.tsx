"use client";

import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuestionResponse {
  rating?: number;
  textResponse?: string;
}

interface EvaluatorNavigationProps {
  currentStep: number;
  totalQuestions: number;
  questionIds: string[];
  responses: Record<string, QuestionResponse>;
  isSubmitting: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToStep: (step: number) => void;
  onSubmit: () => void;
}

export function EvaluatorNavigation({
  currentStep, totalQuestions, questionIds, responses,
  isSubmitting, onPrev, onNext, onGoToStep, onSubmit,
}: EvaluatorNavigationProps) {
  const { t } = useTranslation();
  const isLastStep = currentStep === totalQuestions - 1;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 md:relative md:bg-transparent md:border-0 md:px-0 md:py-0">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <button
          onClick={onPrev}
          disabled={currentStep === 0}
          className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("evaluation.evaluator.previous")}</span>
        </button>

        {/* Step dots — desktop only */}
        <div className="hidden md:flex flex-1 justify-center gap-1">
          {questionIds.map((qId, index) => (
            <button
              key={index}
              onClick={() => onGoToStep(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentStep
                  ? "bg-foreground scale-125"
                  : responses[qId]?.rating
                  ? "bg-emerald-500"
                  : "bg-border hover:bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 md:flex-none">
          {isLastStep ? (
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="w-full px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t("evaluation.evaluator.submitting")}</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> {t("evaluation.evaluator.submit")}</>
              )}
            </button>
          ) : (
            <button
              onClick={onNext}
              className="w-full px-6 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
            >
              {t("evaluation.evaluator.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
