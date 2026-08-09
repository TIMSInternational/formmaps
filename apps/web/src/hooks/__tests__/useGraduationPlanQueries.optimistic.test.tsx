/**
 * useGraduationPlanQueries.optimistic.test.tsx — formmaps#89.
 *
 * Four of the file's six mutations are optimistic. What is pinned here:
 *
 *  - the target: the goal card leaves its "suggested" state at once, including from
 *    NOTHING (the common path — a student picks a first goal), and without ever
 *    pairing the previously cached university NAME with a new university id
 *  - submit and discard, the two writes behind the draft strip's buttons
 *  - the counselor's review, where the card is rendered only while the plan is
 *    "proposed", so the status patch is what closes it
 *  - the two GENERATORS, which must stay pessimistic: a generated plan is computed
 *    server-side from the school's ruleset, its catalog and the student's assessments
 *  - and every rollback, each against a failing server
 *
 * Every cache entry here is seeded by running the file's real query hook against a
 * mocked service and then unmounting it, rather than by poking `setQueryData`. Two
 * reasons: it registers the entry exactly the way the app does (a query seeded with a
 * value React Query never handed out can pass a test the app would fail), and leaving
 * it INACTIVE means the `onSettled` invalidation cannot refetch it — so a rollback
 * assertion is proving the rollback, not a refetch that happens to restore the same row.
 */
import React from "react";
import { render, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useGraduationTarget,
  useMyGraduationPlan,
  useStudentGraduationPlan,
  useSetGraduationTarget,
  useGenerateGraduationPlan,
  useSubmitGraduationPlan,
  useDiscardGraduationDraft,
  useCounselorGeneratePlan,
  useReviewGraduationPlan,
  graduationPlanKeys,
} from "../useGraduationPlanQueries";
import { coursePlanKeys } from "../useCoursePlanQueries";
import {
  getGraduationTarget,
  setGraduationTarget,
  generateGraduationPlan,
  getMyGraduationPlan,
  submitGraduationPlan,
  discardGraduationDraft,
  getStudentGraduationPlan,
  counselorGenerateGraduationPlan,
  reviewGraduationPlan,
} from "@/services/graduationPlanService";
import type {
  GraduationPlan,
  GraduationTarget,
  StudentGraduationPlanResponse,
} from "@/types/graduationPlan";

