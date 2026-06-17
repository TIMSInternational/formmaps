"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  MILExamMetadata,
  getMILExamInstructions,
  MIL_EXAMS,
  type MILExamId,
} from "@/services/milService";
import MILPracticeExamples from "./MILPracticeExamples";
import MILInstructionContent, {
  type MILInstructionData,
} from "./MILInstructionContent";

interface MILInstructionsProps {
  exam: MILExamMetadata;
  onStart: () => void;
  onBack: () => void;
}

function ExamIcon({ examId }: { examId: string }) {
  const iconProps = {
    className: "w-8 h-8",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
  };

  switch (examId) {
    case MIL_EXAMS.FEATURE_DETECTION:
      return (
        <div className="w-16 h-16 bg-[#065292]/10 rounded-full flex items-center justify-center">
          <svg {...iconProps} className="text-[#065292]">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
        </div>
      );
    case MIL_EXAMS.VERBAL_REASONING:
      return (
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg {...iconProps} className="text-green-600">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
          <svg {...iconProps} className="text-muted-foreground">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
      );
  }
}

export default function MILInstructions({
  exam,
  onStart,
  onBack,
}: MILInstructionsProps) {
  const { t } = useTranslation();
  const { language } = useGlobalStore();
  const [currentStep, setCurrentStep] = useState<
    "instructions" | "practice" | "confirm" | "test"
  >("instructions");
  const [understood, setUnderstood] = useState(false);
  const [instructions, setInstructions] = useState<
    MILInstructionData | string | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInstructions();
  }, [exam.id]);

  useEffect(() => {
    if (currentStep === "test") {
      onStart();
    }
  }, [currentStep, onStart]);

  const loadInstructions = async () => {
    try {
      setLoading(true);
      const data = await getMILExamInstructions(exam.id as MILExamId, language);
      setInstructions(data);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  if (currentStep === "practice") {
    return (
      <div>
        <MILPracticeExamples
          examId={exam.id as MILExamId}
          onComplete={() => setCurrentStep("confirm")}
          onBack={() => setCurrentStep("instructions")}
        />
        <div className="text-center py-2">
          <button
            onClick={() => setCurrentStep("confirm")}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Skip practice and start test
          </button>
        </div>
      </div>
    );
  }

  if (currentStep === "confirm") {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg bg-card rounded-2xl shadow-xl border p-6 sm:p-8"
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-red-500/10 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {t("dashboard.examConfirmTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.examConfirmCannotGoBack")}
            </p>
          </div>

          <div className="bg-[#065292]/5 border-2 border-[#065292]/20 rounded-xl p-4 mb-6 text-center">
            <p className="text-base font-semibold text-[#065292]">
              {t("dashboard.examConfirmConcentrate", {
                minutes: exam.timeLimitMinutes,
                questions: exam.totalQuestions,
              })}
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-6 select-none">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[#065292] cursor-pointer shrink-0"
            />
            <span className="text-sm text-foreground">
              {t("dashboard.examConfirmUnderstood")}
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setCurrentStep("practice")}
              className="px-5 py-3 border border-border text-foreground rounded-xl font-medium hover:bg-secondary transition-colors text-sm sm:text-base"
            >
              ← {t("dashboard.examConfirmReview")}
            </button>
            <button
              onClick={() => setCurrentStep("test")}
              disabled={!understood}
              className="flex-1 px-6 py-3 bg-[#065292] text-white rounded-xl font-semibold hover:bg-[#054a83] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {t("dashboard.examConfirmBegin")}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (currentStep === "test") {
    return null;
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      <div className="bg-card border-b border-border px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {exam.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.instructionsAndExamples")}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-[#065292]">
                {exam.timeLimitMinutes} {t("dashboard.minutes")}
              </div>
              <div className="text-sm text-muted-foreground">
                {exam.totalQuestions} {t("dashboard.questions")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-card rounded-lg shadow-sm border p-6"
          >
            <div className="bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                {t("dashboard.speedChallenge")}
              </h3>
              <p className="text-red-600 dark:text-red-400 font-medium">
                {t("dashboard.youHave")}{" "}
                <strong>
                  {exam.timeLimitMinutes} {t("dashboard.minutes")}
                </strong>{" "}
                {t("dashboard.for")}{" "}
                <strong>
                  {exam.totalQuestions} {t("dashboard.questions")}
                </strong>
              </p>
              <p className="text-red-700 text-sm mt-2">
                {t("dashboard.thatsOnly")}{" "}
                <strong>
                  {Math.round(
                    (exam.timeLimitMinutes * 60) / exam.totalQuestions
                  )}{" "}
                  {t("dashboard.secondsPerQuestion")}
                </strong>
                ! {t("dashboard.workQuickly")}
              </p>
            </div>

            <div className="mb-8">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-[#065292] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    {t("dashboard.loadingInstructions")}
                  </p>
                </div>
              ) : (
                <MILInstructionContent
                  instructions={instructions}
                  examDescription={exam.description}
                  timeLimitMinutes={exam.timeLimitMinutes}
                  totalQuestions={exam.totalQuestions}
                />
              )}
            </div>

            <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-8">
              <h4 className="font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                {t("dashboard.important")}
              </h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>{t("dashboard.cannotGoBack")}</li>
                <li>{t("dashboard.autoSaved")}</li>
                <li>{t("dashboard.completePractice")}</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8">
              <button
                onClick={onBack}
                className="px-6 py-3 bg-secondary text-foreground rounded-lg font-medium hover:bg-muted transition-colors"
              >
                {t("dashboard.backToTestList")}
              </button>
              <button
                onClick={() => setCurrentStep("practice")}
                className="px-8 py-3 bg-[#065292] text-white rounded-lg font-medium hover:bg-[#054a83] transition-colors"
              >
                {t("dashboard.continueToPractice")}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
