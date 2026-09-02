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
  getDashboardAssessmentSummary,
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
import { personalityApi } from "@/services/personalityService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/services/milService", () => ({ getMILResults: jest.fn() }));
jest.mock("@/services/evaluationService", () => ({
  getUserEvaluationGroups: jest.fn(),
  getUserEvaluationProgressSummary: jest.fn(),
}));
jest.mock("@/services/pcaService", () => ({ checkPCAStatus: jest.fn() }));
jest.mock("@/services/personalityService", () => ({ personalityApi: { getAccess: jest.fn() } }));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
// The signed-in user, as assessmentCompletionService.isViewingSelf reads it. Left undefined
// (the pre-hydration shape) for the existing suites, which all look up the caller's own
// progress; the "viewing another user" suite sets it to a different id.
let currentUserId: string | undefined;
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: { getState: () => ({ user: { id: currentUserId } }) },
}));

const mockMil = getMILResults as jest.Mock;
const mockGroups = getUserEvaluationGroups as jest.Mock;
const mockSummary = getUserEvaluationProgressSummary as jest.Mock;
const mockPca = checkPCAStatus as jest.Mock;
const mockPersonalityAccess = personalityApi.getAccess as jest.Mock;
const mockApiRequest = apiRequest as jest.Mock;

// GET /api/v1/assessment/completion — the server's checkAssessmentCompletion verdict,
// now the authoritative source for overallCompletion (see assessmentProgressService.ts).
function mockCompletionEndpoint(overrides: { allDone?: boolean; personalityCompleted?: boolean } = {}) {
  mockApiRequest.mockResolvedValue({
    success: true,
    data: {
      allDone: overrides.allDone ?? false,
      readyForInsights: overrides.allDone ?? false,
      personalityCompleted: overrides.personalityCompleted ?? false,
    },
  });
}

function mockCompletionUnreachable() {
  mockApiRequest.mockRejectedValue(new Error("network down"));
}

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
    mockPersonalityAccess.mockResolvedValue({ has_access: false, has_completed: false });
    mockCompletionEndpoint();
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

  // CareerExplorer.tsx reads overallCompletion.completedAssessments. This proves the
  // corrected 360 rule feeds through transitively (MIL/360/PCA all read as "completed"),
  // with no separate fix needed there. Personality intentionally left not-completed and
  // the server mocked as NOT allDone (real, non-grandfathered case) — completedAssessments
  // should be 3-of-4, not 4, matching the fact Personality still isn't done.
  it("reflects 3-of-4 completed (MIL/360/PCA) at 3-of-4 360 evaluators, Personality still pending", async () => {
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
    mockCompletionEndpoint({ allDone: false, personalityCompleted: false });
    const progress = await getUserAssessmentProgress("student-1");
    expect(progress.overallCompletion.completedAssessments).toBe(3);
    expect(progress.overallCompletion.totalAssessments).toBe(4);
    expect(progress.overallCompletion.percentageComplete).toBe(75);
  });
});

