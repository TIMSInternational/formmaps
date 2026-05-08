import { apiRequest } from "@/lib/api/apiClient";
import type {
  StudentCoursePlanResponse,
  RecommendedCourse,
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

// Get a specific student's course plan (counselor-facing)
export async function getStudentCoursePlan(
  studentId: string
): Promise<StudentCoursePlanResponse> {
  const json = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan`
  );
  return json.data ?? json;
}

// Get course recommendations for student (student-facing)
export async function getMyCourseRecommendations(): Promise<RecommendedCourse[]> {
  const json = await apiRequest("/api/v1/student/course-plan/recommendations");
  return json.data ?? json;
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

// Remove course from plan
export async function removeCourseFromPlan(
  enrollmentId: string
): Promise<void> {
  await apiRequest(`/api/v1/student/course-plan/courses/${enrollmentId}`, {
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

export async function schoolAdminAddCourseToPlan(
  studentId: string,
  payload: { courseId: string; gradeLevel: number; semester: string }
): Promise<void> {
  await apiRequest(
    `/api/v1/school-admin/students/${studentId}/course-plan/courses`,
    { method: "POST", data: payload }
  );
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
    `/api/v1/school-admin/students/${studentId}/course-plan/change-requests/${requestId}`,
    { method: "PUT", data: payload }
  );
  return json.data ?? json;
}
