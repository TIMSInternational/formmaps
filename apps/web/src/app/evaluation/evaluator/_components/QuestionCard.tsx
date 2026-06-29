"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ResponseScale {
  minValue: number;
  maxValue: number;
  labels: Array<{
    value: number;
    label: string;
    labelSpanish?: string;
  }>;
}

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

interface QuestionResponse {
  rating?: number;
  textResponse?: string;
}

interface QuestionCardProps {
  question: EvaluationQuestion;
  stepIndex: number;
  direction: number;
  responseScale: ResponseScale;
  response: QuestionResponse | undefined;
  onResponseChange: (questionId: string, field: "rating" | "textResponse", value: number | string) => void;
}

export function QuestionCard({
  question, stepIndex, direction, responseScale, response, onResponseChange,
}: QuestionCardProps) {
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith("es") ?? false;
  const [showComments, setShowComments] = useState(false);

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepIndex}
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
              {stepIndex + 1}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("evaluation.evaluator.question")}
            </span>
          </div>

          {/* Question text — content language follows the UI language (i18next) */}
          <h2 className="text-base font-semibold text-foreground leading-relaxed mb-5">
            {isSpanish && question.questionTextSpanish
              ? question.questionTextSpanish
              : question.questionText}
          </h2>

          {/* Rating label */}
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {t("evaluation.evaluator.howMuchAgree")}
          </p>

          {/* Rating options */}
          <RadioGroup
            value={response?.rating?.toString() || ""}
            onValueChange={(value) => onResponseChange(question.id, "rating", parseInt(value))}
            className="space-y-2"
          >
            {responseScale.labels.map((option) => (
              <label
                key={option.value}
                htmlFor={`${question.id}-${option.value}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-secondary/50 transition-all cursor-pointer"
              >
                <RadioGroupItem
                  value={option.value.toString()}
                  id={`${question.id}-${option.value}`}
                />
                <span className="text-sm text-foreground">
                  {isSpanish && option.labelSpanish
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
              ? t("evaluation.evaluator.hideComments")
              : t("evaluation.evaluator.addComments")}
          </button>

          {/* Comments textarea */}
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3"
            >
              <Textarea
                placeholder={t("evaluation.evaluator.commentsPlaceholder")}
                value={response?.textResponse || ""}
                onChange={(e) => onResponseChange(question.id, "textResponse", e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