describe("getUserAssessmentProgress — personality: required 4th assessment (since 2026-07-30)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMil.mockResolvedValue(null);
    mockGroups.mockResolvedValue([]);
    mockSummary.mockReturnValue({
      totalGroups: 0, completedEvaluations: 0, pendingEvaluations: 0, expiredInvitations: 0,
      groupsByType: { Parent: 0, Teacher: 0, SiblingFriend: 0, Self: 0 },
    });
    mockPca.mockResolvedValue({ status: "not_started", lastActivity: undefined, hasResults: false, pcaCod: null });
    mockCompletionEndpoint();
  });

  it("exposes personalityAssessment with gating:true (not grandfathered) and status derived from /access", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "sess-1" });
    mockCompletionEndpoint({ allDone: false, personalityCompleted: true });

    const result = await getUserAssessmentProgress("u1");

    expect(result).toHaveProperty("personalityAssessment");
    expect((result as any).personalityAssessment.gating).toBe(true);
    expect((result as any).personalityAssessment.status).toBe("completed");
  });

  it("status is in_progress when access exists with an unfinished session", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false, existing_session_id: "sess-1" });
    const result = await getUserAssessmentProgress("u1");
    expect((result as any).personalityAssessment.status).toBe("in_progress");
  });

  it("status is not_started when there is no session yet", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false });
    const result = await getUserAssessmentProgress("u1");
    expect((result as any).personalityAssessment.status).toBe("not_started");
  });

  it("never throws when the /access call fails — falls back to not_started", async () => {
    mockPersonalityAccess.mockRejectedValue(new Error("network down"));
    await expect(getUserAssessmentProgress("u1")).resolves.not.toThrow();
    const result = await getUserAssessmentProgress("u1");
    expect((result as any).personalityAssessment.status).toBe("not_started");
  });

  // -----------------------------------------------------------------------
  // THE 4-ASSESSMENT GUARANTEE: overallCompletion now counts Personality as a
  // real 4th assessment (totalAssessments === 4), and completedAssessments
  // reflects Personality's own status — the opposite of the pre-2026-07-30
  // "personality never shifts the math" invariant this suite used to pin.
  // -----------------------------------------------------------------------
  it("overallCompletion.totalAssessments is 4", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "sess-1" });
    mockCompletionEndpoint({ allDone: false, personalityCompleted: true });
    const result = await getUserAssessmentProgress("u1");
    expect(result.overallCompletion.totalAssessments).toBe(4);
  });

  it("overallCompletion.completedAssessments increases by 1 when personality completes (all else held constant)", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: false, has_completed: false });
    mockCompletionEndpoint({ allDone: false, personalityCompleted: false });
    const withoutPersonality = await getUserAssessmentProgress("u1");

    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "sess-1" });
    mockCompletionEndpoint({ allDone: false, personalityCompleted: true });
    const withPersonality = await getUserAssessmentProgress("u1");

    expect(withPersonality.overallCompletion.completedAssessments).toBe(
      withoutPersonality.overallCompletion.completedAssessments + 1
    );
    expect(withPersonality.milAssessment.status).toEqual(withoutPersonality.milAssessment.status);
    expect(withPersonality.evaluationAssessment.status).toEqual(withoutPersonality.evaluationAssessment.status);
    expect(withPersonality.pcaAssessment.status).toEqual(withoutPersonality.pcaAssessment.status);
  });

  it("a legacyUnlockGrandfathered student reads gating:false and 100% complete even without personality", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false });
    // Server says allDone despite personalityCompleted:false — the only way that
    // combination occurs is legacyUnlockGrandfathered.
    mockCompletionEndpoint({ allDone: true, personalityCompleted: false });

    const result = await getUserAssessmentProgress("u1");

    expect((result as any).personalityAssessment.gating).toBe(false);
    expect(result.overallCompletion.percentageComplete).toBe(100);
  });

  // The outage fallback used to drop to the pre-2026-07-30 3-assessment denominator,
  // which is how the dashboard card came to read "1/3 · 33%" for a student who owes
  // four. personalityStatus is fetched independently and never throws, so an outage
  // has no reason to change the denominator — only the grandfathering verdict is lost.
  it("keeps the 4-assessment denominator (and does not throw) when the completion endpoint is unreachable", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "sess-1" });
    mockApiRequest.mockRejectedValue(new Error("network down"));

    const result = await getUserAssessmentProgress("u1");

    expect(result.overallCompletion.totalAssessments).toBe(4);
  });

  it("counts personality in the fallback tally when the completion endpoint is unreachable", async () => {
    mockPca.mockResolvedValue({ status: "completed" });
    mockApiRequest.mockRejectedValue(new Error("network down"));

    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false });
    const without = await getUserAssessmentProgress("u1");

    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "s" });
    const withIt = await getUserAssessmentProgress("u1");

    expect(without.overallCompletion.completedAssessments).toBe(1);
    expect(without.overallCompletion.percentageComplete).toBe(25);
    expect(withIt.overallCompletion.completedAssessments).toBe(2);
    expect(withIt.overallCompletion.percentageComplete).toBe(50);
  });
});

