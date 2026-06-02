import { MILExamId, MILQuestion } from "@/services/milService";

export function createCustomPracticeQuestions(examId: MILExamId): MILQuestion[] {
  if (examId.includes("pattern-recognition")) {
    return [
      {
        questionNumber: 1,
        questionText: "How many letter pairs match? (Case doesn't matter)",
        type: 1,
        data: {
          letterPairs: [
            { topLetter: "D", bottomLetter: "a" },
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
            { topLetter: "q", bottomLetter: "Q" },
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
            { topLetter: "M", bottomLetter: "w" },
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
  }

  if (examId.includes("verbal-reasoning")) {
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
        correctAnswer: 0,
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
        correctAnswer: 2,
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
        correctAnswer: 2,
      },
    ];
  }

  if (examId.includes("working-memory")) {
    return [
      {
        questionNumber: 1,
        questionText:
          "Which outer letter is alphabetically furthest from the middle letter?",
        type: 2,
        data: {
          letterSequence: {
            letters: ["F", "H", "K"],
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
            letters: ["P", "S", "U"],
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
            letters: ["C", "E", "H"],
            outerLetters: ["C", "H"],
            middleLetter: "E",
          },
        },
        explanation:
          "C is 2 positions before E, H is 3 positions after E. H is further from E alphabetically.",
        correctAnswer: "H",
      },
    ];
  }

  if (examId.includes("numeric-velocity")) {
    return [
      {
        questionNumber: 1,
        questionText:
          "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
        type: 3,
        data: {
          numbers: [7, 1, 3],
        },
        explanation:
          "In this case, the numbers are ordered from lowest to highest. The number 1 is the lowest, and the number 7 is the highest. The middle number is 3. The number 7 is furthest from 3. Therefore, the correct answer is letter A, which corresponds to the number 7.",
        correctAnswer: 7,
      },
      {
        questionNumber: 2,
        questionText:
          "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
        type: 3,
        data: {
          numbers: [21, 29, 17],
        },
        explanation:
          "In this case, the numbers are not in order from lowest to highest. Identify the lowest number (17) and the highest number (29). The middle number is 21. Now, determine which of the extremes (17 or 29) is furthest from the number 21. The number 29 is furthest from 21. Therefore, the correct answer is letter B, which corresponds to the number 29.",
        correctAnswer: 29,
      },
    ];
  }

  if (examId.includes("visual-rotation")) {
    return [
      {
        questionNumber: 1,
        questionText:
          "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
        type: 4,
        data: {
          visualRotationItems: [
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
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
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
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
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
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

  // Default: return generic practice questions
  return [
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
  ];
}
