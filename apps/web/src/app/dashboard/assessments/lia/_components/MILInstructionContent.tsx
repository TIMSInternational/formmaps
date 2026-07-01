"use client";

import { useTranslation } from "react-i18next";

interface MILExampleItem {
  question?: string;
  data?: string[][];
  letterPairs?: { top: string; bottom: string }[];
  answer?: string | number;
  correctAnswer?: string | number;
  explanation?: string;
}

interface MILInstructionExample {
  letterPairs?: { top: string; bottom: string }[];
  numbers?: number[];
  statements?: string[];
  question?: string;
  options?: string[];
  letters?: string[];
  grid?: unknown;
  correctAnswer?: string | number;
  explanation?: string;
}

export interface MILInstructionData {
  title?: string;
  description?: string;
  instructions?: string[] | string;
  examples?: MILExampleItem[] | string;
  example?: MILInstructionExample;
}

interface MILInstructionContentProps {
  instructions: MILInstructionData | string | null;
  examDescription: string;
  timeLimitMinutes: number;
  totalQuestions: number;
}

/* ---- Visual Rotation Example (hardcoded demo) ---- */
function VisualRotationExample() {
  const { t } = useTranslation();

  // Mirrors the real exam: both figures appear at varied rotations, R only.
  // A pair MATCHES when both are the same R rotated (mirror = the only mismatch).
  // Pair 1: same R rotated 90°/270° → MATCH. Pair 2: bottom is mirrored → MISMATCH.
  // Pair 3: identical → MATCH. Correct answer = 2 matching pairs.
  const examplePairs = [
    {
      top: { letter: "R", rotationDegree: 90, isMirrored: false },
      bottom: { letter: "R", rotationDegree: 270, isMirrored: false },
    },
    {
      top: { letter: "R", rotationDegree: 180, isMirrored: false },
      bottom: { letter: "R", rotationDegree: 180, isMirrored: true },
    },
    {
      top: { letter: "R", rotationDegree: 0, isMirrored: false },
      bottom: { letter: "R", rotationDegree: 0, isMirrored: false },
    },
  ];

  const getTransform = (item: {
    rotationDegree: number;
    isMirrored: boolean;
  }) => {
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
    <div className="space-y-4 mb-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h4 className="font-semibold text-purple-900 mb-2">
          {t("dashboard.question")}:
        </h4>
        <p className="text-purple-600 dark:text-purple-400">
          {t("dashboard.visualRotationQuestion")}
        </p>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="relative bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
          {/* Top Row */}
          <div
            className="grid gap-2 sm:gap-4 md:gap-6 mb-4 sm:mb-6"
            style={{
              gridTemplateColumns: `repeat(${examplePairs.length}, 1fr)`,
            }}
          >
            {examplePairs.map((pair, index) => (
              <div key={`top-${index}`} className="text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                    style={{ transform: getTransform(pair.top) }}
                  >
                    {pair.top.letter}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-4 sm:mb-6" />

          {/* Bottom Row */}
          <div
            className="grid gap-2 sm:gap-4 md:gap-6"
            style={{
              gridTemplateColumns: `repeat(${examplePairs.length}, 1fr)`,
            }}
          >
            {examplePairs.map((pair, index) => (
              <div key={`bottom-${index}`} className="text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                    style={{ transform: getTransform(pair.bottom) }}
                  >
                    {pair.bottom.letter}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Answer Options */}
      <div className="bg-secondary border border-border rounded-lg p-4">
        <h4 className="font-semibold text-foreground mb-3">
          {t("dashboard.howManyPairsMatch")}
        </h4>
        <div className="flex justify-center space-x-4">
          {[0, 1, 2, 3].map((num) => (
            <div
              key={num}
              className={`w-12 h-12 rounded-lg flex items-center justify-center border-2 ${
                num === 2
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
  );
}

/* ---- Examples Section ---- */
function ExamplesSection({ examples }: { examples: MILExampleItem[] | string }) {
  const { t } = useTranslation();

  return (
    <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
        {t("dashboard.examples")}
      </h3>
      <div className="space-y-4">
        {Array.isArray(examples) ? (
          examples.map((example: MILExampleItem | string, index: number) => (
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
                            {example.data.map((pair: string[], idx: number) => (
                              <div
                                key={idx}
                                className="border rounded p-2 text-center bg-card"
                              >
                                <div className="font-bold border-b pb-1">
                                  {pair[0]}
                                </div>
                                <div className="pt-1">{pair[1]}</div>
                              </div>
                            ))}
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
                                  <div className="pt-1">{pair.bottom}</div>
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  )}
                  {(example.answer !== undefined ||
                    example.correctAnswer !== undefined) && (
                    <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded">
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
            <p className="text-foreground">{examples}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Single Example Section ---- */
function SingleExampleSection({
  example,
  parentTitle,
}: {
  example: MILInstructionExample;
  parentTitle?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
        {t("dashboard.example")}
      </h3>
      <div className="space-y-4">
        <div className="bg-card border border-yellow-500/30 rounded-lg p-4">
          {/* Letter pairs */}
          {example.letterPairs && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {example.letterPairs.map(
                (pair: { top: string; bottom: string }, idx: number) => (
                  <div
                    key={idx}
                    className="border rounded p-2 text-center bg-card"
                  >
                    <div className="font-bold border-b pb-1">{pair.top}</div>
                    <div className="pt-1">{pair.bottom}</div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Numeric example */}
          {example.numbers && (
            <NumericExample numbers={example.numbers} />
          )}

          {/* Verbal Reasoning */}
          {example.statements && (
            <VerbalReasoningExample example={example} />
          )}

          {/* Working Memory */}
          {example.letters && (
            <WorkingMemoryExample letters={example.letters} />
          )}

          {/* Visual Rotation */}
          {(example.grid || parentTitle === "Visual Rotation") && (
            <VisualRotationExample />
          )}

          <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded">
            <p className="text-green-700 font-medium">
              {t("dashboard.correctAnswer")} {example.correctAnswer}
            </p>
            <p className="text-green-700 text-sm mt-1">
              {example.explanation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Numeric Example ---- */
function NumericExample({ numbers }: { numbers: number[] }) {
  const { t } = useTranslation();
  const sorted = [...numbers].sort((a, b) => a - b);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const middle = sorted[1];

  return (
    <div className="max-w-lg mx-auto mb-6">
      <div className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex justify-center items-center space-x-4 sm:space-x-6">
          {numbers.map((num: number, index: number) => {
            const isMiddle = num === middle;
            const isExtreme = num === lowest || num === highest;

            let bgColor = "bg-muted border-2 border-border";
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
                className={`text-center ${isMiddle ? "transform scale-110" : ""}`}
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
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Verbal Reasoning Example ---- */
function VerbalReasoningExample({
  example,
}: {
  example: MILInstructionExample;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-[#102B47]/10 dark:bg-[#102B47]/20 border border-[#2E9098]/30 rounded-lg p-4">
        <h4 className="font-semibold text-[#2E9098] mb-2">
          {t("dashboard.statements")}:
        </h4>
        <ul className="space-y-1">
          {example.statements!.map((statement: string, index: number) => (
            <li key={index} className="text-[#0b1f33]">
              {statement}
            </li>
          ))}
        </ul>
      </div>

      {example.question && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900 mb-2">
            {t("dashboard.question")}:
          </h4>
          <p className="text-purple-600 dark:text-purple-400">
            {example.question}
          </p>
        </div>
      )}

      {example.options && (
        <div className="bg-secondary border border-border rounded-lg p-4">
          <h4 className="font-semibold text-foreground mb-3">
            {t("dashboard.options")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {example.options.map((option: string, index: number) => (
              <div
                key={index}
                className="flex items-center p-2 bg-card border border-border rounded text-sm"
              >
                <span className="font-bold text-[#2E9098] mr-2">
                  {String.fromCharCode(65 + index)}.
                </span>
                <span className="text-foreground">{option}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Working Memory Example ---- */
function WorkingMemoryExample({ letters }: { letters: string[] }) {
  const { t } = useTranslation();

  return (
    <div className="max-w-lg mx-auto mb-6">
      <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-200/60 rounded-xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex justify-center items-center space-x-4 sm:space-x-6">
          {letters.map((letter: string, index: number) => {
            const isMiddle = index === 1;
            return (
              <div
                key={index}
                className={`text-center ${isMiddle ? "transform scale-110" : ""}`}
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
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Main exported component ---- */
export default function MILInstructionContent({
  instructions,
  examDescription,
  timeLimitMinutes,
  totalQuestions,
}: MILInstructionContentProps) {
  const { t } = useTranslation();

  if (!instructions) {
    return (
      <div className="space-y-4">
        <p className="text-foreground">{examDescription}</p>
        <div className="bg-secondary rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-foreground">
                {t("dashboard.timeLimit")}
              </span>
              <span className="text-muted-foreground ml-2">
                {timeLimitMinutes} {t("dashboard.minutes")}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">
                {t("dashboard.questions")}:
              </span>
              <span className="text-muted-foreground ml-2">
                {totalQuestions} {t("dashboard.items")}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (typeof instructions === "string") {
    return (
      <div className="space-y-6">
        <div className="bg-[#102B47]/10 dark:bg-[#102B47]/20 border border-[#2E9098]/30 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-[#2E9098] mb-2">
            {t("dashboard.testInstructions")}
          </h3>
          <div className="text-[#0b1f33]">
            <p>{instructions}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#102B47]/10 dark:bg-[#102B47]/20 border border-[#2E9098]/30 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-[#2E9098] mb-2">
          {t("dashboard.testInstructions")}
        </h3>
        <div className="text-[#0b1f33]">
          <div>
            {instructions.title && (
              <h4 className="font-semibold mb-2">{instructions.title}</h4>
            )}
            {instructions.description && (
              <p className="mb-3">{instructions.description}</p>
            )}
            {/* Some exams send instructions identical to description — don't render the same paragraph twice */}
            {instructions.instructions && instructions.instructions !== instructions.description && (
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
        </div>
      </div>

      {instructions.examples && (
        <ExamplesSection examples={instructions.examples} />
      )}

      {instructions.example && (
        <SingleExampleSection
          example={instructions.example}
          parentTitle={instructions.title}
        />
      )}
    </div>
  );
}
