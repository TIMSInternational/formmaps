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
    api.submitAnswer.mockResolvedValue({ subtest_complete: false, assessment_complete: false, items_completed: 1 });
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    expect(result.current.phase).toBe("assessment");
    expect(result.current.timeLimitSeconds).toBe(180);
    await act(() => result.current.submitAssessmentAnswer("3"));
    expect(result.current.currentQuestionIndex).toBe(1);
  });

  it("indexes from the server's items_completed, not a client i+1 (dedup-safe; prevents the 51/50 freeze)", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: Array.from({ length: 6 }, (_, i) => Q(`a${i + 1}`)),
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    // Server reports 5 distinct items completed (e.g. a duplicate was deduped
    // server-side); the client must follow the server, never drift past it.
    api.submitAnswer.mockResolvedValue({ subtest_complete: false, assessment_complete: false, items_completed: 5 });
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(() => result.current.submitAssessmentAnswer("3"));
    expect(result.current.currentQuestionIndex).toBe(5);
  });

  it("converges via timeout instead of freezing when the server wants more items than were served (short bank)", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: [Q("a1"), Q("a2")],
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    // Server reports 2 completed (== served length) yet not subtest_complete —
    // a short/misconfigured bank. The client must NOT index out of range.
    api.submitAnswer.mockResolvedValue({ subtest_complete: false, assessment_complete: false, items_completed: 2 });
    api.handleTimeout.mockResolvedValue({ subtest_complete: true, assessment_complete: false, next_subtest: "verbal_reasoning" });
    api.getPracticeQuestions.mockResolvedValue([]);
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(() => result.current.submitAssessmentAnswer("3"));
    expect(api.handleTimeout).toHaveBeenCalled();
  });

  it("ignores a concurrent duplicate submit for the same question (in-flight guard)", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.startSubtest.mockResolvedValue({
      session_id: "s1",
      subtest: "pattern_recognition",
      questions: [Q("a1"), Q("a2")],
      time_limit_seconds: 180,
      started_at: new Date().toISOString(),
    });
    let resolveSubmit: (v: unknown) => void = () => {};
    api.submitAnswer.mockImplementation(() => new Promise((r) => { resolveSubmit = r; }));
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    await act(() => result.current.startAssessment());
    await act(async () => {
      // Two rapid taps before the first request resolves.
      void result.current.submitAssessmentAnswer("1");
      void result.current.submitAssessmentAnswer("2");
      resolveSubmit({ subtest_complete: false, assessment_complete: false, items_completed: 1 });
    });
    expect(api.submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("returns an honest error (never the user's own answer) when a practice submit fails", async () => {
    api.start.mockResolvedValue({ session_id: "s1", current_subtest: "pattern_recognition", practice_questions: [] });
    api.submitPracticeAnswer.mockRejectedValue(new Error("not_in_practice"));
    const { result } = renderHook(() => useLiaFlow(makeCallbacks()));
    await waitFor(() => expect(result.current.phase).toBe("overview"));
    await act(() => result.current.begin());
    let res: { is_correct: boolean; correct_answer: string; practice_complete: boolean; error?: boolean } | undefined;
    await act(async () => {
      res = await result.current.submitPracticeAnswer("qX", "B");
    });
    expect(res?.correct_answer).toBe("");
    expect(res?.correct_answer).not.toBe("B");
    expect(res?.error).toBe(true);
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
