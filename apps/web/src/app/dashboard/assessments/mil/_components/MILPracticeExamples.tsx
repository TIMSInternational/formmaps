"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  MILExamId,
  MILQuestion,
  calculateMatchingPairs,
} from "@/services/milService";

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

      // Create custom practice questions instead of using API questions
      const customPracticeQuestions = createCustomPracticeQuestions(examId);
      setPracticeQuestions(customPracticeQuestions);
      setCompletedQuestions(
        new Array(customPracticeQuestions.length).fill(false)
      );
    } catch (error) {
      console.error("Failed to load practice questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const createCustomPracticeQuestions = (examId: MILExamId): MILQuestion[] => {
    console.log(
      "🏗️ [LIA PRACTICE] Creating custom questions for examId:",
      examId
    );

    const baseQuestions = [
      // Pattern Recognition Practice Questions (similar to instruction examples)
      {
        questionNumber: 1,
        questionText: "How many letter pairs match? (Case doesn't matter)",
        type: 1,
        data: {
          letterPairs: [
            { topLetter: "C", bottomLetter: "c" },
            { topLetter: "E", bottomLetter: "F" },
            { topLetter: "L", bottomLetter: "l" },
            { topLetter: "W", bottomLetter: "V" },
          ],
        },
        explanation: "C matches c, L matches l. E≠F and W≠V. So 2 pairs match.",
        correctAnswer: 2,
      },
      {
        questionNumber: 2,
        questionText: "Count the matching letter pairs:",
        type: 1,
        data: {
          letterPairs: [
            { topLetter: "T", bottomLetter: "t" },
            { topLetter: "N", bottomLetter: "n" },
            { topLetter: "H", bottomLetter: "G" },
            { topLetter: "S", bottomLetter: "s" },
          ],
        },
        explanation:
          "T matches t, N matches n, S matches s. Only H≠G. So 3 pairs match.",
        correctAnswer: 3,
      },
      // Verbal Reasoning Practice Questions (similar to instruction examples)
      {
        questionNumber: 3,
        questionText:
          "All flowers are beautiful. Roses are flowers. Therefore, roses are beautiful.",
        type: 2,
        data: {
          options: ["True", "False", "Cannot be determined"],
        },
        explanation:
          "The logic is valid: if all flowers are beautiful and roses are flowers, then roses must be beautiful.",
        correctAnswer: 0,
      },
      {
        questionNumber: 4,
        questionText: "Pen is to Writer as Brush is to ___",
        type: 2,
        data: {
          options: ["Paint", "Artist", "Canvas", "Color", "Studio"],
        },
        explanation:
          "A writer uses a pen as their main tool, just as an artist uses a brush as their main tool.",
        correctAnswer: 1,
      },
    ];

    // Return appropriate questions based on exam type
    console.log("🎯 [LIA PRACTICE] Filtering questions for exam type:", examId);

    if (examId.includes("pattern-recognition")) {
      console.log("📐 [LIA PRACTICE] Using Pattern Recognition questions");
      return [
        {
          questionNumber: 1,
          questionText: "How many letter pairs match? (Case doesn't matter)",
          type: 1,
          data: {
            letterPairs: [
              { topLetter: "D", bottomLetter: "a" }, // From official example 1
              { topLetter: "F", bottomLetter: "g" },
              { topLetter: "H", bottomLetter: "t" },
              { topLetter: "R", bottomLetter: "r" },
            ],
          },
          explanation:
            "Only R matches r (case doesn't matter). D≠a, F≠g, H≠t. So 1 pair matches.",
          correctAnswer: 1,
        },
        {
          questionNumber: 2,
          questionText: "How many letter pairs match? (Case doesn't matter)",
          type: 1,
          data: {
            letterPairs: [
              { topLetter: "q", bottomLetter: "Q" }, // From official example 2
              { topLetter: "a", bottomLetter: "A" },
              { topLetter: "l", bottomLetter: "L" },
              { topLetter: "b", bottomLetter: "B" },
            ],
          },
          explanation:
            "All pairs match: q=Q, a=A, l=L, b=B (case doesn't matter). So 4 pairs match.",
          correctAnswer: 4,
        },
        {
          questionNumber: 3,
          questionText: "How many letter pairs match? (Case doesn't matter)",
          type: 1,
          data: {
            letterPairs: [
              { topLetter: "M", bottomLetter: "w" }, // From official example 3
              { topLetter: "N", bottomLetter: "f" },
              { topLetter: "D", bottomLetter: "t" },
              { topLetter: "E", bottomLetter: "h" },
            ],
          },
          explanation:
            "None of the pairs match: M≠w, N≠f, D≠t, E≠h. So 0 pairs match.",
          correctAnswer: 0,
        },
      ];
    } else if (examId.includes("verbal-reasoning")) {
      console.log("💬 [LIA PRACTICE] Using Verbal Reasoning questions");
      return [
        {
          questionNumber: 1,
          questionText:
            "Anna is taller than Mary. Mary is taller than Olivia. Who is the tallest?",
          type: 2,
          data: {
            options: ["Anna", "Mary", "Olivia"],
          },
          explanation:
            "Since Anna > Mary > Olivia in height, Anna is the tallest.",
          correctAnswer: 0, // Anna
        },
        {
          questionNumber: 2,
          questionText:
            "Liam is faster than James. James is faster than Henry. Who is the slowest?",
          type: 2,
          data: {
            options: ["Liam", "James", "Henry"],
          },
          explanation:
            "Since Liam > James > Henry in speed, Henry is the slowest.",
          correctAnswer: 2, // Henry
        },
        {
          questionNumber: 3,
          questionText:
            "Leo is nicer than David. Owen is meaner than David. Who is the meanest?",
          type: 2,
          data: {
            options: ["Leo", "David", "Owen"],
          },
          explanation:
            "Since Owen is meaner than David, and Leo is nicer than David, Owen is the meanest.",
          correctAnswer: 2, // Owen
        },
      ];
    } else if (examId.includes("working-memory")) {
      console.log("🧠 [LIA PRACTICE] Using Working Memory questions");
      return [
        {
          questionNumber: 1,
          questionText:
            "Which outer letter is alphabetically furthest from the middle letter?",
          type: 2,
          data: {
            letterSequence: {
              letters: ["F", "H", "K"], // From official example
              outerLetters: ["F", "K"],
              middleLetter: "H",
            },
          },
          explanation:
            "These letters are arranged in the correct alphabetical order. F comes first, followed by H, then K — just as in the alphabet. Which letter, F or K, is further from the middle letter H? F is 2 positions before H, K is 3 positions after H. K is further from H alphabetically.",
          correctAnswer: "K",
        },
        {
          questionNumber: 2,
          questionText:
            "Which outer letter is alphabetically furthest from the middle letter?",
          type: 2,
          data: {
            letterSequence: {
              letters: ["P", "S", "U"], // From official example
              outerLetters: ["P", "U"],
              middleLetter: "S",
            },
          },
          explanation:
            "P is 3 positions before S, U is 2 positions after S. P is further from S alphabetically.",
          correctAnswer: "P",
        },
        {
          questionNumber: 3,
          questionText:
            "Which outer letter is alphabetically furthest from the middle letter?",
          type: 2,
          data: {
            letterSequence: {
              letters: ["C", "E", "H"], // From official example
              outerLetters: ["C", "H"],
              middleLetter: "E",
            },
          },
          explanation:
            "C is 2 positions before E, H is 3 positions after E. H is further from E alphabetically.",
          correctAnswer: "H",
        },
      ];
    } else if (examId.includes("numeric-velocity")) {
      console.log("🔢 [LIA PRACTICE] Using Numeric Velocity questions");
      return [
        {
          questionNumber: 1,
          questionText:
            "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
          type: 3,
          data: {
            numbers: [7, 1, 3], // From official example: 7 [A] 1 [B] 3 [C]
          },
          explanation:
            "In this case, the numbers are ordered from lowest to highest. The number 1 is the lowest, and the number 7 is the highest. The middle number is 3. The number 7 is furthest from 3. Therefore, the correct answer is letter A, which corresponds to the number 7.",
          correctAnswer: 7, // Answer A = 7
        },
        {
          questionNumber: 2,
          questionText:
            "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
          type: 3,
          data: {
            numbers: [21, 29, 17], // From official example: 21 [A] 29 [B] 17 [C]
          },
          explanation:
            "In this case, the numbers are not in order from lowest to highest. Identify the lowest number (17) and the highest number (29). The middle number is 21. Now, determine which of the extremes (17 or 29) is furthest from the number 21. The number 29 is furthest from 21. Therefore, the correct answer is letter B, which corresponds to the number 29.",
          correctAnswer: 29, // Answer B = 29
        },
      ];
    } else if (examId.includes("visual-rotation")) {
      console.log("🔄 [LIA PRACTICE] Using Visual Rotation questions");
      return [
        {
          questionNumber: 1,
          questionText:
            "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
          type: 4,
          data: {
            visualRotationItems: [
              // Top row: R, R, R (all normal)
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              // Bottom row: R (180°), R (mirrored), R (normal)
              { letter: "R", rotationDegree: 180, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: true },
              { letter: "R", rotationDegree: 0, isMirrored: false },
            ],
          },
          explanation:
            "After rotation: First pair (R vs R rotated 180°) = MATCH, Second pair (R vs R mirrored) = NO MATCH, Third pair (R vs R normal) = MATCH. Answer: 2 pairs match.",
          correctAnswer: 2,
        },
        {
          questionNumber: 2,
          questionText:
            "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
          type: 4,
          data: {
            visualRotationItems: [
              // Top row: R, R (all normal)
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              // Bottom row: R (90°), R (270°)
              { letter: "R", rotationDegree: 90, isMirrored: false },
              { letter: "R", rotationDegree: 270, isMirrored: false },
            ],
          },
          explanation:
            "After rotation: First pair (R vs R rotated 90°) = MATCH, Second pair (R vs R rotated 270°) = MATCH. Both can be rotated to match the top. Answer: 2 pairs match.",
          correctAnswer: 2,
        },
        {
          questionNumber: 3,
          questionText:
            "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
          type: 4,
          data: {
            visualRotationItems: [
              // Top row: R, R, R, R (all normal)
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: false },
              // Bottom row: R (normal), R (mirrored), R (180°), R (mirrored + 90°)
              { letter: "R", rotationDegree: 0, isMirrored: false },
              { letter: "R", rotationDegree: 0, isMirrored: true },
              { letter: "R", rotationDegree: 180, isMirrored: false },
              { letter: "R", rotationDegree: 90, isMirrored: true },
            ],
          },
          explanation:
            "After rotation: First pair (R vs R normal) = MATCH, Second pair (R vs R mirrored) = NO MATCH, Third pair (R vs R rotated 180°) = MATCH, Fourth pair (R vs R mirrored + 90°) = NO MATCH. Answer: 2 pairs match.",
          correctAnswer: 2,
        },
      ];
    }

    // Default: return first 2 questions for any other exam type
    console.log("🔧 [LIA PRACTICE] Using default questions (first 2)");
    const defaultQuestions = baseQuestions.slice(0, 2);
    console.log("🔧 [LIA PRACTICE] Default questions:", defaultQuestions);
    return defaultQuestions;
  };

  const handleAnswerSelect = (answer: number) => {
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    const question = practiceQuestions[currentQuestion];
    console.log("🧪 [LIA PRACTICE] Validating answer:", {
      questionType: question.type,
      selectedAnswer,
      hasOptions: question.data.options ? true : false,
      hasLetterPairs: question.data.letterPairs ? true : false,
      hasCorrectAnswer: question.correctAnswer !== undefined,
      correctAnswer: question.correctAnswer,
    });

    // Use custom validation for practice questions
    const correct = validatePracticeAnswer(question, selectedAnswer);

    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      const updated = [...completedQuestions];
      updated[currentQuestion] = true;
      setCompletedQuestions(updated);
    }
  };

  const validatePracticeAnswer = (
    question: MILQuestion,
    answer: number
  ): boolean => {
    // Handle letter sequence questions (Working Memory)
    if (
      question.data.letterSequence &&
      question.data.letterSequence.outerLetters
    ) {
      const selectedLetter = question.data.letterSequence.outerLetters[answer];
      console.log("🔤 [LIA PRACTICE] Letter sequence validation:", {
        selectedLetter,
        correctAnswer: question.correctAnswer,
      });
      return selectedLetter === question.correctAnswer;
    }

    // Handle number sequence questions (Numeric Velocity)
    if (question.data.numbers && question.data.numbers.length === 3) {
      const numbers = question.data.numbers;
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const extremes = [sortedNumbers[0], sortedNumbers[2]]; // [lowest, highest]
      const selectedNumber = extremes[answer];
      console.log("🔢 [LIA PRACTICE] Number sequence validation:", {
        selectedNumber,
        correctAnswer: question.correctAnswer,
      });
      return selectedNumber === question.correctAnswer;
    }

    // Handle visual rotation questions
    if (question.data.visualRotationItems) {
      console.log("🔄 [LIA PRACTICE] Visual rotation validation:", {
        answer,
        correctAnswer: question.correctAnswer,
      });
      return answer === question.correctAnswer;
    }

    // Handle options-based questions (Verbal Reasoning, etc.)
    if (question.data.options && question.data.options.length > 0) {
      console.log("🔤 [LIA PRACTICE] Options-based validation:", {
        answerIndex: answer,
        correctAnswer: question.correctAnswer,
      });
      return answer === question.correctAnswer;
    }

    // Handle numeric questions (Pattern Recognition)
    if (
      question.correctAnswer !== undefined &&
      typeof question.correctAnswer === "number"
    ) {
      console.log("🔢 [LIA PRACTICE] Numeric validation:", {
        answer,
        correctAnswer: question.correctAnswer,
      });
      return answer === question.correctAnswer;
    }

    // Fallback to pattern recognition calculation if it's a letter pairs question
    if (question.data.letterPairs) {
      console.log("🔤 [LIA PRACTICE] Calculating from letter pairs");
      const correctAnswer = calculateMatchingPairs(question.data.letterPairs);
      return answer === correctAnswer;
    }

    console.warn("⚠️ [LIA PRACTICE] No validation method available");
    return false;
  };

  const handleContinue = () => {
    if (isCorrect) {
      if (currentQuestion < practiceQuestions.length - 1) {
        setCurrentQuestion(currentQuestion + 1);
        setSelectedAnswer(null);
        setShowFeedback(false);
      }
    } else {
      // Reset for retry
      setSelectedAnswer(null);
      setShowFeedback(false);
    }
  };

  const allPracticeCompleted = completedQuestions.every(
    (completed) => completed
  );

  const renderLetterPairs = (question: MILQuestion) => {
    if (!question.data.letterPairs) return null;

    return (
      <div className="max-w-sm sm:max-w-md md:max-w-xl mx-auto mb-4 sm:mb-6">
        {/* Letter Pairs Container */}
        <div className="bg-white border-2 border-blue-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 shadow-sm">
          {/* Top Row */}
          <div className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6 mb-3 sm:mb-4 md:mb-6">
            {question.data.letterPairs.map((pair, index) => (
              <div key={`top-${index}`} className="text-center">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 font-mono">
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
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 font-mono">
                  {pair.bottomLetter}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderLetterSequence = (question: MILQuestion) => {
    if (!question.data.letterSequence) return null;

    const { letters } = question.data.letterSequence;

    return (
      <div className="max-w-lg mx-auto mb-6 sm:mb-8">
        <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
          {/* Letter Sequence Display */}
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
                      ? "bg-gradient-to-br from-purple-100 to-blue-100 border-2 border-purple-300 shadow-lg"
                      : "bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300"
                  }`}
                >
                  <span className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 font-mono">
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
  };

  const renderNumberSequence = (question: MILQuestion) => {
    if (!question.data.numbers || question.data.numbers.length !== 3)
      return null;

    const numbers = question.data.numbers;
    const sortedNumbers = [...numbers].sort((a, b) => a - b);
    const lowest = sortedNumbers[0];
    const highest = sortedNumbers[2];
    const middle = sortedNumbers[1];

    return (
      <div className="max-w-lg mx-auto mb-6 sm:mb-8">
        <div className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
          {/* Number Sequence Display */}
          <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
            {numbers.map((number, index) => {
              const isMiddle = number === middle;
              const isExtreme = number === lowest || number === highest;

              return (
                <div
                  key={index}
                  className={`text-center ${
                    isMiddle ? "transform scale-110" : ""
                  }`}
                >
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl flex items-center justify-center ${
                      isMiddle
                        ? "bg-gradient-to-br from-orange-100 to-yellow-100 border-2 border-orange-300 shadow-lg"
                        : isExtreme
                        ? "bg-gradient-to-br from-red-100 to-orange-100 border-2 border-red-300 shadow-md"
                        : "bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300"
                    }`}
                  >
                    <span className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 font-mono">
                      {number}
                    </span>
                  </div>
                  {isMiddle && (
                    <div className="text-xs sm:text-sm text-orange-600 font-medium mt-2">
                      Middle
                    </div>
                  )}
                  {number === lowest && (
                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                      Lowest
                    </div>
                  )}
                  {number === highest && (
                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                      Highest
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderVisualRotation = (question: MILQuestion) => {
    if (!question.data.visualRotationItems) return null;

    const items = question.data.visualRotationItems;
    // Group items into pairs (top and bottom)
    const pairs = [];
    for (let i = 0; i < items.length; i += 2) {
      if (i + 1 < items.length) {
        pairs.push({
          top: items[i],
          bottom: items[i + 1],
        });
      }
    }

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
      <div className="max-w-lg mx-auto mb-6 sm:mb-8">
        <div className="relative bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
          {/* Top Row */}
          <div
            className={`grid gap-2 sm:gap-4 md:gap-6 mb-4 sm:mb-6`}
            style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
          >
            {pairs.map((pair, index) => (
              <div key={`top-${index}`} className="text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 font-mono inline-block transition-transform duration-200"
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
            className={`grid gap-2 sm:gap-4 md:gap-6`}
            style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
          >
            {pairs.map((pair, index) => (
              <div key={`bottom-${index}`} className="text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 font-mono inline-block transition-transform duration-200"
                    style={{
                      transform: getTransform(pair.bottom),
                    }}
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
  };

  const renderAnswerOptions = (question: MILQuestion) => {
    // Check if question has API-provided options (for Verbal Reasoning, etc.)
    if (question.data.options && question.data.options.length > 0) {
      console.log(
        "🔤 [LIA PRACTICE] Using API-provided options:",
        question.data.options
      );

      return question.data.options.map((option, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={showFeedback}
          className={`px-3 py-2 sm:px-4 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-100 min-w-[100px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] text-center ${
            selectedAnswer === index
              ? "bg-blue-600 text-white shadow-lg transform scale-105"
              : "bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md"
          } ${showFeedback ? "cursor-not-allowed opacity-50" : ""}`}
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
      console.log(
        "🔤 [LIA PRACTICE] Using letter sequence options:",
        question.data.letterSequence.outerLetters
      );

      return question.data.letterSequence.outerLetters.map((letter, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={showFeedback}
          className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl sm:rounded-2xl font-bold text-xl sm:text-2xl md:text-3xl transition-all duration-100 ${
            selectedAnswer === index
              ? "bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-purple-200/50"
              : "bg-white border-2 border-gray-200 text-gray-700 hover:border-purple-300 hover:bg-purple-50 shadow-lg hover:shadow-xl"
          } font-mono ${showFeedback ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {letter}
        </button>
      ));
    }

    // Check if question has numbers (for Numeric Velocity)
    if (question.data.numbers && question.data.numbers.length === 3) {
      const numbers = question.data.numbers;
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const lowest = sortedNumbers[0];
      const highest = sortedNumbers[2];
      const extremes = [lowest, highest];

      console.log(
        "🔢 [LIA PRACTICE] Using numeric velocity options:",
        extremes
      );

      return extremes.map((number, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={showFeedback}
          className={`w-14 h-14 sm:w-16 sm:h-16 md:w-18 md:h-18 rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl md:text-2xl transition-all duration-100 ${
            selectedAnswer === index
              ? "bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl transform scale-105 ring-2 sm:ring-4 ring-orange-200/50"
              : "bg-white border-2 border-gray-200 text-gray-700 hover:border-orange-300 hover:bg-orange-50 shadow-lg hover:shadow-xl"
          } font-mono ${showFeedback ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {number}
        </button>
      ));
    }

    // Check if question has visual rotation items
    if (question.data.visualRotationItems) {
      const items = question.data.visualRotationItems;
      const numPairs = Math.floor(items.length / 2);
      const maxOptions = Math.min(numPairs, 4); // Cap at 4 for UI reasons
      const options = Array.from({ length: maxOptions + 1 }, (_, i) => i); // 0 to maxOptions

      console.log("🔄 [LIA PRACTICE] Using visual rotation options:", {
        totalItems: items.length,
        numPairs,
        maxOptions,
        options,
      });

      return options.map((option) => (
        <button
          key={option}
          onClick={() => handleAnswerSelect(option)}
          disabled={showFeedback}
          className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg font-bold text-base sm:text-lg md:text-xl transition-all ${
            selectedAnswer === option
              ? "bg-indigo-600 text-white shadow-lg transform scale-105"
              : "bg-indigo-500 text-white hover:bg-indigo-600 hover:shadow-md"
          } ${showFeedback ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {option}
        </button>
      ));
    }

    // Default numeric options (for Pattern Recognition, etc.)
    console.log("🔢 [LIA PRACTICE] Using default numeric options (0-4)");

    return [0, 1, 2, 3, 4].map((option) => (
      <button
        key={option}
        onClick={() => handleAnswerSelect(option)}
        disabled={showFeedback}
        className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg font-bold text-base sm:text-lg md:text-xl transition-all ${
          selectedAnswer === option
            ? "bg-blue-600 text-white shadow-lg transform scale-105"
            : "bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md"
        } ${showFeedback ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {option}
      </button>
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">
            {t("dashboard.loadingPracticeExamples")}
          </p>
        </div>
      </div>
    );
  }

  if (practiceQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
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

  // Debug log to see the current question structure
  console.log("🔍 [LIA PRACTICE] Current question:", {
    questionNumber: currentQ?.questionNumber,
    questionText: currentQ?.questionText,
    type: currentQ?.type,
    hasOptions: currentQ?.data?.options ? true : false,
    options: currentQ?.data?.options,
    hasLetterPairs: currentQ?.data?.letterPairs ? true : false,
    correctAnswer: currentQ?.correctAnswer,
    explanation: currentQ?.explanation,
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border p-8"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t("dashboard.practiceExamples")}
            </h1>
            <p className="text-gray-600 mb-4">
              {t("dashboard.answerCorrectlyToProceed")}
            </p>

            {/* Progress */}
            <div className="flex justify-center space-x-2 mb-4">
              {practiceQuestions.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    completedQuestions[index]
                      ? "bg-green-500"
                      : index === currentQuestion
                      ? "bg-blue-500"
                      : "bg-gray-300"
                  }`}
                />
              ))}
            </div>

            <div className="text-sm text-gray-500">
              {t("dashboard.exampleOf", {
                current: currentQuestion + 1,
                total: practiceQuestions.length,
              })}
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 text-center mb-6">
              {currentQ.questionText}
            </h2>

            {renderLetterPairs(currentQ)}
            {renderLetterSequence(currentQ)}
            {renderNumberSequence(currentQ)}
            {renderVisualRotation(currentQ)}

            {/* Answer Options */}
            <div className="flex justify-center flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6 max-w-4xl mx-auto px-2">
              {renderAnswerOptions(currentQ)}
            </div>
          </div>

          {/* Feedback */}
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg mb-6 ${
                isCorrect
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
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
                    isCorrect ? "text-green-800" : "text-red-800"
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
                    // For letter pairs questions
                    if (currentQ.data.letterPairs) {
                      return `${calculateMatchingPairs(
                        currentQ.data.letterPairs
                      )} ${t("dashboard.matchingPairs")}`;
                    }

                    // For questions with options
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

                    // For numeric answers
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
              className="px-4 py-2 sm:px-6 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
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
