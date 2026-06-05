import { createCustomPracticeQuestions } from "../practiceQuestionData";
import { MIL_EXAMS } from "@/services/milService";

// Each LIA subtest's practice examples must match the REAL assessment's
// question format (data shape) and exam type — they were previously selected
// by stale examId substrings, so numeric/spatial fell back to letter-pairs.
const CASES = [
  { examId: MIL_EXAMS.FEATURE_DETECTION,        type: 1, field: "letterPairs" },
  { examId: MIL_EXAMS.VERBAL_REASONING,         type: 2, field: "options" },
  { examId: MIL_EXAMS.WORKING_MEMORY,           type: 3, field: "letterSequence" },
  { examId: MIL_EXAMS.NUMERICAL_SPEED_ACCURACY, type: 4, field: "numbers" },
  { examId: MIL_EXAMS.SPATIAL_ORIENTATION,      type: 5, field: "visualRotationItems" },
] as const;

describe("createCustomPracticeQuestions wires each subtest to the correct practice format", () => {
  for (const c of CASES) {
    it(`${c.examId} → ${c.field} (type ${c.type})`, () => {
      const qs = createCustomPracticeQuestions(c.examId);
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) {
        expect((q.data as Record<string, unknown>)[c.field]).toBeDefined();
        expect(q.type).toBe(c.type);
      }
    });
  }

  it("numeric and spatial practice are NOT letter-pairs", () => {
    for (const q of createCustomPracticeQuestions(MIL_EXAMS.NUMERICAL_SPEED_ACCURACY)) {
      expect(q.data.letterPairs).toBeUndefined();
    }
    for (const q of createCustomPracticeQuestions(MIL_EXAMS.SPATIAL_ORIENTATION)) {
      expect(q.data.letterPairs).toBeUndefined();
    }
  });
});
