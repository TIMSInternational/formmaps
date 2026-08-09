import { apiRequest } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";
import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";
import type {
  StudentCoursePlanResponse,
  StudentCourseEnrollment,
  MyCourseRecommendationsResponse,
  CourseChangeRequestPayload,
  CourseChangeRequestsResponse,
  CourseChangeRequest,
  ChangeRequestReviewPayload,
} from "@/types/coursePlan";

// Get student's own course plan (student-facing)
export async function getMyCoursePlan(): Promise<StudentCoursePlanResponse> {
  const json = await apiRequest("/api/v1/student/course-plan");
  return json.data ?? json;
}

// A row as the counselor `/course-sequence` endpoint actually returns it. Note what
// is NOT here: no gradeLevel, no credits, no category, and the term field is `term`,
// not `semester`. `term` is `String?` in the schema, so it really can be null.
interface CourseSequenceRow {
  id: string;
  academicYearId?: string;
  term?: string | null;
  courseId: string;
  courseCode?: string | null;
  courseName?: string | null;
  status?: string | null;
  sortOrder?: number;
  notes?: string | null;
}

// formmaps#95: the counselor and school-admin endpoints return DIFFERENT shapes and
// are both typed StudentCoursePlanResponse, so nothing complained while every
// counselor saw an empty Course Plan grid.
//
//   school_admin -> { plan: { studentId, gradeLevel, enrollments[], ... }, recommendations }
//   counselor    -> { data: [...bare rows], total }
//
// SequenceBuilder reads `planData.plan`, which was undefined for counselors.
//
// The field defaults below are NOT invented — they mirror exactly what the
// school-admin reader (schoolStudentsService.getStudentCoursePlan) already does for
// its own planned rows, so both roles render by the same convention:
//
//   semester:   p.term || "Fall"          <- load-bearing: `term` is nullable, and
//                                            SequenceBuilder calls
//                                            `e.semester.toLowerCase()` UNGUARDED.
//                                            A null here is a crash, not a blank cell.
//   gradeLevel: user.gradeLevel || 11     <- the row carries no grade of its own.
//   credits/category: 0 / ""              <- the school-admin reader falls back to
//                                            these whenever the course lookup misses.
//
// KNOWN DIVERGENCE, deliberately not papered over: `/course-sequence` returns rows
// for EVERY active academic year, while the school-admin reader filters to the
// current year and additionally merges completed StudentGrade rows and
// graduationProgress. So a counselor viewing a multi-year plan sees those extra rows
// stamped with the student's current grade, and no graduation-progress card (the
// SequenceBuilder guards that on `gradProg &&`, so it simply does not render).
// Making the two genuinely identical needs the backend fix in formmaps#95 option 2.
export function normalizeCourseSequence(
  studentId: string,
  rows: CourseSequenceRow[],
  studentGradeLevel?: number
): StudentCoursePlanResponse {
  const gradeLevel = studentGradeLevel || 11;
  return {
    plan: {
      studentId,
      gradeLevel,
      enrollments: rows.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        courseCode: r.courseCode || "",
        courseName: r.courseName || "",
        category: "",
        credits: 0,
        gradeLevel,
        semester: r.term || "Fall",
        status: (r.status || "planned") as StudentCourseEnrollment["status"],
      })),
    },
    recommendations: [],
  };
}

// Get a specific student's course plan (counselor or school-admin facing).
// Endpoint chosen by role — firing the counselor endpoint as an admin is a
// guaranteed 403 (it 404s/403s for non-counselors), not a useful fallback.
//
// `studentGradeLevel` is only consulted on the counselor branch; the school-admin
// payload already carries a real gradeLevel per enrollment and is passed through
// untouched.
export async function getStudentCoursePlan(
  studentId: string,
  studentGradeLevel?: number
): Promise<StudentCoursePlanResponse> {
  const role = normalizeRole(useGlobalStore.getState().user.role);
  const isCounselor = role === Roles.COUNSELOR;
  const path = isCounselor
    ? `/api/v1/counselor/me/students/${studentId}/course-sequence`
    : `/api/v1/school-admin/students/${studentId}/course-plan`;
  const json = await apiRequest(path);
  const payload = json.data ?? json;

  if (!isCounselor) return payload;

  // Only reshape the bare-rows envelope. If the counselor route ever starts
  // returning a real `plan` (the option-2 backend fix), pass it straight through
  // rather than flattening a correct response into an approximated one.
  if (payload && typeof payload === "object" && "plan" in payload) return payload;

  const rows: CourseSequenceRow[] = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];
  return normalizeCourseSequence(studentId, rows, studentGradeLevel);
}

