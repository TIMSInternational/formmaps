import { MILExamId, MILQuestion } from "@/services/milService";

// Practice examples per LIA subtest. Selection is keyed off the REAL exam IDs
// (MIL_EXAMS.*: "feature-detection-001", "verbal-reasoning-001",
// "working-memory-001", "numerical-speed-accuracy-001", "spatial-orientation-001")
// and each `type` matches the real exam type (1=feature/letter-pairs,
// 2=verbal, 3=working-memory, 4=numeric, 5=spatial). Previously these were
// matched by stale slugs ("numeric-velocity"/"visual-rotation"/...), so the
// numeric and spatial subtests fell through to the letter-pairs default and
// showed practice that didn't match the actual assessment.
export function createCustomPracticeQuestions(examId: MILExamId): MILQuestion[] {
  if (examId.includes("feature-detection")) {
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
        type: 3,
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
        type: 3,
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
        type: 3,
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

  if (examId.includes("numerical-speed-accuracy")) {
    return [
      {
        questionNumber: 1,
        questionText:
          "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
        type: 4,
        data: {
          numbers: [7, 1, 3],
        },
        explanation:
          "The lowest number is 1 and the highest is 7. The middle (median) number is 3. The number 7 is 4 away from 3, while 1 is only 2 away — so 7 is furthest from the middle. The correct answer is 7.",
        correctAnswer: 7,
      },
      {
        questionNumber: 2,
        questionText:
          "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
        type: 4,
        data: {
          numbers: [21, 29, 17],
        },
        explanation:
          "Identify the lowest number (17) and the highest number (29). The middle (median) number is 21. The number 29 is 8 away from 21, while 17 is only 4 away — so 29 is furthest from the middle. The correct answer is 29.",
        correctAnswer: 29,
      },
    ];
  }

  if (examId.includes("spatial-orientation")) {
    return [
      {
        questionNumber: 1,
        questionText:
          "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
        type: 5,
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
          "Compare each top/bottom pair: pair 1 (R vs R) matches; pair 2 (R vs R rotated 180°) matches — rotation is allowed; pair 3 (R mirrored vs R) does NOT match, because a mirrored figure can't be reproduced by rotation alone. So 2 pairs match.",
        correctAnswer: 2,
      },
      {
        questionNumber: 2,
        questionText:
          "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
        type: 5,
        data: {
          visualRotationItems: [
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 90, isMirrored: false },
            { letter: "R", rotationDegree: 270, isMirrored: false },
          ],
        },
        explanation:
          "Pair 1 (R vs R) matches. Pair 2 (R rotated 90° vs R rotated 270°) also matches — both are pure rotations of the same R. So 2 pairs match.",
        correctAnswer: 2,
      },
      {
        questionNumber: 3,
        questionText:
          "How many of the bottom figures are identical to the ones directly above them, after rotating them in any direction?",
        type: 5,
        data: {
          visualRotationItems: [
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: true },
            { letter: "R", rotationDegree: 180, isMirrored: false },
            { letter: "R", rotationDegree: 90, isMirrored: false },
            { letter: "R", rotationDegree: 0, isMirrored: false },
            { letter: "R", rotationDegree: 90, isMirrored: true },
          ],
        },
        explanation:
          "Pair 1 (R vs R) matches. Pair 2 (R vs R mirrored) does NOT match. Pair 3 (R rotated 180° vs R rotated 90°) matches — both pure rotations. Pair 4 (R vs R rotated 90° + mirrored) does NOT match. So 2 pairs match.",
        correctAnswer: 2,
      },
    ];
  }

  // Default fallback: letter-pair (feature detection) practice.
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