jest.mock("@/services/graduationPlanService", () => ({
  getGraduationTarget: jest.fn(),
  setGraduationTarget: jest.fn(),
  generateGraduationPlan: jest.fn(),
  getMyGraduationPlan: jest.fn(),
  submitGraduationPlan: jest.fn(),
  discardGraduationDraft: jest.fn(),
  getSupplementalCourses: jest.fn(),
  getStudentGraduationPlan: jest.fn(),
  counselorGenerateGraduationPlan: jest.fn(),
  reviewGraduationPlan: jest.fn(),
  getChildCoursePlan: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const mockGetTarget = getGraduationTarget as jest.Mock;
const mockSetTarget = setGraduationTarget as jest.Mock;
const mockGenerate = generateGraduationPlan as jest.Mock;
const mockGetMyPlan = getMyGraduationPlan as jest.Mock;
const mockSubmit = submitGraduationPlan as jest.Mock;
const mockDiscard = discardGraduationDraft as jest.Mock;
const mockGetStudentPlan = getStudentGraduationPlan as jest.Mock;
const mockCounselorGenerate = counselorGenerateGraduationPlan as jest.Mock;
const mockReview = reviewGraduationPlan as jest.Mock;

const STUDENT = "stu-1";
const TARGET_KEY = graduationPlanKeys.target();
const MY_PLAN_KEY = graduationPlanKeys.myPlan();
const STUDENT_PLAN_KEY = graduationPlanKeys.studentPlan(STUDENT);

const target = (over: Partial<GraduationTarget> = {}): GraduationTarget => ({
  id: "t-1",
  universityId: "u-1",
  universityName: "MIT",
  major: "Computer Science",
  fieldKey: "stem",
  selectivityTier: "reach",
  templateKey: "stem-core",
  templateLabel: "STEM Core",
  suggested: true,
  ...over,
});

const plan = (over: Partial<GraduationPlan> = {}): GraduationPlan => ({
  id: "p-1",
  status: "draft",
  templateKey: "stem-core",
  templateLabel: "STEM Core",
  gapReport: [],
  warnings: [],
  rationale: "Chosen for a CS applicant",
  totalPlannedCredits: 24,
  submittedAt: null,
  reviewNote: null,
  items: [
    {
      courseId: "c-1",
      courseCode: "MATH101",
      courseName: "Algebra",
      credits: 3,
      gradeLevel: 11,
      term: "Fall",
      category: "Math",
      reason: null,
      source: "required",
      sortOrder: 1,
    },
  ],
  ...over,
});

const studentPlan = (over: Partial<GraduationPlan> = {}): StudentGraduationPlanResponse => ({
  plan: plan({ status: "proposed", ...over }),
  target: { universityName: "MIT", major: "Computer Science", templateKey: "stem-core" },
});

/**
 * What to seed. `undefined` means "this query was never run", which is a different
 * state from a query that resolved to `null` — the hooks treat them differently and so
 * do these tests.
 */
interface Seed {
  target?: GraduationTarget | null;
  myPlan?: GraduationPlan | null;
  studentPlan?: StudentGraduationPlanResponse;
}

const TargetProbe = () => { useGraduationTarget(); return null; };
const MyPlanProbe = () => { useMyGraduationPlan(); return null; };
const StudentPlanProbe = () => { useStudentGraduationPlan(STUDENT); return null; };

/**
 * Run the real queries for whatever `seed` names, wait for their data to land, then
 * unmount them — see the file header for why both halves matter.
 */
async function harness(seed: Seed = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  if ("target" in seed) mockGetTarget.mockResolvedValue(seed.target);
  if ("myPlan" in seed) mockGetMyPlan.mockResolvedValue(seed.myPlan);
  if ("studentPlan" in seed) mockGetStudentPlan.mockResolvedValue(seed.studentPlan);

  const probe = render(
    <>
      {"target" in seed && <TargetProbe />}
      {"myPlan" in seed && <MyPlanProbe />}
      {"studentPlan" in seed && <StudentPlanProbe />}
    </>,
    { wrapper },
  );

  await waitFor(() => {
    if ("target" in seed) expect(qc.getQueryState(TARGET_KEY)?.status).toBe("success");
    if ("myPlan" in seed) expect(qc.getQueryState(MY_PLAN_KEY)?.status).toBe("success");
    if ("studentPlan" in seed)
      expect(qc.getQueryState(STUDENT_PLAN_KEY)?.status).toBe("success");
  });
  probe.unmount();

  return { qc, wrapper };
}

const cachedTarget = (qc: QueryClient) => qc.getQueryData<GraduationTarget | null>(TARGET_KEY);
const cachedPlan = (qc: QueryClient) => qc.getQueryData<GraduationPlan | null>(MY_PLAN_KEY);
const cachedStudentPlan = (qc: QueryClient) =>
  qc.getQueryData<StudentGraduationPlanResponse>(STUDENT_PLAN_KEY);

beforeEach(() => jest.clearAllMocks());

describe("#89 the graduation goal changes before the server answers", () => {
  it("leaves the suggested state immediately", async () => {
    const { qc, wrapper } = await harness({ target: target({ suggested: true }) });
    // A request that never settles: if the card only updated on success, nothing at all
    // would change here.
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-1", major: "Physics" }); });

    await waitFor(() => expect(cachedTarget(qc)?.suggested).toBe(false));
    expect(cachedTarget(qc)?.major).toBe("Physics");
  });

  it("shows a first goal set from nothing at all", async () => {
    // The main path: a student with no target picks one out of the picker. The entry
    // exists — the query resolved to null — so patching it is not inventing anything.
    const { qc, wrapper } = await harness({ target: null });
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityName: "Reed College", major: "Biology" }); });

    await waitFor(() =>
      expect(cachedTarget(qc)).toMatchObject({
        universityName: "Reed College",
        universityId: null,
        major: "Biology",
        suggested: false,
      }),
    );
  });

  it("does not pair the old university's NAME with the new university's id", async () => {
    // The side panel passes an id and no name. Carrying "MIT" across onto u-2 would
    // render one school's name against another's id for the length of the request.
    const { qc, wrapper } = await harness({
      target: target({ universityId: "u-1", universityName: "MIT", suggested: false }),
    });
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-2", major: "Computer Science" }); });

    await waitFor(() => expect(cachedTarget(qc)?.universityId).toBe("u-2"));
    expect(cachedTarget(qc)?.universityName).toBeNull();
  });

  it("keeps the name when the SAME university is re-saved with a different major", async () => {
    // Negative control for the test above: dropping the name unconditionally would be
    // just as wrong, blanking a name that is still correct.
    const { qc, wrapper } = await harness({
      target: target({ universityId: "u-1", universityName: "MIT", suggested: false }),
    });
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-1", major: "Physics" }); });

    await waitFor(() => expect(cachedTarget(qc)?.major).toBe("Physics"));
    expect(cachedTarget(qc)?.universityName).toBe("MIT");
  });

  it("does not guess the server-derived template", async () => {
    // templateKey/templateLabel/selectivityTier come off the major and the school's
    // selectivity tier. The label is rendered as the name of the student's path, so a
    // confident wrong one is worse than one that is 200ms late.
    const { qc, wrapper } = await harness({ target: target() });
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-2", major: "Art History" }); });

    await waitFor(() => expect(cachedTarget(qc)?.major).toBe("Art History"));
    expect(cachedTarget(qc)).toMatchObject({
      templateKey: "stem-core",
      templateLabel: "STEM Core",
      selectivityTier: "reach",
      fieldKey: "stem",
    });
  });

  it("restores the exact previous target when the save fails", async () => {
    const { qc, wrapper } = await harness({ target: target() });
    const before = cachedTarget(qc);
    mockSetTarget.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-2", major: "Physics" }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedTarget(qc)).toEqual(before);
  });

  it("reconciles the target and the supplemental rail scored against it", async () => {
    const { qc, wrapper } = await harness({ target: target() });
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockSetTarget.mockResolvedValue(target({ suggested: false, major: "Physics" }));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-1", major: "Physics" }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graduationPlanKeys.target() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graduationPlanKeys.supplemental() });
  });

  it("does not touch the cached plan, which a goal change does not alter on its own", async () => {
    const { qc, wrapper } = await harness({ target: target(), myPlan: plan() });
    const beforePlan = cachedPlan(qc);
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-2", major: "Physics" }); });

    await waitFor(() => expect(cachedTarget(qc)?.major).toBe("Physics"));
    expect(cachedPlan(qc)).toBe(beforePlan);
  });

  it("does not invent a target when the query has never run", async () => {
    // Writing one into an empty cache would flash a goal card that then jumps as soon
    // as the real fetch lands.
    const { qc, wrapper } = await harness();
    mockSetTarget.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSetGraduationTarget(), { wrapper });

    act(() => { result.current.mutate({ universityId: "u-2", major: "Physics" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(TARGET_KEY)).toBeUndefined();
  });
});

describe("#89 submitting a draft", () => {
  it("flips the strip to Submitted without waiting", async () => {
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    mockSubmit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubmitGraduationPlan(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(cachedPlan(qc)?.status).toBe("proposed"));
    // The items are the same draft, untouched — only the status moved.
    expect(cachedPlan(qc)?.items).toHaveLength(1);
    expect(cachedPlan(qc)?.submittedAt).toBeNull();
  });

  it("goes back to a draft when the submit fails", async () => {
    // NO_DRAFT and PLAN_PROPOSED are both real answers here, so this path runs.
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    const before = cachedPlan(qc);
    mockSubmit.mockRejectedValue(
      Object.assign(new Error("no draft"), { data: { code: "NO_DRAFT" } }),
    );
    const { result } = renderHook(() => useSubmitGraduationPlan(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedPlan(qc)).toEqual(before);
    expect(cachedPlan(qc)?.status).toBe("draft");
  });

  it("reconciles the plan the server stamped", async () => {
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockSubmit.mockResolvedValue(plan({ status: "proposed" }));
    const { result } = renderHook(() => useSubmitGraduationPlan(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graduationPlanKeys.myPlan() });
  });

  it("does not invent a plan to submit when none is cached", async () => {
    const { qc, wrapper } = await harness({ myPlan: null });
    mockSubmit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubmitGraduationPlan(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(cachedPlan(qc)).toBeNull();
  });
});

describe("#89 discarding a draft", () => {
  it("takes the draft section away on the click", async () => {
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    mockDiscard.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDiscardGraduationDraft(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(cachedPlan(qc)).toBeNull());
  });

  it("puts the draft BACK when the discard fails", async () => {
    // The nastiest one to get wrong: the student watches a generated plan vanish, the
    // delete fails, and without the rollback it stays gone until a manual reload —
    // which reads as data loss.
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    const before = cachedPlan(qc);
    mockDiscard.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useDiscardGraduationDraft(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedPlan(qc)).toEqual(before);
    expect(cachedPlan(qc)?.items).toHaveLength(1);
  });

  it("still reconciles, because discarding one draft can uncover an earlier plan", async () => {
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockDiscard.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDiscardGraduationDraft(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graduationPlanKeys.myPlan() });
  });

  it("writes nothing when the plan query has never run", async () => {
    const { qc, wrapper } = await harness();
    mockDiscard.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDiscardGraduationDraft(), { wrapper });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    // Not null — a null here would register an entry saying "this student has no plan",
    // which the page would render as fact.
    expect(qc.getQueryData(MY_PLAN_KEY)).toBeUndefined();
  });
});

describe("#89 the counselor's review closes the card on the click", () => {
  it("approves immediately", async () => {
    const { qc, wrapper } = await harness({ studentPlan: studentPlan() });
    mockReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "approved" }); });

    // The card renders only while the plan is "proposed", so this is what closes it.
    await waitFor(() => expect(cachedStudentPlan(qc)?.plan?.status).toBe("approved"));
    expect(cachedStudentPlan(qc)?.plan?.items).toHaveLength(1);
  });

  it("shows the rejection note the counselor just typed", async () => {
    const { qc, wrapper } = await harness({ studentPlan: studentPlan() });
    mockReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "rejected", note: "Too many honors" }); });

    await waitFor(() => expect(cachedStudentPlan(qc)?.plan?.status).toBe("rejected"));
    expect(cachedStudentPlan(qc)?.plan?.reviewNote).toBe("Too many honors");
  });

  it("clears the note when approving without one, exactly as the server does", async () => {
    // Mirrors `reviewPlan`'s approve path, which writes
    // `reviewNote: (note || "").slice(0, 1000) || null` — an approval with no note
    // NULLS the field. Carrying a previous note across would put text on screen that
    // the reconcile then takes away.
    //
    // The seeded state is defensive rather than observed: a plan only reaches
    // "proposed" as a freshly generated row (`generateDraftPlan` supersedes the old
    // row and creates a new one with a null note), so a proposed plan carrying a note
    // is not a state today's server can produce. Pinned anyway, because the cost of
    // mirroring is nil and the cost of drifting is a phantom note.
    const { qc, wrapper } = await harness({
      studentPlan: studentPlan({ reviewNote: "Fix the science sequence" }),
    });
    mockReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "approved" }); });

    await waitFor(() => expect(cachedStudentPlan(qc)?.plan?.status).toBe("approved"));
    expect(cachedStudentPlan(qc)?.plan?.reviewNote).toBeNull();
  });

  it("restores the proposed plan when the review fails", async () => {
    const { qc, wrapper } = await harness({ studentPlan: studentPlan() });
    const before = cachedStudentPlan(qc);
    mockReview.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "approved" }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedStudentPlan(qc)).toEqual(before);
    expect(cachedStudentPlan(qc)?.plan?.status).toBe("proposed");
  });

  it("refetches the graduation plan AND the course plan an approval materializes", async () => {
    const { qc, wrapper } = await harness({ studentPlan: studentPlan() });
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockReview.mockResolvedValue(plan({ status: "approved" }));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "approved" }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graduationPlanKeys.studentPlan(STUDENT) });
    // A different hook's key: approval writes the plan's current-grade rows into the
    // official course plan, which the counselor's tab reads from `coursePlanKeys`.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: coursePlanKeys.studentPlan(STUDENT) });
  });

  it("does not review a student whose plan is not cached", async () => {
    const { qc, wrapper } = await harness();
    mockReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReviewGraduationPlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ status: "approved" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(STUDENT_PLAN_KEY)).toBeUndefined();
  });
});

