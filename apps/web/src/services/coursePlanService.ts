import type {
  StudentCoursePlanResponse,
  RecommendedCourse,
  CourseChangeRequestPayload,
  CourseChangeRequestsResponse,
  CourseChangeRequest,
  ChangeRequestReviewPayload,
} from "@/types/coursePlan";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

function getHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// Get student's own course plan (student-facing)
export async function getMyCoursePlan(): Promise<StudentCoursePlanResponse> {
  const res = await fetch(`${API_BASE}/api/v1/student/course-plan`, {
    headers: getHeaders(),
  });
  return handleResponse<StudentCoursePlanResponse>(res);
}

// Get a specific student's course plan (counselor-facing)
export async function getStudentCoursePlan(
  studentId: string
): Promise<StudentCoursePlanResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/course-plan`,
    { headers: getHeaders() }
  );
  return handleResponse<StudentCoursePlanResponse>(res);
}

// Get course recommendations for student (student-facing)
export async function getMyCourseRecommendations(): Promise<RecommendedCourse[]> {
  const res = await fetch(`${API_BASE}/api/v1/student/course-plan/recommendations`, {
    headers: getHeaders(),
  });
  return handleResponse<RecommendedCourse[]>(res);
}

// Add course to plan
export async function addCourseToPlan(payload: {
  courseId: string;
  gradeLevel: number;
  semester: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/student/course-plan/courses`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add course to plan");
}

// Remove course from plan
export async function removeCourseFromPlan(
  enrollmentId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/student/course-plan/courses/${enrollmentId}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to remove course from plan");
}

// ─── Counselor: directly edit a student's course plan ───────────────────────

export async function counselorAddCourseToPlan(
  studentId: string,
  payload: { courseId: string; gradeLevel: number; semester: string }
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/counselor/me/students/${studentId}/course-plan/courses`,
    { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) }
  );
  if (!res.ok) throw new Error("Failed to add course");
}

export async function counselorRemoveCourseFromPlan(
  studentId: string,
  enrollmentId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/counselor/me/students/${studentId}/course-plan/courses/${enrollmentId}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to remove course");
}

// ─── Student: submit / cancel change requests ───────────────────────────────

export async function submitChangeRequest(
  payload: CourseChangeRequestPayload
): Promise<CourseChangeRequest> {
  const res = await fetch(`${API_BASE}/api/v1/student/course-plan/change-requests`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CourseChangeRequest>(res);
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
  const res = await fetch(
    `${API_BASE}/api/v1/student/course-plan/change-requests?${qs}`,
    { headers: getHeaders() }
  );
  return handleResponse<CourseChangeRequestsResponse>(res);
}

export async function cancelChangeRequest(requestId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/student/course-plan/change-requests/${requestId}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to cancel request");
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
  const res = await fetch(
    `${API_BASE}/api/v1/counselor/me/students/${studentId}/course-plan/change-requests?${qs}`,
    { headers: getHeaders() }
  );
  return handleResponse<CourseChangeRequestsResponse>(res);
}

export async function reviewChangeRequest(
  studentId: string,
  requestId: string,
  payload: ChangeRequestReviewPayload
): Promise<CourseChangeRequest> {
  const res = await fetch(
    `${API_BASE}/api/v1/counselor/me/students/${studentId}/course-plan/change-requests/${requestId}`,
    { method: "PUT", headers: getHeaders(), body: JSON.stringify(payload) }
  );
  return handleResponse<CourseChangeRequest>(res);
}

// ─── School Admin: directly edit a student's course plan ─────────────────────

export async function schoolAdminAddCourseToPlan(
  studentId: string,
  payload: { courseId: string; gradeLevel: number; semester: string }
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/course-plan/courses`,
    { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) }
  );
  if (!res.ok) throw new Error("Failed to add course");
}

export async function schoolAdminRemoveCourseFromPlan(
  studentId: string,
  enrollmentId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/course-plan/courses/${enrollmentId}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to remove course");
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
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/course-plan/change-requests?${qs}`,
    { headers: getHeaders() }
  );
  return handleResponse<CourseChangeRequestsResponse>(res);
}

export async function reviewSchoolAdminStudentChangeRequest(
  studentId: string,
  requestId: string,
  payload: ChangeRequestReviewPayload
): Promise<CourseChangeRequest> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/course-plan/change-requests/${requestId}`,
    { method: "PUT", headers: getHeaders(), body: JSON.stringify(payload) }
  );
  return handleResponse<CourseChangeRequest>(res);
}
