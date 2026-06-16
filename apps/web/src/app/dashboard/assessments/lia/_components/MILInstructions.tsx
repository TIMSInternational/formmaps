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
    "instructions" | "practice" | "test"
  >("instructions");
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
          onComplete={() => setCurrentStep("test")}
          onBack={() => setCurrentStep("instructions")}
        />
        <div className="text-center py-2">
          <button
            onClick={() => setCurrentStep("test")}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Skip practice and start test
          </button>
        </div>
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