// Get course recommendations for student (student-facing). Keeps the sibling
// locked/completion flags — they gate the graduation-plan card too.
export async function getMyCourseRecommendations(): Promise<MyCourseRecommendationsResponse> {
  const json = await apiRequest("/api/v1/student/course-plan/recommendations");
  const items = json?.data ?? [];
  return {
    data: Array.isArray(items) ? items : [],
    locked: json?.locked === true,
    completion: json?.completion,
  };
}

// Add course to plan
export async function addCourseToPlan(payload: {
  courseId: string;
  gradeLevel: number;
  semester: string;
}): Promise<void> {
  await apiRequest("/api/v1/student/course-plan/courses", {
    method: "POST",
    data: payload,
  });
}

// Remove course from plan.
// Keyed by COURSE id, not enrollment id: the route is
// DELETE /course-plan/courses/:courseId and it deletes the caller's planned rows for
// that course. The parameter used to be named `enrollmentId`, which is what the single
// caller has a comment apologising for.
export async function removeCourseFromPlan(courseId: string): Promise<void> {
  await apiRequest(`/api/v1/student/course-plan/courses/${courseId}`, {
    method: "DELETE",
  });
}

// ─── Counselor: directly edit a student's course plan ───────────────────────

export async function counselorAddCourseToPlan(
  studentId: string,
  payload: { courseId: string; gradeLevel: number; semester: string }
): Promise<void> {
  await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/course-plan/courses`,
    { method: "POST", data: payload }
  );
}

export async function counselorRemoveCourseFromPlan(
  studentId: string,
  enrollmentId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/course-plan/courses/${enrollmentId}`,
    { method: "DELETE" }
  );
}

// ─── Student: submit / cancel change requests ───────────────────────────────

export async function submitChangeRequest(
  payload: CourseChangeRequestPayload
): Promise<CourseChangeRequest> {
  const json = await apiRequest(
    "/api/v1/student/course-plan/change-requests",
    { method: "POST", data: payload }
  );
  return json.data ?? json;
}

export async function getMyChangeRequests(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<CourseChangeRequestsResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const json = await apiRequest(
    `/api/v1/student/course-plan/change-requests?${qs}`
  );
  return json.data ?? json;
}

export async function cancelChangeRequest(requestId: string): Promise<void> {
  await apiRequest(
    `/api/v1/student/course-plan/change-requests/${requestId}`,
    { method: "DELETE" }
  );
}

// ─── Counselor: view and review student change requests ──────────────────────

export async function getStudentChangeRequests(
  studentId: string,
  params?: { status?: string; page?: number; limit?: number }
): Promise<CourseChangeRequestsResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const json = await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/course-plan/change-requests?${qs}`
  );
  return json.data ?? json;
}

export async function reviewChangeRequest(
  studentId: string,
  requestId: string,
  payload: ChangeRequestReviewPayload
): Promise<CourseChangeRequest> {
  const json = await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/course-plan/change-requests/${requestId}`,
    { method: "PUT", data: payload }
  );
  return json.data ?? json;
}

// ─── School Admin: directly edit a student's course plan ─────────────────────

// Returns the created plan row (#94). The route only stores courseId + term + status;
// courseCode/courseName/credits are sent by the caller but ignored server-side, since
// they live on the school's course record and are joined back in on read.
export async function schoolAdminAddCourseToPlan(
  studentId: string,
  payload: { courseId: string; gradeLevel: number; semester: string }
): Promise<{ id: string }> {
  const json = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan/courses`,
    { method: "POST", data: payload }
  );
  return json.data ?? json;
}

export async function schoolAdminRemoveCourseFromPlan(
  studentId: string,
  enrollmentId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan/courses/${enrollmentId}`,
    { method: "DELETE" }
  );
}

// ─── School Admin: view and review student change requests ───────────────────

export async function getSchoolAdminStudentChangeRequests(
  studentId: string,
  params?: { status?: string; page?: number; limit?: number }
): Promise<CourseChangeRequestsResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const json = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan/change-requests?${qs}`
  );
  return json.data ?? json;
}

export async function reviewSchoolAdminStudentChangeRequest(
  studentId: string,
  requestId: string,
  payload: ChangeRequestReviewPayload
): Promise<CourseChangeRequest> {
  const json = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan/change-requests/${requestId}/review`,
    { method: "PUT", data: payload }
  );
  return json.data ?? json;
}
