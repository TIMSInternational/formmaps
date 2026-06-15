"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  MILExamId,
  MILQuestion,
  calculateMatchingPairs,
} from "@/services/milService";
import { createCustomPracticeQuestions } from "./practiceQuestionData";
import {
  renderLetterPairs,
  renderLetterSequence,
  renderNumberSequence,
  renderVisualRotation,
  renderAnswerOptions,
} from "./PracticeQuestionRenderers";

interface MILPracticeExamplesProps {
  examId: MILExamId;
  onComplete: () => void;
  onBack: () => void;
}

export default function MILPracticeExamples({
  examId,
  onComplete,
  onBack,
}: MILPracticeExamplesProps) {
  const { t } = useTranslation();
  const [practiceQuestions, setPracticeQuestions] = useState<MILQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [completedQuestions, setCompletedQuestions] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPracticeQuestions();
  }, [examId]);

  const loadPracticeQuestions = async () => {
    try {
      setLoading(true);
      const customPracticeQuestions = createCustomPracticeQuestions(examId);
      setPracticeQuestions(customPracticeQuestions);
      setCompletedQuestions(
        new Array(customPracticeQuestions.length).fill(false)
      );
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const validatePracticeAnswer = (
    question: MILQuestion,
    answer: number
  ): boolean => {
    if (
      question.data.letterSequence &&
      question.data.letterSequence.outerLetters
    ) {
      const selectedLetter = question.data.letterSequence.outerLetters[answer];
      return selectedLetter === question.correctAnswer;
    }

    if (question.data.numbers && question.data.numbers.length === 3) {
      // correctAnswer is the POSITION index 0/1/2 (A/B/C) of the extreme
      // furthest from the middle, matching the backend encoding.
      return answer === question.correctAnswer;
    }

    if (question.data.visualRotationItems) {
      return answer === question.correctAnswer;
    }

    if (question.data.options && question.data.options.length > 0) {
      return answer === question.correctAnswer;
    }

    if (
      question.correctAnswer !== undefined &&
      typeof question.correctAnswer === "number"
    ) {
      return answer === question.correctAnswer;
    }

    if (question.data.letterPairs) {
      const correctAnswer = calculateMatchingPairs(question.data.letterPairs);
      return answer === correctAnswer;
    }

    return false;
  };

  const handleAnswerSelect = (answer: number) => {
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    const question = practiceQuestions[currentQuestion];
    const correct = validatePracticeAnswer(question, selectedAnswer);

    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      const updated = [...completedQuestions];
      updated[currentQuestion] = true;
      setCompletedQuestions(updated);
    }
  };

  const handleContinue = () => {
    if (isCorrect) {
      if (currentQuestion < practiceQuestions.length - 1) {
        setCurrentQuestion(currentQuestion + 1);
        setSelectedAnswer(null);
        setShowFeedback(false);
      }
    } else {
      setSelectedAnswer(null);
      setShowFeedback(false);
    }
  };

  const allPracticeCompleted = completedQuestions.every(
    (completed) => completed
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {t("dashboard.loadingPracticeExamples")}
          </p>
        </div>
      </div>
    );
  }

  if (practiceQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            {t("dashboard.noPracticeQuestions")}
          </p>
          <button
            onClick={onBack}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {t("dashboard.goBack")}
          </button>
        </div>
      </div>
    );
  }

  const currentQ = practiceQuestions[currentQuestion];

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-lg shadow-sm border p-8"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {t("dashboard.practiceExamples")}
            </h1>
            <p className="text-muted-foreground mb-4">
              {t("dashboard.answerCorrectlyToProceed")}
            </p>

            {/* Progress */}
            <div className="flex justify-center space-x-2 mb-4">
              {practiceQuestions.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    completedQuestions[index]
                      ? "bg-green-500/10 dark:bg-green-500/200"
                      : index === currentQuestion
                      ? "bg-blue-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>

            <div className="text-sm text-muted-foreground">
              {t("dashboard.exampleOf", {
                current: currentQuestion + 1,
                total: practiceQuestions.length,
              })}
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-foreground text-center mb-6">
              {currentQ.questionText}
            </h2>

            {renderLetterPairs(currentQ)}
            {renderLetterSequence(currentQ)}
            {renderNumberSequence(currentQ)}
            {renderVisualRotation(currentQ)}

            {/* Answer Options */}
            <div className="flex justify-center flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6 max-w-4xl mx-auto px-2">
              {renderAnswerOptions(currentQ, selectedAnswer, handleAnswerSelect, showFeedback)}
            </div>
          </div>

          {/* Feedback */}
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg mb-6 ${
                isCorrect
                  ? "bg-green-500/10 dark:bg-green-500/200/10 dark:bg-green-500/10 dark:bg-green-500/200/20 border border-green-500/30"
                  : "bg-red-500/10 dark:bg-red-500/20 border border-red-500/30"
              }`}
            >
              <div className="flex items-center mb-2">
                {isCorrect ? (
                  <svg
                    className="w-5 h-5 text-green-600 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-red-600 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span
                  className={`font-medium ${
                    isCorrect ? "text-green-800" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {isCorrect
                    ? t("dashboard.perfectStartTest")
                    : t("dashboard.reviewInstructions")}
                </span>
              </div>
              <p
                className={`text-sm ${
                  isCorrect ? "text-green-700" : "text-red-700"
                }`}
              >
                {currentQ.explanation}
              </p>
              {!isCorrect && (
                <p
                  className={`text-sm mt-2 ${
                    isCorrect ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {t("dashboard.correctAnswerLabel")}{" "}
                  {(() => {
                    if (currentQ.data.letterPairs) {
                      return `${calculateMatchingPairs(
                        currentQ.data.letterPairs
                      )} ${t("dashboard.matchingPairs")}`;
                    }
                    if (
                      currentQ.data.options &&
                      currentQ.correctAnswer !== undefined &&
                      typeof currentQ.correctAnswer === "number" &&
                      currentQ.data.options[currentQ.correctAnswer]
                    ) {
                      return `"${
                        currentQ.data.options[currentQ.correctAnswer]
                      }"`;
                    }
                    if (
                      currentQ.data.numbers &&
                      currentQ.data.numbers.length === 3 &&
                      typeof currentQ.correctAnswer === "number"
                    ) {
                      const labels = ["A", "B", "C"];
                      const idx = currentQ.correctAnswer;
                      return `${labels[idx]} (${currentQ.data.numbers[idx]})`;
                    }
                    if (currentQ.correctAnswer !== undefined) {
                      return currentQ.correctAnswer.toString();
                    }
                    return t("dashboard.notAvailable");
                  })()}
                </p>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0">
            <button
              onClick={onBack}
              className="px-4 py-2 sm:px-6 sm:py-3 border border-border text-foreground rounded-lg hover:bg-secondary transition-colors text-sm sm:text-base"
            >
              ← {t("dashboard.backToInstructions")}
            </button>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              {!showFeedback ? (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={selectedAnswer === null}
                  className="bg-blue-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {t("dashboard.submitAnswer")}
                </button>
              ) : (
                <>
                  {!isCorrect ? (
                    <button
                      onClick={handleContinue}
                      className="bg-orange-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-orange-700 transition-colors text-sm sm:text-base"
                    >
                      {t("common.tryAgain")}
                    </button>
                  ) : allPracticeCompleted ? (
                    <button
                      onClick={onComplete}
                      className="bg-green-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm sm:text-base"
                    >
                      {t("dashboard.startTest")}
                    </button>
                  ) : (
                    <button
                      onClick={handleContinue}
                      className="bg-blue-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
                    >
                      {t("dashboard.nextExample")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
