"use client";

import { motion } from "motion/react";
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
    <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
        className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-3 sm:p-6 shadow-xl backdrop-blur-sm"
      >
        {/* Top Row */}
        <div className={`grid gap-2 sm:gap-4 md:gap-8 mb-4 sm:mb-8`} style={{ gridTemplateColumns: `repeat(${question.data.letterPairs.length}, 1fr)` }}>
          {question.data.letterPairs.map((pair, index) => (
            <motion.div
              key={`top-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02, duration: 0.05 }}
              className="text-center"
            >
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono tracking-wider drop-shadow-sm">
                {pair.topLetter}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.1 }}
          className="h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent mb-4 sm:mb-8"
        />

        {/* Bottom Row */}
        <div className={`grid gap-2 sm:gap-4 md:gap-8`} style={{ gridTemplateColumns: `repeat(${question.data.letterPairs.length}, 1fr)` }}>
          {question.data.letterPairs.map((pair, index) => (
            <motion.div
              key={`bottom-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + index * 0.02, duration: 0.1 }}
              className="text-center"
            >
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono tracking-wider drop-shadow-sm">
                {pair.bottomLetter}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function renderLetterSequence(question: MILQuestion) {
  if (!question.data.letterSequence) return null;

  const letters = question.data.letterSequence.letters || question.data.letterSequence.outerLetters;
  if (!letters) return null;

  return (
    <div className="max-w-lg mx-auto mb-6 sm:mb-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
        className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm"
      >
        {/* Letter Sequence Display */}
        <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
          {letters.map((letter, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.2 }}
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
            </motion.div>
          ))}
        </div>

        {/* Helper text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.2 }}
          className="text-center mt-4 sm:mt-6"
        >
          <p className="text-xs sm:text-sm text-muted-foreground">
            Which outer letter is alphabetically furthest from the middle
            letter?
          </p>
        </motion.div>
      </motion.div>
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
        className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm"
      >
        {/* Number Sequence Display */}
        <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
          {numbers.map((number, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.2 }}
              className="text-center"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl flex items-center justify-center bg-muted border-2 border-border">
                <span className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono">
                  {number}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-orange-600 font-medium mt-2">
                {positionLabels[index]}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Helper text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.2 }}
          className="text-center mt-4 sm:mt-6"
        >
          <p className="text-xs sm:text-sm text-muted-foreground">
            Which value — A, B, or C — is the extreme (highest or lowest)
            furthest from the middle number?
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function renderVisualRotation(question: MILQuestion) {
  if (!question.data.visualRotationItems) return null;

  const items = question.data.visualRotationItems;
  const pairs: { top: VisualRotationItem; bottom: VisualRotationItem }[] = [];
  for (let i = 0; i < items.length; i += 2) {
    if (i + 1 < items.length) {
      pairs.push({
        top: items[i],
        bottom: items[i + 1],
      });
    }
  }

  return (
    <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
        className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-3 sm:p-6 shadow-xl backdrop-blur-sm"
      >
        {/* Top Row */}
        <div
          className={`grid gap-2 sm:gap-4 md:gap-8 mb-4 sm:mb-8`}
          style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
        >
          {pairs.map((pair, index) => (
            <motion.div
              key={`top-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02, duration: 0.05 }}
              className="text-center"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                <span
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                  style={{
                    transform: getTransform(pair.top),
                  }}
                >
                  {pair.top.letter}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.1 }}
          className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-4 sm:mb-8"
        />

        {/* Bottom Row */}
        <div
          className={`grid gap-2 sm:gap-4 md:gap-8`}
          style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
        >
          {pairs.map((pair, index) => (
            <motion.div
              key={`bottom-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + index * 0.02, duration: 0.1 }}
              className="text-center"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                <span
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                  style={{
                    transform: getTransform(pair.bottom),
                  }}
                >
                  {pair.bottom.letter}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Helper text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.2 }}
          className="text-center mt-4 sm:mt-6"
        >
          <p className="text-xs sm:text-sm text-muted-foreground">
            How many bottom figures are identical to the ones directly above
            them, after rotating them in any direction?
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function renderAnswerOptions(
  question: MILQuestion,
  selectedAnswer: number | null,
  onSelect: (answer: number) => void,
  disabled: boolean
) {
  // Check if question has API-provided options (for Verbal Reasoning, etc.)
  if (question.data.options && question.data.options.length > 0) {
    return question.data.options.map((option, index) => (
      <button
        key={index}
        onClick={() => onSelect(index)}
        disabled={disabled}
        className={`px-3 py-2 sm:px-4 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-100 min-w-[100px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] text-center ${
          selectedAnswer === index
            ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-2xl transform scale-105 ring-4 ring-blue-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-blue-300 hover:bg-blue-50 shadow-lg hover:shadow-xl"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="block leading-tight">{option}</span>
      </button>
    ));
  }

  // Check if question has letter sequence (for Working Memory)
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
            ? "bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-purple-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-purple-300 hover:bg-purple-50 shadow-lg hover:shadow-xl"
        } disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
      >
        {letter}
      </button>
    ));
  }

  // Check if question has numbers (for Numeric Velocity)
  // Render one option per presented number (positions A/B/C); onSelect passes
  // the POSITION index 0/1/2 to match the backend's positional correctAnswer.
  if (question.data.numbers && question.data.numbers.length === 3) {
    const numbers = question.data.numbers;
    const positionLabels = ["A", "B", "C"];

    return numbers.map((number, index) => (
      <button
        key={index}
        onClick={() => onSelect(index)}
        disabled={disabled}
        className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg sm:rounded-xl font-bold text-base sm:text-lg md:text-xl transition-all duration-100 flex flex-col items-center justify-center ${
          selectedAnswer === index
            ? "bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl transform scale-105 ring-2 sm:ring-4 ring-orange-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-orange-300 hover:bg-orange-50 shadow-lg hover:shadow-xl"
        } disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
      >
        <span className="text-base sm:text-lg md:text-xl leading-none">
          {positionLabels[index]}
        </span>
        <span className="text-[10px] sm:text-xs opacity-80 leading-none mt-1">
          {number}
        </span>
      </button>
    ));
  }

  // Check if question has visual rotation items
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
        className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl md:text-2xl transition-all duration-100 ${
          selectedAnswer === option
            ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-indigo-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-indigo-300 hover:bg-indigo-50 shadow-lg hover:shadow-xl"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {option}
      </button>
    ));
  }

  // Default numeric options (for Pattern Recognition, etc.)
  return [0, 1, 2, 3, 4].map((option) => (
    <button
      key={option}
      onClick={() => onSelect(option)}
      disabled={disabled}
      className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl md:text-2xl transition-all duration-100 ${
        selectedAnswer === option
          ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-blue-200/50"
          : "bg-card border-2 border-border text-foreground hover:border-blue-300 hover:bg-blue-50 shadow-lg hover:shadow-xl"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {option}
    </button>
  ));
}
