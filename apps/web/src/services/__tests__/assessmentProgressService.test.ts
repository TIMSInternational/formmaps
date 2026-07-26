// Task 5 (Madhav fix-wave, item 6): "one 360-completion rule everywhere".
// The 360 evaluation status here used to require one completed evaluator of
// EACH relation type (self + parent + teacher + sibling/friend). The server's
// own gate (computeStudentCompletion, api/src/services/assessmentService.ts)
// unlocks careers/course-plan at evalCompleted >= min(evalTotal, 3) — a
// student who finished 3-of-4 invited evaluators stayed "pending" here even
// though the server had already unlocked them. This suite locks the frontend
// onto the SAME threshold rule (exported as EVAL_REQUIRED_RULE) so no surface
// can drift from it again.
import {
  getUserAssessmentProgress,
  EVAL_REQUIRED_RULE,
  isEvalComplete,
} from "@/services/assessmentProgressService";
import { getMILResults } from "@/services/milService";
import {
  getUserEvaluationGroups,
  getUserEvaluationProgressSummary,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import { checkPCAStatus } from "@/services/pcaService";

jest.mock("@/services/milService", () => ({ getMILResults: jest.fn() }));
jest.mock("@/services/evaluationService", () => ({
  getUserEvaluationGroups: jest.fn(),
  getUserEvaluationProgressSummary: jest.fn(),
}));
jest.mock("@/services/pcaService", () => ({ checkPCAStatus: jest.fn() }));

const mockMil = getMILResults as jest.Mock;
const mockGroups = getUserEvaluationGroups as jest.Mock;
const mockSummary = getUserEvaluationProgressSummary as jest.Mock;
const mockPca = checkPCAStatus as jest.Mock;

function group(
  overrides: Partial<EvaluationGroupWithId> & { id: string },
): EvaluationGroupWithId {
  return {
    evaluatorName: "Evaluator",
    evaluatorEmail: "e@example.com",
    relation: "Other",
    groupType: "Parent",
    evaluatedUserId: "student-1",
    invitationToken: "tok",
    invitationUrl: "https://example.com",
    tokenExpiryDate: "2026-12-01T00:00:00.000Z",
    isTokenUsed: false,
    isEvaluationCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("EVAL_REQUIRED_RULE / isEvalComplete — server-mirrored threshold", () => {
  it("caps the requirement at 3 even when more evaluators were invited", () => {
    expect(EVAL_REQUIRED_RULE(4)).toBe(3);
    expect(isEvalComplete(3, 4)).toBe(true);
    expect(isEvalComplete(2, 4)).toBe(false);
  });

  it("requires ALL invited when fewer than 3 were invited", () => {
    expect(EVAL_REQUIRED_RULE(2)).toBe(2);
    expect(isEvalComplete(2, 2)).toBe(true);
    expect(isEvalComplete(1, 2)).toBe(false);
  });

  it("is never complete when nobody was invited", () => {
    expect(EVAL_REQUIRED_RULE(0)).toBe(0);
    expect(isEvalComplete(0, 0)).toBe(false);
  });
});

describe("getUserAssessmentProgress — 360 evaluation status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMil.mockResolvedValue(null);
    mockPca.mockResolvedValue({ status: "not_started" });
    mockSummary.mockReturnValue({
      totalGroups: 0, completedEvaluations: 0, pendingEvaluations: 0, expiredInvitations: 0,
      groupsByType: { Parent: 0, Teacher: 0, SiblingFriend: 0, Self: 0 },
    });
  });

  it("is completed at 3-of-4 (the exact reported symptom) — not all 4 required", async () => {
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Self", relation: "Self", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
      group({ id: "3", groupType: "Teacher", relation: "Counselor", isEvaluationCompleted: true }),
      group({ id: "4", groupType: "SiblingFriend", relation: "Friend", isEvaluationCompleted: false }),
    ]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.evaluationAssessment.status).toBe("completed");
  });

  it("does not require one-of-each relation type — 3 parents completing is enough", async () => {
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Father", isEvaluationCompleted: true }),
      group({ id: "3", groupType: "Parent", relation: "Aunt", isEvaluationCompleted: true }),
      group({ id: "4", groupType: "Teacher", relation: "Counselor", isEvaluationCompleted: false }),
    ]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.evaluationAssessment.status).toBe("completed");
  });

  it("requires ALL invited when only 2 were invited (min rule, not a flat 3)", async () => {
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Self", relation: "Self", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
    ]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.evaluationAssessment.status).toBe("completed");
  });

  it("stays in_progress below the threshold (2-of-4)", async () => {
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Self", relation: "Self", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
      group({ id: "3", groupType: "Teacher", relation: "Counselor", isEvaluationCompleted: false }),
      group({ id: "4", groupType: "SiblingFriend", relation: "Friend", isEvaluationCompleted: false }),
    ]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.evaluationAssessment.status).toBe("in_progress");
  });

  it("stays not_started when zero evaluators are assigned", async () => {
    mockGroups.mockResolvedValue([]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.evaluationAssessment.status).toBe("not_started");
  });

  // CareerExplorer.tsx gates on overallCompletion.completedAssessments === 3
  // (all 3 of MIL/360/PCA "completed"). This proves that gate is unlocked by
  // the corrected 360 rule transitively, with no separate fix needed there.
  it("unlocks the CareerExplorer 3-of-3 gate (overallCompletion) at 3-of-4 360 evaluators", async () => {
    mockMil.mockResolvedValue({
      completedExams: 5, totalExams: 5, overallScore: 80, lastCompletedAt: "2026-01-01",
      examResults: [{ status: "completed", scorePercentage: 80 }],
    });
    mockPca.mockResolvedValue({ status: "completed" });
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Self", relation: "Self", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
      group({ id: "3", groupType: "Teacher", relation: "Counselor", isEvaluationCompleted: true }),
      group({ id: "4", groupType: "SiblingFriend", relation: "Friend", isEvaluationCompleted: false }),
    ]);
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.overallCompletion.completedAssessments).toBe(3);
  });
});