// -------------------------------------------------------------------------
// The dashboard "Assessments" StatCard sizes itself off this payload. The
// `assessments` array omitted Personality, so the card rendered a 3-denominator
// fraction next to a percentage computed over 4 ("1/3 · 33%"). Both the array
// and the (completed, total) pair must describe the same four assessments.
// -------------------------------------------------------------------------
describe("getDashboardAssessmentSummary — the four assessments the card counts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMil.mockResolvedValue(null);
    mockGroups.mockResolvedValue([]);
    mockSummary.mockReturnValue({
      totalGroups: 0, completedEvaluations: 0, pendingEvaluations: 0, expiredInvitations: 0,
      groupsByType: { Parent: 0, Teacher: 0, SiblingFriend: 0, Self: 0 },
    });
    mockPca.mockResolvedValue({ status: "completed" });
    mockPersonalityAccess.mockResolvedValue({ has_access: false, has_completed: false });
    mockCompletionEndpoint();
  });

  it("lists all four assessments, personality included", async () => {
    const summary = await getDashboardAssessmentSummary("u1");
    expect(summary.assessments.map((a) => a.type)).toEqual([
      "mil",
      "evaluation",
      "pca",
      "personality",
    ]);
  });

  it("agrees with the (completed, total) pair the percentage is derived from", async () => {
    const summary = await getDashboardAssessmentSummary("u1");
    const completedInArray = summary.assessments.filter((a) => a.status === "completed").length;

    expect(summary.totalAssessments).toBe(summary.assessments.length);
    expect(completedInArray).toBe(summary.completedAssessments);
    expect(summary.overallCompletion).toBe(
      Math.round((summary.completedAssessments / summary.totalAssessments) * 100)
    );
  });

  it("reports the personality assessment's real status", async () => {
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "s" });
    mockCompletionEndpoint({ allDone: false, personalityCompleted: true });
    const summary = await getDashboardAssessmentSummary("u1");
    const personality = summary.assessments.find((a) => a.type === "personality");
    expect(personality?.status).toBe("completed");
    expect(personality?.completion).toBe(100);
  });
});

// -------------------------------------------------------------------------
// The server verdict (GET /api/v1/assessment/completion) is authoritative and may
// only RAISE a status. checkPCAStatus is mocked here, so these prove the service
// itself applies the verdict — the counterpart for checkPCAStatus's own use of it
// lives in pcaService.checkPCAStatus.test.ts.
// -------------------------------------------------------------------------
describe("getUserAssessmentProgress — the server verdict raises client-derived statuses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUserId = undefined;
    mockMil.mockResolvedValue(null);
    mockGroups.mockResolvedValue([]);
    mockSummary.mockReturnValue({
      totalGroups: 0, completedEvaluations: 0, pendingEvaluations: 0, expiredInvitations: 0,
      groupsByType: { Parent: 0, Teacher: 0, SiblingFriend: 0, Self: 0 },
    });
    mockPca.mockResolvedValue({ status: "in_progress", hasResults: false });
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false });
  });

  it("hands the server's pcaCompleted into checkPCAStatus and reads PCA as completed", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { allDone: false, pcaCompleted: true, personalityCompleted: false } });
    const result = await getUserAssessmentProgress("u1");
    expect(mockPca).toHaveBeenCalledWith("u1", "english", true);
    // The mocked checkPCAStatus ignored the hint and said in_progress; the verdict still wins.
    expect(result.pcaAssessment.status).toBe("completed");
  });

  it("reads LIA and 360 as completed from the verdict alone when the client data is empty", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { allDone: false, liaCompleted: 5, liaTotal: 5, evalCompleted: 3, evalTotal: 4, pcaCompleted: false, personalityCompleted: false },
    });
    const result = await getUserAssessmentProgress("u1");
    expect(result.milAssessment.status).toBe("completed");
    expect(result.evaluationAssessment.status).toBe("completed");
    expect(result.pcaAssessment.status).toBe("in_progress");
  });

  it("never LOWERS a status: client says completed, verdict says not", async () => {
    mockPca.mockResolvedValue({ status: "completed", hasResults: true });
    mockApiRequest.mockResolvedValue({ success: true, data: { allDone: false, pcaCompleted: false, personalityCompleted: false } });
    const result = await getUserAssessmentProgress("u1");
    expect(result.pcaAssessment.status).toBe("completed");
  });

  it("fetches the verdict exactly once per lookup (it used to be fetched at the end as well)", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { allDone: false, personalityCompleted: false } });
    await getUserAssessmentProgress("u1");
    const completionCalls = mockApiRequest.mock.calls.filter(([path]) => path === "/api/v1/assessment/completion");
    expect(completionCalls).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------
