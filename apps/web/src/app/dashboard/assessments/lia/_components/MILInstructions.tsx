"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  MILExamMetadata,
  getMILExamInstructions,
  MIL_EXAMS,
} from "@/services/milService";
import MILPracticeExamples from "./MILPracticeExamples";

interface MILInstructionsProps {
  exam: MILExamMetadata;
  onStart: () => void;
  onBack: () => void;
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
  const [instructions, setInstructions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadInstructions();
  }, [exam.id]);

  // Trigger onStart when step transitions to "test" (must be before any early returns)
  useEffect(() => {
    if (currentStep === "test") {
      onStart();
    }
  }, [currentStep, onStart]);

  const loadInstructions = async () => {
    try {
      setLoading(true);
      const data = await getMILExamInstructions(exam.id as any, language);
      setInstructions(data);
    } catch (error) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const getExamIcon = () => {
    const iconProps = {
      className: "w-8 h-8",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
    };

    switch (exam.id) {
      case MIL_EXAMS.FEATURE_DETECTION:
        return (
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <svg {...iconProps} className="text-blue-600">
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
  };

  const getInstructionContent = () => {
    // Show API instructions if available
    if (instructions) {
      return (
        <div className="space-y-6">
          <div className="bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              🎯 {t("dashboard.testInstructions")}
            </h3>
            <div className="text-blue-800">
              {typeof instructions === "string" ? (
                <p>{instructions}</p>
              ) : (
                <div>
                  {instructions.title && (
                    <h4 className="font-semibold mb-2">{instructions.title}</h4>
                  )}
                  {instructions.description && (
                    <p className="mb-3">{instructions.description}</p>
                  )}
                  {instructions.instructions && (
                    <div className="space-y-2">
                      {Array.isArray(instructions.instructions) ? (
                        <ul className="list-disc pl-5 space-y-1">
                          {instructions.instructions.map(
                            (instruction: string, index: number) => (
                              <li key={index}>{instruction}</li>
                            )
                          )}
                        </ul>
                      ) : (
                        <p>{instructions.instructions}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* API Examples Section */}
          {instructions.examples && (
            <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
                📝 {t("dashboard.examples")}
              </h3>
              <div className="space-y-4">
                {Array.isArray(instructions.examples) ? (
                  instructions.examples.map((example: any, index: number) => (
                    <div
                      key={index}
                      className="bg-card border border-yellow-500/30 rounded-lg p-4"
                    >
                      {typeof example === "string" ? (
                        <p className="text-foreground">{example}</p>
                      ) : (
                        <div className="space-y-2">
                          {example.question && (
                            <p className="font-medium text-foreground">
                              {example.question}
                            </p>
                          )}
                          {(example.data || example.letterPairs) && (
                            <div className="space-y-3">
                              {Array.isArray(example.data) &&
                                example.data.length > 0 && (
                                  <div className="grid grid-cols-4 gap-2">
                                    {example.data.map(
                                      (pair: string[], idx: number) => (
                                        <div
                                          key={idx}
                                          className="border rounded p-2 text-center bg-card"
                                        >
                                          <div className="font-bold border-b pb-1">
                                            {pair[0]}
                                          </div>
                                          <div className="pt-1">{pair[1]}</div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              {Array.isArray(example.letterPairs) &&
                                example.letterPairs.length > 0 && (
                                  <div className="grid grid-cols-4 gap-2">
                                    {example.letterPairs.map(
                                      (
                                        pair: { top: string; bottom: string },
                                        idx: number
                                      ) => (
                                        <div
                                          key={idx}
                                          className="border rounded p-2 text-center bg-card"
                                        >
                                          <div className="font-bold border-b pb-1">
                                            {pair.top}
                                          </div>
                                          <div className="pt-1">
                                            {pair.bottom}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                            </div>
                          )}
                          {(example.answer !== undefined ||
                            example.correctAnswer !== undefined) && (
                            <div className="mt-3 p-2 bg-green-500/10 dark:bg-green-500/200/10 dark:bg-green-500/10 dark:bg-green-500/200/20 border border-green-500/30 rounded">
                              <p className="text-green-700 font-medium">
                                {t("dashboard.correctAnswer")}{" "}
                                {example.answer ?? example.correctAnswer}
                              </p>
                              {example.explanation && (
                                <p className="text-green-700 text-sm mt-1">
                                  {example.explanation}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="bg-card border border-yellow-500/30 rounded-lg p-4">
                    <p className="text-foreground">{instructions.examples}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Example */}
          {instructions.example && (
            <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
                📝 {t("dashboard.example")}
              </h3>
              <div className="space-y-4">
                <div className="bg-card border border-yellow-500/30 rounded-lg p-4">
                  {/* Render letter pairs example */}
                  {instructions.example.letterPairs && (
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {instructions.example.letterPairs.map(
                        (
                          pair: { top: string; bottom: string },
                          idx: number
                        ) => (
                          <div
                            key={idx}
                            className="border rounded p-2 text-center bg-card"
                          >
                            <div className="font-bold border-b pb-1">
                              {pair.top}
                            </div>
                            <div className="pt-1">{pair.bottom}</div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Render numeric example */}
                  {instructions.example.numbers && (
                    <div className="max-w-lg mx-auto mb-6">
                      <div className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
                        <div className="flex justify-center items-center space-x-4 sm:space-x-6">
                          {instructions.example.numbers.map(
                            (num: number, index: number) => {
                              // Determine if this is the lowest, highest, or middle number
                              const sorted = [
                                ...instructions.example.numbers,
                              ].sort((a, b) => a - b);
                              const lowest = sorted[0];
                              const highest = sorted[sorted.length - 1];
                              const middle = sorted[1];
                              const isMiddle = num === middle;
                              const isExtreme =
                                num === lowest || num === highest;

                              let bgColor =
                                "bg-muted border-2 border-border";

                              if (isMiddle) {
                                bgColor =
                                  "bg-orange-500/10 dark:bg-orange-500/20 border-2 border-orange-300 shadow-lg";
                              } else if (isExtreme) {
                                bgColor =
                                  "bg-red-500/10 dark:bg-red-500/20 border-2 border-red-300 shadow-md";
                              }

                              return (
                                <div
                                  key={index}
                                  className={`text-center ${
                                    isMiddle ? "transform scale-110" : ""
                                  }`}
                                >
                                  <div
                                    className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl flex items-center justify-center ${bgColor}`}
                                  >
                                    <span className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono">
                                      {num}
                                    </span>
                                  </div>
                                  {isMiddle && (
                                    <div className="text-xs sm:text-sm text-orange-600 font-medium mt-2">
                                      {t("dashboard.middle")}
                                    </div>
                                  )}
                                  {num === lowest && (
                                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                                      {t("dashboard.lowest")}
                                    </div>
                                  )}
                                  {num === highest && (
                                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                                      {t("dashboard.highest")}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Render Verbal Reasoning example */}
                  {instructions.example.statements && (
                    <div className="space-y-4 mb-6">
                      {/* Statements */}
                      <div className="bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2">
                          {t("dashboard.statements")}:
                        </h4>
                        <ul className="space-y-1">
                          {instructions.example.statements.map(
                            (statement: string, index: number) => (
                              <li key={index} className="text-blue-800">
                                • {statement}
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      {/* Question */}
                      {instructions.example.question && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <h4 className="font-semibold text-purple-900 mb-2">
                            {t("dashboard.question")}:
                          </h4>
                          <p className="text-purple-600 dark:text-purple-400">
                            {instructions.example.question}
                          </p>
                        </div>
                      )}

                      {/* Options */}
                      {instructions.example.options && (
                        <div className="bg-secondary border border-border rounded-lg p-4">
                          <h4 className="font-semibold text-foreground mb-3">
                            {t("dashboard.options")}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {instructions.example.options.map(
                              (option: string, index: number) => (
                                <div
                                  key={index}
                                  className="flex items-center p-2 bg-card border border-border rounded text-sm"
                                >
                                  <span className="font-bold text-blue-600 mr-2">
                                    {String.fromCharCode(65 + index)}.
                                  </span>
                                  <span className="text-foreground">
                                    {option}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Render Working Memory example */}
                  {instructions.example.letters && (
                    <div className="max-w-lg mx-auto mb-6">
                      <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
                        {/* Letter Sequence Display */}
                        <div className="flex justify-center items-center space-x-4 sm:space-x-6">
                          {instructions.example.letters.map(
                            (letter: string, index: number) => {
                              const isMiddle = index === 1; // Middle letter is always at index 1

                              return (
                                <div
                                  key={index}
                                  className={`text-center ${
                                    isMiddle ? "transform scale-110" : ""
                                  }`}
                                >
                                  <div
                                    className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center ${
                                      isMiddle
                                        ? "bg-purple-500/10 dark:bg-purple-500/20 border-2 border-purple-300 shadow-lg"
                                        : "bg-muted border-2 border-border"
                                    }`}
                                  >
                                    <span className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-mono">
                                      {letter}
                                    </span>
                                  </div>
                                  {isMiddle && (
                                    <div className="text-xs sm:text-sm text-purple-600 font-medium mt-2">
                                      {t("dashboard.middle")}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Render Visual Rotation example */}
                  {(instructions.example.grid ||
                    instructions.title === "Visual Rotation") && (
                    <div className="space-y-4 mb-6">
                      {/* Question */}
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <h4 className="font-semibold text-purple-900 mb-2">
                          {t("dashboard.question")}:
                        </h4>
                        <p className="text-purple-600 dark:text-purple-400">
                          {t("dashboard.visualRotationQuestion")}
                        </p>
                      </div>

                      {/* Visual Rotation Grid */}
                      <div className="max-w-lg mx-auto">
                        <div className="relative bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
                          {(() => {
                            // Hardcoded example data matching your image
                            const examplePairs = [
                              {
                                top: {
                                  letter: "R",
                                  rotationDegree: 0,
                                  isMirrored: false,
                                },
                                bottom: {
                                  letter: "R",
                                  rotationDegree: 180,
                                  isMirrored: false,
                                },
                              },
                              {
                                top: {
                                  letter: "R",
                                  rotationDegree: 0,
                                  isMirrored: false,
                                },
                                bottom: {
                                  letter: "R",
                                  rotationDegree: 0,
                                  isMirrored: true,
                                },
                              },
                              {
                                top: {
                                  letter: "R",
                                  rotationDegree: 0,
                                  isMirrored: false,
                                },
                                bottom: {
                                  letter: "R",
                                  rotationDegree: 0,
                                  isMirrored: false,
                                },
                              },
                            ];

                            const getTransform = (item: any) => {
                              let transform = "";
                              if (item.rotationDegree !== 0) {
                                transform += `rotate(${item.rotationDegree}deg)`;
                              }
                              if (item.isMirrored) {
                                transform += " scaleX(-1)";
                              }
                              return transform || "none";
                            };

                            return (
                              <>
                                {/* Top Row */}
                                <div
                                  className="grid gap-2 sm:gap-4 md:gap-6 mb-4 sm:mb-6"
                                  style={{
                                    gridTemplateColumns: `repeat(${examplePairs.length}, 1fr)`,
                                  }}
                                >
                                  {examplePairs.map((pair, index) => (
                                    <div
                                      key={`top-${index}`}
                                      className="text-center"
                                    >
                                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                                        <span
                                          className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                                          style={{
                                            transform: getTransform(pair.top),
                                          }}
                                        >
                                          {pair.top.letter}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Divider */}
                                <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-4 sm:mb-6"></div>

                                {/* Bottom Row */}
                                <div
                                  className="grid gap-2 sm:gap-4 md:gap-6"
                                  style={{
                                    gridTemplateColumns: `repeat(${examplePairs.length}, 1fr)`,
                                  }}
                                >
                                  {examplePairs.map((pair, index) => (
                                    <div
                                      key={`bottom-${index}`}
                                      className="text-center"
                                    >
                                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                                        <span
                                          className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                                          style={{
                                            transform: getTransform(
                                              pair.bottom
                                            ),
                                          }}
                                        >
                                          {pair.bottom.letter}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Answer Options */}
                      <div className="bg-secondary border border-border rounded-lg p-4">
                        <h4 className="font-semibold text-foreground mb-3">
                          {t("dashboard.howManyPairsMatch")}
                        </h4>
                        <div className="flex justify-center space-x-4">
                          {[0, 1, 2].map((num) => (
                            <div
                              key={num}
                              className={`w-12 h-12 rounded-lg flex items-center justify-center border-2 ${
                                num === 1
                                  ? "bg-green-500/10 dark:bg-green-500/20 border-green-400"
                                  : "bg-card border-border"
                              }`}
                            >
                              <span className="text-lg font-bold text-foreground font-mono">
                                {num}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 p-2 bg-green-500/10 dark:bg-green-500/200/10 dark:bg-green-500/10 dark:bg-green-500/200/20 border border-green-500/30 rounded">
                    <p className="text-green-700 font-medium">
                      {t("dashboard.correctAnswer")}{" "}
                      {instructions.example.correctAnswer}
                    </p>
                    <p className="text-green-700 text-sm mt-1">
                      {instructions.example.explanation}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Fallback content if no API instructions
    return (
      <div className="space-y-4">
        <p className="text-foreground">{exam.description}</p>
        <div className="bg-secondary rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-foreground">
                {t("dashboard.timeLimit")}
              </span>
              <span className="text-muted-foreground ml-2">
                {exam.timeLimitMinutes} {t("dashboard.minutes")}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">
                {t("dashboard.questions")}:
              </span>
              <span className="text-muted-foreground ml-2">
                {exam.totalQuestions} {t("dashboard.items")}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Handle Practice Step
  if (currentStep === "practice") {
    return (
      <div>
        <MILPracticeExamples
          examId={exam.id as any}
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

  // Instructions Step (default)
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
              <div className="text-lg font-semibold text-blue-600">
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
                ⏱️ {t("dashboard.speedChallenge")}
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
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-muted-foreground">
                    {t("dashboard.loadingInstructions")}
                  </p>
                </div>
              ) : (
                getInstructionContent()
              )}
            </div>

            <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-8">
              <h4 className="font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                {t("dashboard.important")}
              </h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• {t("dashboard.cannotGoBack")}</li>
                <li>• {t("dashboard.autoSaved")}</li>
                <li>• {t("dashboard.completePractice")}</li>
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
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
