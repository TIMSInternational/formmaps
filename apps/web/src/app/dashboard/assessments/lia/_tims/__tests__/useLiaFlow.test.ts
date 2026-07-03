/**
 * useLiaFlow — tims state-machine semantics: overview gating, start →
 * general-instructions, practice → assessment, between-subtest transitions
 * skip the intro, completion drains violations and ends lockdown.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLiaFlow } from "../useLiaFlow";

const api = {
  checkAccess: jest.fn(),
  start: jest.fn(),
  getPracticeQuestions: jest.fn(),
  submitPracticeAnswer: jest.fn(),
  startSubtest: jest.fn(),
  submitAnswer: jest.fn(),
  handleTimeout: jest.fn(),
  complete: jest.fn(),
  saveViolations: jest.fn(),
};

jest.mock("@/services/liaService", () => ({
  __esModule: true,
  get liaAssessmentApi() {
    return api;
  },
  SUBTEST_ORDER: ["pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation"],
}));

const Q = (id: string, subtest = "pattern_recognition") => ({
  id,
  subtest,
  item_number: 1,
  question_data: {},
  is_practice: false,
});

function makeCallbacks() {
  return {
    language: "es" as const,
    onLockdownBegin: jest.fn(),
    onLockdownEnd: jest.fn(),
    drainViolations: jest.fn().mockReturnValue([]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  api.checkAccess.mockResolvedValue({ has_access: true, has_completed: false });
  api.complete.mockResolvedValue({});
  api.saveViolations.mockResolvedValue({ saved: 0 });
});

describe("useLiaFlow", () => {
  it("lands on overview when access is granted, already-completed when done", async () => {
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));

    api.checkAccess.mockResolvedValue({ has_access: false, has_completed: true });
    const { result: r2 } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(r2.current.phase).toBe("already-completed"));
  });

  it("begin() starts the session, activates lockdown, and shows general instructions", async () => {
    const cb = makeCallbacks();
    api.start.mockResolvedValue({
      session_id: "s1",
      current_subtest: "pattern_recognition",
      practice_questions: [Q("p1")],
    });
    const { result } = renderHook(() => useLiaFlow(cb));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    expect(result.current.phase).toBe("general-instructions");
    expect(result.current.sessionId).toBe("s1");
    expect(cb.onLockdownBegin).toHaveBeenCalled();
    act(() => result.current.continueToIntro());
    expect(result.current.phase).toBe("subtest-intro");
    act(() => result.current.startPractice());
    expect(result.current.phase).toBe("practice");
  });

  it("startAssessment loads timed questions; mid-subtest answers advance the index", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: [Q("a1"), Q("a2")],
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    api.submitAnswer.mockResolvedValue({ subtest_complete: false, assessment_complete: false });
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    expect(result.current.phase).toBe("assessment");
    expect(result.current.timeLimitSeconds).toBe(180);
    await act(() => result.current.submitAssessmentAnswer("3"));
    expect(result.current.currentQuestionIndex).toBe(1);
  });

  it("subtest completion goes straight to the NEXT subtest's practice (intro skipped)", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: [Q("a1")],
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    api.submitAnswer.mockResolvedValue({
      subtest_complete: true,
      assessment_complete: false,
      next_subtest: "verbal_reasoning",
    });
    api.getPracticeQuestions.mockResolvedValue([Q("vp1", "verbal_reasoning")]);
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(() => result.current.submitAssessmentAnswer("3"));
    expect(result.current.phase).toBe("practice");
    expect(result.current.currentSubtest).toBe("verbal_reasoning");
    expect(result.current.practiceQuestions).toHaveLength(1);
  });

  it("final completion saves violations, completes, ends lockdown", async () => {
    const cb = makeCallbacks();
    cb.drainViolations.mockReturnValue([{ type: "tab_switch", timestamp: "t" }]);
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "visual_rotation", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "visual_rotation",
      questions: [Q("v1", "visual_rotation")],
      time_limit_seconds: 300,
      started_at: new Date().toISOString(),
    });
    api.submitAnswer.mockResolvedValue({ subtest_complete: true, assessment_complete: true });
    const { result } = renderHook(() => useLiaFlow(cb));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(() => result.current.submitAssessmentAnswer("2"));
    expect(api.saveViolations).toHaveBeenCalledWith("s1", [{ type: "tab_switch", timestamp: "t" }]);
    expect(api.complete).toHaveBeenCalledWith("s1");
    expect(cb.onLockdownEnd).toHaveBeenCalled();
    expect(result.current.phase).toBe("completed");
  });

  it("timeout marks remaining questions and advances", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: [Q("a1"), Q("a2"), Q("a3")],
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    api.handleTimeout.mockResolvedValue({
      subtest_complete: true,
      assessment_complete: false,
      next_subtest: "verbal_reasoning",
    });
    api.getPracticeQuestions.mockResolvedValue([]);
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(() => result.current.handleTimeout());
    expect(api.handleTimeout).toHaveBeenCalledWith("s1", {
      subtest: "pattern_recognition",
      unanswered_question_ids: ["a1", "a2", "a3"],
    });
    expect(result.current.phase).toBe("practice");
    expect(result.current.currentSubtest).toBe("verbal_reasoning");
  });
});
