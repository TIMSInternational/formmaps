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
  StudentCourseEnrollment,
  StudentCoursePlanResponse,
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
// All ten mutations here update the cache before the server answers. Six landed with
// #89; the other four were blocked on defects underneath them:
//   - the counselor pair, by #95 — its read endpoint returned a shape the UI could not
//     parse, so there was no correctly-shaped cache entry to patch. Genuinely fixed and
//     deployed; nothing outstanding.
//   - the school-admin pair, by #94 — the endpoints did not exist in either backend, so
//     every one of those writes 404'd. FIXED IN SOURCE ONLY. As of 2026-08-08 the Node
//     routes exist on main but are NOT in the deployed image, and the .NET twin is
//     shipped dark with no rewrite, so both writes still 404 in production. See the
//     block above useSchoolAdminAddCourse for the full state and for why #111 kept
//     them optimistic regardless.
//
// Do not restate "#94 landed" as though it settled the question — an earlier version of
// this comment did exactly that, and the gap between "merged" and "deployed" is what
// #111 was filed to correct.
//
// The general rules live in useOptimisticCache.ts, including the concurrency caveat its
// header documents — the two add mutations here opt out of it deliberately, because
// SequenceBuilder's multi-select submit is precisely the overlapping-writes flow that
// caveat assumes the app does not have.

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
// The two roles still hit different endpoints, but as of #95 both return the same
// StudentCoursePlanResponse from the same reader. The counselor route used to answer
// with a bare { data, total } envelope, which left `planData.plan` undefined and the
// counselor's course-plan tab empty for every student.
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
//
// Optimistic since #95 made the counselor read return the same shape as the
// school-admin one; before that there was no correctly-shaped cache entry to patch.

/**
 * Insert a planned course into a cached StudentCoursePlanResponse.
 *
 * Everything the row needs is on the client already: the caller picked the course out
 * of a catalog it has loaded, and the server stores nothing but courseId + term +
 * status. `credits` and `category` are the exception — they come from the school's
 * course record, so they are left at their empty values rather than guessed, and the
 * reconcile fills them in. A wrong credit count would move the graduation-progress
 * bar, which is the one number on this screen people act on.
 *
 * `pendingId` is minted by the CALLER rather than here (formmaps#111) so that the
 * mutation's onError can undo this one row by id instead of restoring a whole-cache
 * snapshot. SequenceBuilder submits a multi-select add as N synchronous mutate() calls
 * against this single key, and snapshot rollback is not commutative under that: with
 * adds A then B, B snapshots a cache that already holds A's placeholder, so A failing
 * discards B's row and B failing RESTORES A's row for a write that failed — leaving a
 * course on screen nobody successfully added, carrying an optimistic id and a
 * real-looking Remove button. Undoing by id is order-independent: each add can only
 * ever remove itself.
 */
function insertPlannedCourse(
  current: StudentCoursePlanResponse,
  course: { courseId: string; gradeLevel: number; semester: string; courseCode?: string; courseName?: string; credits?: number },
  pendingId: string,
): StudentCoursePlanResponse | undefined {
  const rows = current.plan?.enrollments;
  if (!rows) return undefined;
  const pending: StudentCourseEnrollment = {
    id: pendingId,
    courseId: course.courseId,
    courseCode: course.courseCode ?? "",
    courseName: course.courseName ?? "",
    category: "",
    credits: course.credits ?? 0,
    gradeLevel: course.gradeLevel,
    semester: course.semester,
    status: "planned",
  };
  return { ...current, plan: { ...current.plan, enrollments: [...rows, pending] } };
}

function removeEnrollment(
  current: StudentCoursePlanResponse,
  enrollmentId: string,
): StudentCoursePlanResponse | undefined {
  const rows = current.plan?.enrollments;
  if (!rows) return undefined;
  return {
    ...current,
    plan: { ...current.plan, enrollments: removeBy(rows, (e) => e.id === enrollmentId) },
  };
}

export function useCounselorAddCourse(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: { courseId: string; gradeLevel: number; semester: string }) =>
      counselorAddCourseToPlan(studentId, payload),

    onMutate: async (payload) => {
      const pendingId = optimisticId();
      const context = await optimistic.patch<StudentCoursePlanResponse>(
        { queryKey: coursePlanKeys.studentPlan(studentId) },
        (current) => insertPlannedCourse(current, payload, pendingId),
      );
      return { ...context, pendingId };
    },

    // The POST returns the created row but not the course's credits or category, and
    // graduationProgress is recomputed server-side — so this one still reconciles.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
    },

    onSuccess: () => toast.success("Course added to student's plan"),

    // Targeted undo, NOT optimistic.rollback — see insertPlannedCourse for why snapshot
    // rollback corrupts the cache when SequenceBuilder submits several adds at once.
    // This is strictly narrower than a snapshot restore: it only knows about the one
    // key patched above, so any future onMutate that patches additional keys must undo
    // those here too.
    onError: (err: Error, _payload, context) => {
      const pendingId = context?.pendingId;
      if (pendingId) {
        optimistic.replace<StudentCoursePlanResponse>(
          { queryKey: coursePlanKeys.studentPlan(studentId) },
          (current) => removeEnrollment(current, pendingId),
        );
      }
      toast.error(err.message);
    },
  });
}

