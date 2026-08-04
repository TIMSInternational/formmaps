"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyCoursePlan,
  getStudentCoursePlan,
  getMyCourseRecommendations,
  addCourseToPlan,
  removeCourseFromPlan,
  counselorAddCourseToPlan,
  counselorRemoveCourseFromPlan,
  submitChangeRequest,
  getMyChangeRequests,
  cancelChangeRequest,
  getStudentChangeRequests,
  reviewChangeRequest,
  schoolAdminAddCourseToPlan,
  schoolAdminRemoveCourseFromPlan,
  getSchoolAdminStudentChangeRequests,
  reviewSchoolAdminStudentChangeRequest,
} from "@/services/coursePlanService";
import type {
  CourseChangeRequest,
  CourseChangeRequestPayload,
  CourseChangeRequestsResponse,
  ChangeRequestReviewPayload,
} from "@/types/coursePlan";
import { toast } from "sonner";
import {
  optimisticId,
  patchBy,
  patchEnvelope,
  removeBy,
  upsertBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ── formmaps#89: optimistic course-plan writes ──────────────────────────────────
//
// Six of the ten mutations here update the cache before the server answers. The other
// four deliberately do not, and the reasons are recorded at each one rather than left
// for the next reader to rediscover:
//
//   useCounselorAddCourse / useCounselorRemoveCourse
//       The counselor read endpoint returns a shape the UI cannot read (see
//       useStudentCoursePlan below), so there is no correct cache to patch yet.
//   useSchoolAdminAddCourse / useSchoolAdminRemoveCourse
//       The endpoints they call do not exist in either backend — these writes 404
//       every time. Showing the row first would turn a visible failure into a row
//       that appears and vanishes.
//
// The general rules live in useOptimisticCache.ts.

export const coursePlanKeys = {
  all: ["course-plan"] as const,
  myPlan: () => [...coursePlanKeys.all, "my-plan"] as const,
  studentPlan: (studentId: string) =>
    [...coursePlanKeys.all, "student", studentId] as const,
  recommendations: () => [...coursePlanKeys.all, "recommendations"] as const,
  myRequests: (status?: string) =>
    [...coursePlanKeys.all, "my-requests", status ?? "all"] as const,
  /** Every cached status filter of my change requests. */
  myRequestsAll: () => [...coursePlanKeys.all, "my-requests"] as const,
  studentRequests: (studentId: string, status?: string) =>
    [...coursePlanKeys.all, "student-requests", studentId, status ?? "all"] as const,
  studentRequestsAll: (studentId: string) =>
    [...coursePlanKeys.all, "student-requests", studentId] as const,
  adminStudentRequests: (studentId: string, status?: string) =>
    [...coursePlanKeys.all, "admin-student-requests", studentId, status ?? "all"] as const,
  adminStudentRequestsAll: (studentId: string) =>
    [...coursePlanKeys.all, "admin-student-requests", studentId] as const,
};

/**
 * The status filter a change-request key was built with — `"all"` for the unfiltered
 * list. These keys end in a bare string, not the params object `keyParams` reads.
 */
const keyStatus = (key: readonly unknown[]): string => {
  const last = key[key.length - 1];
  return typeof last === "string" ? last : "all";
};

/** The raw plan row the student endpoint returns — bare, with names resolved from the catalog. */
interface RawPlanRow {
  id: string;
  courseId: string;
  term?: string | null;
  status: string;
}
interface RawMyPlan {
  plan?: { enrollments?: RawPlanRow[] } & Record<string, unknown>;
  [k: string]: unknown;
}

// Student-facing: get my course plan
export function useMyCoursePlan() {
  return useQuery({
    queryKey: coursePlanKeys.myPlan(),
    queryFn: getMyCoursePlan,
    staleTime: 5 * 60 * 1000,
  });
}

// Counselor- or school-admin-facing: get a specific student's course plan.
//
// NOTE: the two roles hit different endpoints that return DIFFERENT shapes. The
// school-admin one matches StudentCoursePlanResponse; the counselor one
// (/counselor/me/students/:id/course-sequence) returns a bare { data, total }
// envelope, so `planData?.plan` is undefined and the counselor's course-plan tab
// renders an empty sequence. Tracked separately — do not paper over it with an
// optimistic update.
export function useStudentCoursePlan(studentId?: string) {
  return useQuery({
    queryKey: coursePlanKeys.studentPlan(studentId ?? ""),
    queryFn: () => getStudentCoursePlan(studentId!),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

// Student-facing: get AI course recommendations
export function useMyCourseRecommendations() {
  return useQuery({
    queryKey: coursePlanKeys.recommendations(),
    queryFn: getMyCourseRecommendations,
    staleTime: 10 * 60 * 1000,
  });
}

// Add course to plan (student - direct)
export function useAddCourseToPlan() {
  const optimistic = useOptimisticCache();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: { courseId: string; gradeLevel: number; semester: string }) =>
      addCourseToPlan(payload),

    // Everything the row needs is already on the client: the endpoint stores exactly
    // courseId + term + status="planned", and the page resolves the course name from
    // the catalog it has already loaded.
    onMutate: (payload) =>
      optimistic.patch<RawMyPlan>({ queryKey: coursePlanKeys.myPlan() }, (current) => {
        const rows = current.plan?.enrollments;
        if (!rows) return undefined;
        const pending: RawPlanRow = {
          id: optimisticId(),
          courseId: payload.courseId,
          term: payload.semester,
          status: "planned",
        };
        return { ...current, plan: { ...current.plan, enrollments: [...rows, pending] } };
      }),

    // The POST answers with no body, so the real row's id is unknown and a refetch is
    // still required to learn it. What the optimistic insert buys is that the course
    // appears in "My Classes" at once instead of after two sequential round trips.
    //
    // Narrowed from `coursePlanKeys.all` to just this plan: `all` also dropped the
    // recommendations and change-request caches. Recommendations are scored from
    // `courseEnrollment`, a different table this write does not touch, and a plan
    // change cannot alter the student's own change requests.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.myPlan() });
    },

    onSuccess: () => toast.success("Course added to plan"),
    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

// Remove course from plan (student - direct).
// Takes a COURSE id, not an enrollment id — the endpoint deletes the caller's planned
// rows for that course.
export function useRemoveCourseFromPlan() {
  const optimistic = useOptimisticCache();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (courseId: string) => removeCourseFromPlan(courseId),

    // Mirrors the server's delete predicate exactly (courseId + status "planned"), so
    // the optimistic result and the refetched result agree. Widening it here — say, to
    // every row for the course — would briefly hide a completed enrollment the server
    // keeps.
    onMutate: (courseId) =>
      optimistic.patch<RawMyPlan>({ queryKey: coursePlanKeys.myPlan() }, (current) => {
        const rows = current.plan?.enrollments;
        if (!rows) return undefined;
        return {
          ...current,
          plan: {
            ...current.plan,
            enrollments: removeBy(rows, (r) => r.courseId === courseId && r.status === "planned"),
          },
        };
      }),

    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.myPlan() });
    },

    onSuccess: () => toast.success("Course removed from plan"),
    onError: (err: Error, _courseId, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

// ─── Counselor direct edit hooks ─────────────────────────────────────────────

// Left pessimistic on purpose. The counselor course-plan read returns a { data, total }
// envelope while the UI reads `planData.plan.enrollments`, so there is no cache entry
// in the shape an optimistic insert would have to produce. Fix the read shape first;
// patching the broken one would just be a second thing to unpick.
export function useCounselorAddCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; gradeLevel: number; semester: string }) =>
      counselorAddCourseToPlan(studentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course added to student's plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCounselorRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) =>
      counselorRemoveCourseFromPlan(studentId, enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course removed from student's plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Student change request hooks ────────────────────────────────────────────

export function useMyChangeRequests(status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.myRequests(status),
    queryFn: () => getMyChangeRequests({ status, limit: 50 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitChangeRequest() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: CourseChangeRequestPayload) => submitChangeRequest(payload),

    onMutate: async (payload) => {
      const pendingId = optimisticId();
      const pending: CourseChangeRequest = {
        id: pendingId,
        studentId: "",
        courseId: payload.courseId,
        courseCode: payload.courseCode,
        courseName: payload.courseName,
        credits: payload.credits,
        gradeLevel: payload.gradeLevel,
        semester: payload.semester,
        action: payload.action,
        status: "pending",
        studentNote: payload.studentNote,
        createdDate: new Date().toISOString(),
      };

      const context = await optimistic.patch<CourseChangeRequestsResponse>(
        { queryKey: coursePlanKeys.myRequestsAll() },
        (current, key) => {
          // A brand new request is always pending, so it belongs in the unfiltered
          // list and in a list filtered to "pending" — not in "approved"/"rejected".
          const status = keyStatus(key);
          if (status !== "all" && status !== "pending") return undefined;
          return patchEnvelope(current, (rows) => [pending, ...rows]);
        },
      );
      return { ...context, pendingId };
    },

    // The POST returns the created request, so it substitutes the placeholder and no
    // refetch is needed.
    onSuccess: (request, _payload, context) => {
      optimistic.replace<CourseChangeRequestsResponse>(
        { queryKey: coursePlanKeys.myRequestsAll() },
        (current) => ({
          ...current,
          data: upsertBy(current.data, (r) => r.id === context?.pendingId, request),
        }),
      );
      toast.success("Change request submitted — awaiting counselor approval");
    },

    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useCancelChangeRequest() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (requestId: string) => cancelChangeRequest(requestId),

    // Cancelling sets isActive: false, and every read filters on isActive — so the row
    // leaves the list entirely rather than changing status to "cancelled".
    onMutate: (requestId) =>
      optimistic.patch<CourseChangeRequestsResponse>(
        { queryKey: coursePlanKeys.myRequestsAll() },
        (current) => patchEnvelope(current, (rows) => removeBy(rows, (r) => r.id === requestId)),
      ),

    onSuccess: () => toast.success("Change request cancelled"),

    // Worth the rollback: the endpoint refuses with 400 "Cannot cancel" for anything
    // no longer pending, and a request a counselor approved a moment ago still shows a
    // Cancel button until the list refreshes.
    onError: (err: Error, _requestId, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

// ─── Counselor change request review hooks ───────────────────────────────────

export function useStudentChangeRequests(studentId: string, status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.studentRequests(studentId, status),
    queryFn: () => getStudentChangeRequests(studentId, { status, limit: 50 }),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Approving or rejecting moves a request out of "pending". Both review hooks share
 * this: drop the row from any list filtered to a status it no longer has, and update
 * it in place everywhere else.
 */
function reviewedRequestPatch(requestId: string, status: "approved" | "rejected") {
  return (current: CourseChangeRequestsResponse, key: readonly unknown[]) => {
    const filter = keyStatus(key);
    if (filter !== "all" && filter !== status) {
      // The row is leaving this filtered list — the counselor's queue is filtered to
      // "pending", so this is the branch that actually runs in the UI today.
      return patchEnvelope(current, (rows) => removeBy(rows, (r) => r.id === requestId));
    }
    return patchEnvelope(current, (rows) =>
      patchBy(rows, (r) => r.id === requestId, (r) => ({ ...r, status })),
    );
  };
}

export function useReviewChangeRequest(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: ChangeRequestReviewPayload;
    }) => reviewChangeRequest(studentId, requestId, payload),

    onMutate: ({ requestId, payload }) =>
      optimistic.patch<CourseChangeRequestsResponse>(
        { queryKey: coursePlanKeys.studentRequestsAll(studentId) },
        reviewedRequestPatch(requestId, payload.status),
      ),

    onSuccess: (_data, vars) => {
      // An APPROVED request changes the student's actual plan server-side, which the
      // client cannot derive — so the plan still has to be refetched. The rejected
      // case touches nothing but the request row, which is already correct.
      if (vars.payload.status === "approved") {
        qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      }
      // A cross-student aggregate; not worth reconstructing by hand.
      qc.invalidateQueries({ queryKey: ["counselor", "dashboard-change-requests"] });
      toast.success(vars.payload.status === "approved" ? "Request approved" : "Request rejected");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

// ── School Admin hooks ──────────────────────────────────────────────────────

// Left pessimistic on purpose: POST /school-admin/students/:id/course-plan/courses
// does not exist in either backend, so this 404s every time it is clicked. An
// optimistic insert would show the course landing in the plan before the failure.
export function useSchoolAdminAddCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; courseCode: string; courseName: string; credits: number; gradeLevel: number; semester: string }) =>
      schoolAdminAddCourseToPlan(studentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course added to plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// Same as above — the DELETE route does not exist either.
export function useSchoolAdminRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => schoolAdminRemoveCourseFromPlan(studentId, enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course removed from plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSchoolAdminStudentChangeRequests(studentId: string, status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.adminStudentRequests(studentId, status),
    queryFn: () => getSchoolAdminStudentChangeRequests(studentId, { status }),
    enabled: !!studentId,
  });
}

export function useSchoolAdminReviewChangeRequest(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: ChangeRequestReviewPayload }) =>
      reviewSchoolAdminStudentChangeRequest(studentId, requestId, payload),

    onMutate: ({ requestId, payload }) =>
      optimistic.patch<CourseChangeRequestsResponse>(
        { queryKey: coursePlanKeys.adminStudentRequestsAll(studentId) },
        reviewedRequestPatch(requestId, payload.status),
      ),

    onSuccess: (_data, vars) => {
      if (vars.payload.status === "approved") {
        qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      }
      toast.success(vars.payload.status === "approved" ? "Request approved" : "Request rejected");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}