// /counselor/students/[id] calls getUserAssessmentProgress(studentId). Two of the
// endpoints it used are SELF-scoped (/assessment/completion, /personality/access), so
// the counselor was shown their OWN Personality status and completion verdict for every
// student. When the id is not the signed-in user, neither may be called.
// -------------------------------------------------------------------------
describe("getUserAssessmentProgress — viewing ANOTHER user (counselor student page)", () => {
  const COUNSELOR = "counselor-9";
  const STUDENT = "student-1";

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserId = COUNSELOR;
    mockMil.mockResolvedValue({
      completedExams: 5, totalExams: 5, overallScore: 80, lastCompletedAt: "2026-01-01",
      examResults: [{ status: "completed", scorePercentage: 80 }],
    });
    mockGroups.mockResolvedValue([
      group({ id: "1", groupType: "Self", relation: "Self", isEvaluationCompleted: true }),
      group({ id: "2", groupType: "Parent", relation: "Mother", isEvaluationCompleted: true }),
      group({ id: "3", groupType: "Teacher", relation: "Counselor", isEvaluationCompleted: true }),
    ]);
    mockSummary.mockReturnValue({
      totalGroups: 3, completedEvaluations: 3, pendingEvaluations: 0, expiredInvitations: 0,
      groupsByType: { Parent: 1, Teacher: 1, SiblingFriend: 0, Self: 1 },
    });
    mockPca.mockResolvedValue({ status: "completed", hasResults: true });
    // The counselor's OWN personality: never started. Must not leak into the student's row.
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: false });
  });

  it("does not call either self-scoped endpoint", async () => {
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === `/api/v1/personality/user/${STUDENT}/results`) return { success: true, data: { profile: "INTJ" } };
      throw Object.assign(new Error("Not found"), { status: 404 });
    });
    await getUserAssessmentProgress(STUDENT);
    expect(mockPersonalityAccess).not.toHaveBeenCalled();
    expect(mockApiRequest.mock.calls.map(([p]) => p)).not.toContain("/api/v1/assessment/completion");
  });

  it("reads the STUDENT's personality from the access-checked results route: 200 → completed", async () => {
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === `/api/v1/personality/user/${STUDENT}/results`) return { success: true, data: { profile: "INTJ" } };
      throw Object.assign(new Error("Not found"), { status: 404 });
    });
    const result = await getUserAssessmentProgress(STUDENT);
    expect(result.personalityAssessment.status).toBe("completed");
    expect(result.personalityAssessment.hasAccess).toBe(false);
    expect(result.overallCompletion.completedAssessments).toBe(4);
    expect(result.overallCompletion.totalAssessments).toBe(4);
    expect(result.overallCompletion.percentageComplete).toBe(100);
  });

  it("404 on the results route → not_started, and the tally is 3-of-4", async () => {
    mockApiRequest.mockImplementation(async () => {
      throw Object.assign(new Error("Not found"), { status: 404 });
    });
    const result = await getUserAssessmentProgress(STUDENT);
    expect(result.personalityAssessment.status).toBe("not_started");
    expect(result.overallCompletion.completedAssessments).toBe(3);
    expect(result.overallCompletion.percentageComplete).toBe(75);
  });

  it("still treats the signed-in user's own lookup as self", async () => {
    currentUserId = STUDENT;
    mockApiRequest.mockResolvedValue({ success: true, data: { allDone: true, personalityCompleted: true } });
    mockPersonalityAccess.mockResolvedValue({ has_access: true, has_completed: true, existing_session_id: "s" });
    const result = await getUserAssessmentProgress(STUDENT);
    expect(mockPersonalityAccess).toHaveBeenCalled();
    expect(result.overallCompletion.percentageComplete).toBe(100);
  });
});