export function useCounselorRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (enrollmentId: string) =>
      counselorRemoveCourseFromPlan(studentId, enrollmentId),

    onMutate: (enrollmentId) =>
      optimistic.patch<StudentCoursePlanResponse>(
        { queryKey: coursePlanKeys.studentPlan(studentId) },
        (current) => removeEnrollment(current, enrollmentId),
      ),

    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
    },

    onSuccess: () => toast.success("Course removed from student's plan"),

    // The endpoint 404s when the enrollment is not the named student's — worth the
    // rollback, since the plan now also renders completed grades, which have ids the
    // delete route will not match.
    onError: (err: Error, _enrollmentId, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
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

// STATE OF THESE TWO ENDPOINTS AS OF 2026-08-08 — read this before changing them.
//
// The routes these call now EXIST IN SOURCE in both backends: legacy Node at
// api/src/routes/school-students.ts:187 (POST) and :209 (DELETE), added by #94's fix
// (2c7e0367, 2026-08-04, on main), and .NET at SchoolStudentsCoursePlanWriteEndpoints.cs
// :32-33, added by #107.
//
// They are NOT REACHABLE IN PRODUCTION YET, and that is the part the previous comment
// here got wrong — it claimed #94 had landed, which was true of the repo and false of
// the running system, and that is what #111 was filed about. Two separate reasons:
//   - Node: the deployed nexa-api image is deploy-20260730-…-dfbeca5a, a 07-30 build
//     that predates 2c7e0367 by five days. Until that image is redeployed, both calls
//     404 in prod.
//   - .NET: shipped dark on purpose. There is no next.config.ts rewrite for
//     /api/v1/school-admin/students/:studentId/course-plan (reads or writes), so every
//     request on this surface goes to legacy Node regardless of any flag. Wiring that
//     flag is #107's open decision, and the reads and both writes must be flipped
//     together or #94's symptom re-opens on the .NET side.
//
// These stay OPTIMISTIC anyway (#111 resolution). Reverting to pessimistic would not
// make the feature work: apiClient does not retry 4xx (lib/api/apiClient.ts:196-200),
// so the 404 comes back in one round trip and onError shows a failure toast either way.
// The only difference is a ~200ms placeholder row before that toast, which is not worth
// two rewrites plus the standing risk that the re-conversion never happens. The real
// fix for the production 404 is the Node deploy, which is an ops decision, not this
// file's. What IS this file's problem is behaving correctly when a write fails — which
// is permanent, not prod-only — and that is what the targeted rollback below is for.
//
// The caller passes courseCode/courseName/credits alongside the courseId. The server
// ignores them — it stores only courseId + term + status and joins the rest back in on
// read — but they are exactly what the optimistic row needs to render properly, so the
// placeholder here is more complete than the counselor one.
export function useSchoolAdminAddCourse(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: { courseId: string; courseCode: string; courseName: string; credits: number; gradeLevel: number; semester: string }) =>
      schoolAdminAddCourseToPlan(studentId, payload),

    onMutate: async (payload) => {
      const pendingId = optimisticId();
      const context = await optimistic.patch<StudentCoursePlanResponse>(
        { queryKey: coursePlanKeys.studentPlan(studentId) },
        (current) => insertPlannedCourse(current, payload, pendingId),
      );
      return { ...context, pendingId };
    },

    // graduationProgress is recomputed server-side from the school's rule set, so it
    // is not guessed here and the reconcile is what corrects it.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
    },

    onSuccess: () => toast.success("Course added to plan"),

    // Targeted undo, NOT optimistic.rollback — see insertPlannedCourse. This is the
    // path prod takes on EVERY add today (the 404 above), and it is also the path a
    // 400 "No current academic year" takes after the deploy, so it has to be correct
    // for several adds at once. Strictly narrower than a snapshot restore: it only
    // undoes the one key patched above.
    onError: (err: Error, _payload, context) => {
      const pendingId = context?.pendingId;
      if (pendingId) {
        optimistic.replace<StudentCoursePlanResponse>(
          { queryKey: coursePlanKeys.studentPlan(studentId) },
          (current) => removeEnrollment(current, pendingId),
        );
      }
      toast.error(err.message);
    },
  });
}

export function useSchoolAdminRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (enrollmentId: string) => schoolAdminRemoveCourseFromPlan(studentId, enrollmentId),

    onMutate: (enrollmentId) =>
      optimistic.patch<StudentCoursePlanResponse>(
        { queryKey: coursePlanKeys.studentPlan(studentId) },
        (current) => removeEnrollment(current, enrollmentId),
      ),

    onSettled: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
    },

    onSuccess: () => toast.success("Course removed from plan"),

    // 404s when the id is not a plan row belonging to this student — which includes
    // every completed-grade row the plan view also renders.
    onError: (err: Error, _enrollmentId, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
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