describe("#89 a generated plan is never faked", () => {
  it("shows no draft while the student's generation is in flight", async () => {
    // The server walks the school's ruleset, its catalog and the student's assessment
    // results to pick and order courses. Nothing here can predict that, and the same
    // call can answer `locked` rather than a plan at all.
    const { qc, wrapper } = await harness({ myPlan: null });
    mockGenerate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGenerateGraduationPlan(), { wrapper });

    act(() => { result.current.mutate(undefined); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(cachedPlan(qc)).toBeNull();
  });

  it("does not blank an existing draft while regenerating either", async () => {
    const { qc, wrapper } = await harness({ myPlan: plan({ status: "draft" }) });
    const before = cachedPlan(qc);
    mockGenerate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGenerateGraduationPlan(), { wrapper });

    act(() => { result.current.mutate({ force: true }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(cachedPlan(qc)).toBe(before);
  });

  it("keeps the counselor's generation pessimistic too", async () => {
    const { qc, wrapper } = await harness({ studentPlan: studentPlan() });
    const before = cachedStudentPlan(qc);
    mockCounselorGenerate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCounselorGeneratePlan(STUDENT), { wrapper });

    act(() => { result.current.mutate({ force: true }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(cachedStudentPlan(qc)).toBe(before);
  });
});
