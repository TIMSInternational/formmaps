/**
 * useCoursePlanQueries.optimistic.test.tsx — formmaps#89.
 *
 * Six of this file's ten mutations became optimistic. What is pinned here:
 *
 *  - the student's plan add/remove, including that remove mirrors the SERVER's delete
 *    predicate (courseId AND status "planned") rather than a looser guess, so the
 *    optimistic result and the refetched result cannot disagree
 *  - change-request submit/cancel, and the status-filter routing that decides which
 *    cached lists a new request belongs in
 *  - review (approve/reject), where the row LEAVES a list filtered to "pending" rather
 *    than sitting there with the wrong badge
 *  - the narrowed invalidation: adding a course must not blow away the recommendations
 *    cache, which is scored from a different table entirely
 *  - and every rollback, each against a failing server
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAddCourseToPlan,
  useRemoveCourseFromPlan,
  useSubmitChangeRequest,
  useCancelChangeRequest,
  useReviewChangeRequest,
  useSchoolAdminReviewChangeRequest,
  coursePlanKeys,
} from "../useCoursePlanQueries";
import {
  addCourseToPlan,
  removeCourseFromPlan,
  submitChangeRequest,
  cancelChangeRequest,
  reviewChangeRequest,
  reviewSchoolAdminStudentChangeRequest,
} from "@/services/coursePlanService";
import type { CourseChangeRequest, CourseChangeRequestsResponse } from "@/types/coursePlan";

jest.mock("@/services/coursePlanService", () => ({
  getMyCoursePlan: jest.fn(),
  getStudentCoursePlan: jest.fn(),
  getMyCourseRecommendations: jest.fn(),
  addCourseToPlan: jest.fn(),
  removeCourseFromPlan: jest.fn(),
  counselorAddCourseToPlan: jest.fn(),
  counselorRemoveCourseFromPlan: jest.fn(),
  submitChangeRequest: jest.fn(),
  getMyChangeRequests: jest.fn(),
  cancelChangeRequest: jest.fn(),
  getStudentChangeRequests: jest.fn(),
  reviewChangeRequest: jest.fn(),
  schoolAdminAddCourseToPlan: jest.fn(),
  schoolAdminRemoveCourseFromPlan: jest.fn(),
  getSchoolAdminStudentChangeRequests: jest.fn(),
  reviewSchoolAdminStudentChangeRequest: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockAdd = addCourseToPlan as jest.Mock;
const mockRemove = removeCourseFromPlan as jest.Mock;
const mockSubmit = submitChangeRequest as jest.Mock;
const mockCancel = cancelChangeRequest as jest.Mock;
const mockReview = reviewChangeRequest as jest.Mock;
const mockAdminReview = reviewSchoolAdminStudentChangeRequest as jest.Mock;

const STUDENT = "stu-1";

type PlanRow = { id: string; courseId: string; term: string | null; status: string };
const myPlan = (enrollments: PlanRow[]) => ({
  plan: { studentId: STUDENT, gradeLevel: 10, enrollments, totalCreditsEarned: 12 },
  recommendations: [],
});

const request = (id: string, over: Partial<CourseChangeRequest> = {}): CourseChangeRequest => ({
  id,
  studentId: STUDENT,
  courseId: `course-${id}`,
  courseCode: "MATH101",
  courseName: "Algebra",
  credits: 3,
  gradeLevel: 10,
  semester: "Fall",
  action: "add",
  status: "pending",
  createdDate: "2026-08-01T10:00:00.000Z",
  ...over,
});

const requests = (rows: CourseChangeRequest[]): CourseChangeRequestsResponse => ({
  data: rows,
  total: rows.length,
  page: 1,
  limit: 50,
  totalPages: 1,
});

function harness(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const planRows = (qc: QueryClient): PlanRow[] =>
  (qc.getQueryData(coursePlanKeys.myPlan()) as ReturnType<typeof myPlan> | undefined)?.plan
    .enrollments ?? [];

beforeEach(() => jest.clearAllMocks());

describe("#89 the student's plan changes before the server answers", () => {
  const seedPlan = (qc: QueryClient) =>
    qc.setQueryData(
      coursePlanKeys.myPlan(),
      myPlan([{ id: "e-1", courseId: "c-1", term: "Fall", status: "planned" }]),
    );

  it("shows an added course immediately", async () => {
    const { qc, wrapper } = harness(seedPlan);
    mockAdd.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAddCourseToPlan(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-2", gradeLevel: 10, semester: "Spring" }); });

    await waitFor(() => expect(planRows(qc)).toHaveLength(2));
    expect(planRows(qc)[1]).toMatchObject({ courseId: "c-2", term: "Spring", status: "planned" });
  });

  it("removes a planned course immediately", async () => {
    const { qc, wrapper } = harness(seedPlan);
    mockRemove.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRemoveCourseFromPlan(), { wrapper });

    act(() => { result.current.mutate("c-1"); });

    await waitFor(() => expect(planRows(qc)).toHaveLength(0));
  });

  it("does NOT remove a completed row for the same course", async () => {
    // The server deletes `{ courseId, status: "planned" }`. A looser optimistic filter
    // would briefly hide a completed enrollment the server is keeping, and the row
    // would pop back on the refetch.
    const { qc, wrapper } = harness((c) =>
      c.setQueryData(
        coursePlanKeys.myPlan(),
        myPlan([
          { id: "e-1", courseId: "c-1", term: "Fall", status: "planned" },
          { id: "e-2", courseId: "c-1", term: "Spring", status: "completed" },
        ]),
      ),
    );
    mockRemove.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRemoveCourseFromPlan(), { wrapper });

    act(() => { result.current.mutate("c-1"); });

    await waitFor(() => expect(planRows(qc)).toHaveLength(1));
    expect(planRows(qc)[0]).toMatchObject({ id: "e-2", status: "completed" });
  });

  it("restores the plan when an add fails", async () => {
    const { qc, wrapper } = harness(seedPlan);
    const before = qc.getQueryData(coursePlanKeys.myPlan());
    mockAdd.mockRejectedValue(new Error("No current academic year"));
    const { result } = renderHook(() => useAddCourseToPlan(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-2", gradeLevel: 10, semester: "Spring" }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(coursePlanKeys.myPlan())).toEqual(before);
  });

  it("puts the course BACK when a remove fails", async () => {
    const { qc, wrapper } = harness(seedPlan);
    mockRemove.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useRemoveCourseFromPlan(), { wrapper });

    act(() => { result.current.mutate("c-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(planRows(qc).map((r) => r.id)).toEqual(["e-1"]);
  });

  it("does not invent a plan when nothing is cached", async () => {
    const { qc, wrapper } = harness(() => {});
    mockAdd.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAddCourseToPlan(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-2", gradeLevel: 10, semester: "Fall" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(coursePlanKeys.myPlan())).toBeUndefined();
  });

  it("does not drop the recommendations cache when a course is added", async () => {
    // This used to invalidate `["course-plan"]` wholesale. Recommendations are scored
    // from `courseEnrollment` — a different table this write never touches — and
    // recomputing them means re-scoring the whole catalog for nothing.
    const { qc, wrapper } = harness((c) => {
      seedPlan(c);
      c.setQueryData(coursePlanKeys.recommendations(), { data: [{ id: "rec-1" }], locked: false });
      c.setQueryData(coursePlanKeys.myRequests(), requests([request("r-1")]));
    });
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockAdd.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAddCourseToPlan(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-2", gradeLevel: 10, semester: "Fall" }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: coursePlanKeys.myPlan() });
  });
});

describe("#89 change requests", () => {
  const seedRequests = (qc: QueryClient) =>
    qc.setQueryData(coursePlanKeys.myRequests(), requests([request("r-1")]));

  it("shows a submitted request immediately, at the top", async () => {
    const { qc, wrapper } = harness(seedRequests);
    mockSubmit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubmitChangeRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-9", courseCode: "BIO", courseName: "Biology",
        credits: 4, gradeLevel: 10, semester: "Fall", action: "add",
      });
    });

    await waitFor(() => {
      const rows = qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests())!.data;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ courseName: "Biology", status: "pending" });
    });
  });

  it("keeps a new request out of a list filtered to approved", async () => {
    const { qc, wrapper } = harness((c) => {
      seedRequests(c);
      c.setQueryData(coursePlanKeys.myRequests("approved"), requests([request("r-2", { status: "approved" })]));
    });
    mockSubmit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubmitChangeRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-9", courseCode: "BIO", courseName: "Biology",
        credits: 4, gradeLevel: 10, semester: "Fall", action: "add",
      });
    });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests())!.data).toHaveLength(2),
    );
    expect(
      qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests("approved"))!.data,
    ).toHaveLength(1);
  });

  it("DOES put a new request into a list filtered to pending", async () => {
    // Negative control for the test above: the filter check must be a match test, not
    // a blanket "skip anything filtered".
    const { qc, wrapper } = harness((c) =>
      c.setQueryData(coursePlanKeys.myRequests("pending"), requests([request("r-1")])),
    );
    mockSubmit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubmitChangeRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-9", courseCode: "BIO", courseName: "Biology",
        credits: 4, gradeLevel: 10, semester: "Fall", action: "add",
      });
    });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests("pending"))!.data).toHaveLength(2),
    );
  });

  it("substitutes the server request for the placeholder, with no refetch", async () => {
    const { qc, wrapper } = harness(seedRequests);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockSubmit.mockResolvedValue(request("server-r", { courseName: "Biology" }));
    const { result } = renderHook(() => useSubmitChangeRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-9", courseCode: "BIO", courseName: "Biology",
        credits: 4, gradeLevel: 10, semester: "Fall", action: "add",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const rows = qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests())!.data;
    expect(rows.map((r) => r.id)).toEqual(["server-r", "r-1"]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("removes a cancelled request immediately — cancel is a soft delete, not a status", async () => {
    const { qc, wrapper } = harness(seedRequests);
    mockCancel.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCancelChangeRequest(), { wrapper });

    act(() => { result.current.mutate("r-1"); });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests())!.data).toHaveLength(0),
    );
  });

  it("puts a request back when the cancel is refused", async () => {
    // The endpoint answers 400 "Cannot cancel" for anything no longer pending, and the
    // Cancel button stays visible until the list refreshes — so this really happens.
    const { qc, wrapper } = harness(seedRequests);
    mockCancel.mockRejectedValue(new Error("Cannot cancel"));
    const { result } = renderHook(() => useCancelChangeRequest(), { wrapper });

    act(() => { result.current.mutate("r-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const cached = qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.myRequests())!;
    expect(cached.data.map((r) => r.id)).toEqual(["r-1"]);
    expect(cached.total).toBe(1);
  });

  it("rolls back a failed submit", async () => {
    const { qc, wrapper } = harness(seedRequests);
    const before = qc.getQueryData(coursePlanKeys.myRequests());
    mockSubmit.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useSubmitChangeRequest(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-9", courseCode: "BIO", courseName: "Biology",
        credits: 4, gradeLevel: 10, semester: "Fall", action: "add",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(coursePlanKeys.myRequests())).toEqual(before);
  });
});

describe("#89 reviewing a request moves it out of the pending queue", () => {
  const pendingKey = coursePlanKeys.studentRequests(STUDENT, "pending");
  const allKey = coursePlanKeys.studentRequests(STUDENT);

  const seedReview = (qc: QueryClient) => {
    qc.setQueryData(pendingKey, requests([request("r-1"), request("r-2")]));
    qc.setQueryData(allKey, requests([request("r-1"), request("r-2")]));
  };

  it("drops an approved request from the pending-filtered list and restates it in the full list", async () => {
    const { qc, wrapper } = harness(seedReview);
    mockReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "approved" } }); });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(pendingKey)!.data.map((r) => r.id)).toEqual(["r-2"]),
    );
    const all = qc.getQueryData<CourseChangeRequestsResponse>(allKey)!.data;
    expect(all.find((r) => r.id === "r-1")!.status).toBe("approved");
    expect(all).toHaveLength(2);
  });

  it("refetches the plan on approve, because the server changes it", async () => {
    const { qc, wrapper } = harness(seedReview);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockReview.mockResolvedValue(request("r-1", { status: "approved" }));
    const { result } = renderHook(() => useReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "approved" } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: coursePlanKeys.studentPlan(STUDENT) });
  });

  it("does NOT refetch the plan on reject, which changes nothing but the request row", async () => {
    const { qc, wrapper } = harness(seedReview);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockReview.mockResolvedValue(request("r-1", { status: "rejected" }));
    const { result } = renderHook(() => useReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "rejected" } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: coursePlanKeys.studentPlan(STUDENT) });
    // The counselor's cross-student queue is still refreshed — it is an aggregate the
    // client cannot rebuild.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["counselor", "dashboard-change-requests"] });
  });

  it("restores the queue when the review fails", async () => {
    const { qc, wrapper } = harness(seedReview);
    const before = qc.getQueryData(pendingKey);
    mockReview.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "approved" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(pendingKey)).toEqual(before);
  });

  it("the school-admin review behaves the same on its own keys", async () => {
    const adminPending = coursePlanKeys.adminStudentRequests(STUDENT, "pending");
    const { qc, wrapper } = harness((c) =>
      c.setQueryData(adminPending, requests([request("r-1"), request("r-2")])),
    );
    mockAdminReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSchoolAdminReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "rejected" } }); });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(adminPending)!.data.map((r) => r.id)).toEqual(["r-2"]),
    );
  });

  it("the school-admin review does not touch the counselor's keys", async () => {
    // `adminStudentRequests` and `studentRequests` are siblings under the same root;
    // a filter aimed at the wrong prefix would silently patch both.
    const adminPending = coursePlanKeys.adminStudentRequests(STUDENT, "pending");
    const { qc, wrapper } = harness((c) => {
      c.setQueryData(adminPending, requests([request("r-1")]));
      c.setQueryData(coursePlanKeys.studentRequests(STUDENT, "pending"), requests([request("r-1")]));
    });
    mockAdminReview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSchoolAdminReviewChangeRequest(STUDENT), { wrapper });

    act(() => { result.current.mutate({ requestId: "r-1", payload: { status: "rejected" } }); });

    await waitFor(() =>
      expect(qc.getQueryData<CourseChangeRequestsResponse>(adminPending)!.data).toHaveLength(0),
    );
    expect(
      qc.getQueryData<CourseChangeRequestsResponse>(coursePlanKeys.studentRequests(STUDENT, "pending"))!.data,
    ).toHaveLength(1);
  });
});
