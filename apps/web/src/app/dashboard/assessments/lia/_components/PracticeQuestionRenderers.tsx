"use client";

import { MILQuestion } from "@/services/milService";

interface VisualRotationItem {
  letter: string;
  rotationDegree: number;
  isMirrored: boolean;
}

function getTransform(item: VisualRotationItem): string {
  let transform = "";
  if (item.rotationDegree !== 0) {
    transform += `rotate(${item.rotationDegree}deg)`;
  }
  if (item.isMirrored) {
    transform += " scaleX(-1)";
  }
  return transform || "none";
}

export function renderLetterPairs(question: MILQuestion) {
  if (!question.data.letterPairs) return null;

  return (
    <div className="max-w-sm sm:max-w-md md:max-w-xl mx-auto mb-4 sm:mb-6">
      <div className="bg-card border-2 border-[#065292]/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 shadow-sm">
        {/* Top Row */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6 mb-3 sm:mb-4 md:mb-6">
          {question.data.letterPairs.map((pair, index) => (
            <div key={`top-${index}`} className="text-center">
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-mono">
                {pair.topLetter}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-blue-300 mb-3 sm:mb-4 md:mb-6"></div>

        {/* Bottom Row */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6">
          {question.data.letterPairs.map((pair, index) => (
            <div key={`bottom-${index}`} className="text-center">
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-mono">
                {pair.bottomLetter}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function renderLetterSequence(question: MILQuestion) {
  if (!question.data.letterSequence) return null;

  const { letters } = question.data.letterSequence;

  return (
    <div className="max-w-lg mx-auto mb-6 sm:mb-8">
      <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
          {letters.map((letter, index) => (
            <div
              key={index}
              className={`text-center ${
                index === 1 ? "transform scale-110" : ""
              }`}
            >
              <div
                className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center ${
                  index === 1
                    ? "bg-purple-500/10 dark:bg-purple-500/20 border-2 border-purple-300 shadow-lg"
                    : "bg-muted border-2 border-border"
                }`}
              >
                <span className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-mono">
                  {letter}
                </span>
              </div>
              {index === 1 && (
                <div className="text-xs sm:text-sm text-purple-600 font-medium mt-2">
                  Middle
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function renderNumberSequence(question: MILQuestion) {
  if (!question.data.numbers || question.data.numbers.length !== 3)
    return null;

  const numbers = question.data.numbers;
  const positionLabels = ["A", "B", "C"];

  return (
    <div className="max-w-lg mx-auto mb-6 sm:mb-8">
      <div className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
          {numbers.map((number, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl flex items-center justify-center bg-muted border-2 border-border">
                <span className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono">
                  {number}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-orange-600 font-medium mt-2">
                {positionLabels[index]}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs sm:text-sm text-muted-foreground mt-4 sm:mt-6">
          Which value — A, B, or C — is the extreme (highest or lowest) furthest
          from the middle number?
        </p>
      </div>
    </div>
  );
}

export function renderVisualRotation(question: MILQuestion) {
  if (!question.data.visualRotationItems) return null;

  const items = question.data.visualRotationItems;
  const pairs: { top: VisualRotationItem; bottom: VisualRotationItem }[] = [];
  for (let i = 0; i < items.length; i += 2) {
    if (i + 1 < items.length) {
      pairs.push({ top: items[i], bottom: items[i + 1] });
    }
  }

  return (
    <div className="max-w-lg mx-auto mb-6 sm:mb-8">
      <div className="relative bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
        {/* Top Row */}
        <div
          className={`grid gap-2 sm:gap-4 md:gap-6 mb-4 sm:mb-6`}
          style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
        >
          {pairs.map((pair, index) => (
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
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-4 sm:mb-6"></div>

        {/* Bottom Row */}
        <div
          className={`grid gap-2 sm:gap-4 md:gap-6`}
          style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
        >
          {pairs.map((pair, index) => (
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
  );
}

export function renderAnswerOptions(
  question: MILQuestion,
  selectedAnswer: number | null,
  onSelect: (answer: number) => void,
  disabled: boolean
) {
  // Options-based (Verbal Reasoning)
  if (question.data.options && question.data.options.length > 0) {
    return question.data.options.map((option, index) => (
      <button
        key={index}
        onClick={() => onSelect(index)}
        disabled={disabled}
        className={`px-3 py-2 sm:px-4 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-100 min-w-[100px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] text-center ${
          selectedAnswer === index
            ? "bg-[#065292] text-white shadow-lg transform scale-105"
            : "bg-[#065292] text-white hover:bg-[#054a83] hover:shadow-md"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span className="block leading-tight">{option}</span>
      </button>
    ));
  }

  // Letter sequence (Working Memory)
  if (
    question.data.letterSequence &&
    question.data.letterSequence.outerLetters
  ) {
    return question.data.letterSequence.outerLetters.map((letter, index) => (
      <button
        key={index}
        onClick={() => onSelect(index)}
        disabled={disabled}
        className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl sm:rounded-2xl font-bold text-xl sm:text-2xl md:text-3xl transition-all duration-100 ${
          selectedAnswer === index
            ? "bg-[#065292] text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-[#065292]/30"
            : "bg-card border-2 border-border text-foreground hover:border-[#065292]/40 hover:bg-[#065292]/5 shadow-lg hover:shadow-xl"
        } font-mono ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {letter}
      </button>
    ));
  }

  // Numbers (Numeric Velocity) — render one option per presented number
  // (positions A/B/C); onSelect passes the POSITION index 0/1/2.
  if (question.data.numbers && question.data.numbers.length === 3) {
    const numbers = question.data.numbers;
    const positionLabels = ["A", "B", "C"];

    return numbers.map((number, index) => (
      <button
        key={index}
        onClick={() => onSelect(index)}
        disabled={disabled}
        className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg sm:rounded-xl font-bold transition-all duration-100 flex flex-col items-center justify-center ${
          selectedAnswer === index
            ? "bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl transform scale-105 ring-2 sm:ring-4 ring-orange-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-orange-300 hover:bg-orange-50 shadow-lg hover:shadow-xl"
        } font-mono ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span className="text-lg sm:text-xl md:text-2xl leading-none">
          {positionLabels[index]}
        </span>
        <span className="text-[10px] sm:text-xs opacity-80 leading-none mt-1">
          {number}
        </span>
      </button>
    ));
  }

  // Visual rotation items
  if (question.data.visualRotationItems) {
    const items = question.data.visualRotationItems;
    const numPairs = Math.floor(items.length / 2);
    const maxOptions = Math.min(numPairs, 4);
    const options = Array.from({ length: maxOptions + 1 }, (_, i) => i);

    return options.map((option) => (
      <button
        key={option}
        onClick={() => onSelect(option)}
        disabled={disabled}
        className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg font-bold text-base sm:text-lg md:text-xl transition-all ${
          selectedAnswer === option
            ? "bg-[#054a83] text-white shadow-lg transform scale-105"
            : "bg-[#065292] text-white hover:bg-[#054a83] hover:shadow-md"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {option}
      </button>
    ));
  }

  // Default numeric options (Pattern Recognition)
  return [0, 1, 2, 3, 4].map((option) => (
    <button
      key={option}
      onClick={() => onSelect(option)}
      disabled={disabled}
      className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg font-bold text-base sm:text-lg md:text-xl transition-all ${
        selectedAnswer === option
          ? "bg-[#065292] text-white shadow-lg transform scale-105"
          : "bg-[#065292] text-white hover:bg-[#054a83] hover:shadow-md"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {option}
    </button>
  ));
}
