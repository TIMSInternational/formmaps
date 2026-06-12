import { apiRequest } from "@/lib/api/apiClient";
import type {
  CurriculumFramework,
  FrameworkCourse,
  FrameworkTogglePayload,
  FrameworkCourseOverride,
  FrameworkCoursesResponse,
  SchoolCourse,
  SchoolCoursePayload,
  SchoolCoursesResponse,
  CourseImportResult,
  PrerequisitePayload,
  PrerequisiteCheckResult,
  PrerequisiteChain,
  AIRecognitionResponse,
  AIMappingAction,
} from "@/types/curriculum";
import type { PrereqSuggestion, PrereqApplyUpdate, CourseEligibility } from "@/types/prereq";

const buildPath = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.append(key, String(value));
    }
  });
  const queryString = qs.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
};

// Curriculum service: unwrap response preserving pagination shape
const unwrap = <T>(json: unknown): T => {
  const obj = json as Record<string, unknown> | null;
  const d = obj?.data as Record<string, unknown> | undefined;
  if (d == null) return json as T;
  if ("total" in d || "page" in d) return d as T;
  if (d.data !== undefined) return d.data as T;
  return d as T;
};

// ============================================
// Curriculum Frameworks (SCRUM-131)
// ============================================

export async function getFrameworks(): Promise<CurriculumFramework[]> {
  const json = await apiRequest("/api/v1/school-admin/curriculum/frameworks");
  return unwrap<CurriculumFramework[]>(json);
}

export async function updateFrameworks(payload: FrameworkTogglePayload): Promise<CurriculumFramework[]> {
  const json = await apiRequest("/api/v1/school-admin/curriculum/frameworks", {
    method: "PUT",
    data: payload,
  });
  return unwrap<CurriculumFramework[]>(json);
}

export async function getFrameworkCourses(
  type: string,
  params?: { page?: number; limit?: number; search?: string }
): Promise<FrameworkCoursesResponse> {
  const json = await apiRequest(
    buildPath(`/api/v1/school-admin/curriculum/frameworks/${type}/courses`, params as Record<string, string | number>)
  );
  return unwrap<FrameworkCoursesResponse>(json);
}

export async function updateFrameworkCourse(
  type: string,
  courseId: string,
  payload: FrameworkCourseOverride
): Promise<FrameworkCourse> {
  const json = await apiRequest(
    `/api/v1/school-admin/curriculum/frameworks/${type}/courses/${courseId}`,
    { method: "PUT", data: payload }
  );
  return unwrap<FrameworkCourse>(json);
}

// ============================================
// School Courses (SCRUM-135)
// ============================================

export async function getSchoolCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  frameworkType?: string;
  gradeLevel?: number;
}): Promise<SchoolCoursesResponse> {
  const json = await apiRequest(
    buildPath("/api/v1/school-admin/courses", params as Record<string, string | number>)
  );
  return unwrap<SchoolCoursesResponse>(json);
}

/** Student/public-facing course listing (no school-admin role required) */
export async function getAvailableCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
}): Promise<SchoolCoursesResponse> {
  const json = await apiRequest(
    buildPath("/api/v1/courses", params as Record<string, string | number>)
  );
  return unwrap<SchoolCoursesResponse>(json);
}

export async function createSchoolCourse(payload: SchoolCoursePayload): Promise<SchoolCourse> {
  const json = await apiRequest("/api/v1/school-admin/courses", {
    method: "POST",
    data: payload,
  });
  return unwrap<SchoolCourse>(json);
}

export async function updateSchoolCourse(courseId: string, payload: Partial<SchoolCoursePayload>): Promise<SchoolCourse> {
  const json = await apiRequest(`/api/v1/school-admin/courses/${courseId}`, {
    method: "PUT",
    data: payload,
  });
  return unwrap<SchoolCourse>(json);
}

export async function deleteSchoolCourse(courseId: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/courses/${courseId}`, {
    method: "DELETE",
  });
}

export async function importSchoolCourses(file: File): Promise<CourseImportResult> {
  const form = new FormData();
  form.append("file", file);
  const json = await apiRequest("/api/v1/school-admin/courses/import", {
    method: "POST",
    data: form,
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrap<CourseImportResult>(json);
}

// ============================================
// Prerequisites (SCRUM-137)
// ============================================

export async function updatePrerequisites(courseId: string, payload: PrerequisitePayload): Promise<void> {
  await apiRequest(`/api/v1/school-admin/courses/${courseId}/prerequisites`, {
    method: "PUT",
    data: payload,
  });
}

export async function checkPrerequisites(courseId: string, studentId: string): Promise<PrerequisiteCheckResult> {
  const json = await apiRequest(
    buildPath(`/api/v1/courses/${courseId}/prerequisite-check`, { studentId })
  );
  return unwrap<PrerequisiteCheckResult>(json);
}

export async function getPrerequisiteChain(courseId: string): Promise<PrerequisiteChain> {
  const json = await apiRequest(
    `/api/v1/school-admin/courses/${courseId}/prerequisite-chain`
  );
  return unwrap<PrerequisiteChain>(json);
}

// ============================================
// AI Course Recognition (SCRUM-136)
// ============================================

export async function recognizeCourses(courseIds: string[]): Promise<AIRecognitionResponse> {
  const json = await apiRequest("/api/v1/school-admin/courses/ai-recognize", {
    method: "POST",
    data: { courseIds },
  });
  return unwrap<AIRecognitionResponse>(json);
}

export async function recognizeAllUnmapped(): Promise<AIRecognitionResponse> {
  const json = await apiRequest("/api/v1/school-admin/courses/ai-recognize", {
    method: "POST",
    data: { scope: "unmapped" },
  });
  return unwrap<AIRecognitionResponse>(json);
}

export async function applyAIMapping(courseId: string, payload: AIMappingAction): Promise<void> {
  await apiRequest(`/api/v1/school-admin/courses/${courseId}/ai-mapping`, {
    method: "POST",
    data: payload,
  });
}

// ============================================
// Course Import Job Polling (SCRUM-135)
// ============================================

export interface CourseImportStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  successCount: number;
  failureCount: number;
  message?: string;
  completedAt?: string;
}

export async function getCourseImportStatus(jobId: string): Promise<CourseImportStatus> {
  const json = await apiRequest(`/api/v1/school-admin/courses/import/${jobId}`);
  return unwrap<CourseImportStatus>(json);
}

export async function downloadCourseImportFailures(jobId: string): Promise<Blob> {
  // Blob download requires raw fetch — apiRequest returns parsed JSON
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(
    `${baseUrl}/api/v1/school-admin/courses/import/${jobId}/download-failures`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error("Failed to download failure report");
  return res.blob();
}

// ─── Prerequisite analysis (admin) + eligibility (student) ──────────────────

export async function analyzePrerequisites(): Promise<PrereqSuggestion[]> {
  const json = await apiRequest("/api/v1/school-admin/courses/prereq-analysis", { method: "POST" });
  const items = json?.data ?? [];
  return Array.isArray(items) ? items : [];
}

export async function applyPrereqSuggestions(updates: PrereqApplyUpdate[]): Promise<{ updated: number }> {
  const json = await apiRequest("/api/v1/school-admin/courses/prereq-analysis/apply", { method: "POST", data: { updates } });
  return json?.data ?? { updated: 0 };
}

export async function getMyCourseEligibility(): Promise<CourseEligibility[]> {
  const json = await apiRequest("/api/v1/student/course-plan/eligibility");
  const items = json?.data ?? [];
  return Array.isArray(items) ? items : [];
}
