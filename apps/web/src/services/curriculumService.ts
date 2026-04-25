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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

const buildUrl = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();

  // The API sometimes returns deeply nested { data: { data: [...], total: 2, page: 1 } }
  // If json.data exists and has its own inner 'data' array
  if (json.data && json.data.data !== undefined) {
    // If the endpoint expects a paginated response (like SchoolCoursesResponse),
    // it needs the full outer wrapper (the object containing total, page, etc)
    // We check if 'total' exists on the inner json.data to see if it's paginated.
    if ("total" in json.data || "page" in json.data) {
      return json.data as T;
    }

    // Otherwise, for simple array endpoints, extract the inner array directly.
    return json.data.data as T;
  }

  return (json.data ?? json) as T;
};

// ============================================
// Curriculum Frameworks (SCRUM-131)
// ============================================

export async function getFrameworks(): Promise<CurriculumFramework[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/curriculum/frameworks"), {
    headers: getHeaders(),
  });
  return handleResponse<CurriculumFramework[]>(res);
}

export async function updateFrameworks(payload: FrameworkTogglePayload): Promise<CurriculumFramework[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/curriculum/frameworks"), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CurriculumFramework[]>(res);
}

export async function getFrameworkCourses(
  type: string,
  params?: { page?: number; limit?: number; search?: string }
): Promise<FrameworkCoursesResponse> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/curriculum/frameworks/${type}/courses`, params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<FrameworkCoursesResponse>(res);
}

export async function updateFrameworkCourse(
  type: string,
  courseId: string,
  payload: FrameworkCourseOverride
): Promise<FrameworkCourse> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/curriculum/frameworks/${type}/courses/${courseId}`),
    { method: "PUT", headers: getHeaders(), body: JSON.stringify(payload) }
  );
  return handleResponse<FrameworkCourse>(res);
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
  const res = await fetch(
    buildUrl("/api/v1/school-admin/courses", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<SchoolCoursesResponse>(res);
}

/** Student/public-facing course listing (no school-admin role required) */
export async function getAvailableCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
}): Promise<SchoolCoursesResponse> {
  const res = await fetch(
    buildUrl("/api/v1/courses", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<SchoolCoursesResponse>(res);
}

export async function createSchoolCourse(payload: SchoolCoursePayload): Promise<SchoolCourse> {
  const res = await fetch(buildUrl("/api/v1/school-admin/courses"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SchoolCourse>(res);
}

export async function updateSchoolCourse(courseId: string, payload: Partial<SchoolCoursePayload>): Promise<SchoolCourse> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/courses/${courseId}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SchoolCourse>(res);
}

export async function deleteSchoolCourse(courseId: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/courses/${courseId}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete course");
}

export async function importSchoolCourses(file: File): Promise<CourseImportResult> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/v1/school-admin/courses/import"), {
    method: "POST",
    headers,
    body: form,
  });
  return handleResponse<CourseImportResult>(res);
}

// ============================================
// Prerequisites (SCRUM-137)
// ============================================

export async function updatePrerequisites(courseId: string, payload: PrerequisitePayload): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/courses/${courseId}/prerequisites`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update prerequisites");
}

export async function checkPrerequisites(courseId: string, studentId: string): Promise<PrerequisiteCheckResult> {
  const res = await fetch(
    buildUrl(`/api/v1/courses/${courseId}/prerequisite-check`, { studentId }),
    { headers: getHeaders() }
  );
  return handleResponse<PrerequisiteCheckResult>(res);
}

export async function getPrerequisiteChain(courseId: string): Promise<PrerequisiteChain> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/courses/${courseId}/prerequisite-chain`),
    { headers: getHeaders() }
  );
  return handleResponse<PrerequisiteChain>(res);
}

// ============================================
// AI Course Recognition (SCRUM-136)
// ============================================

export async function recognizeCourses(courseIds: string[]): Promise<AIRecognitionResponse> {
  const res = await fetch(buildUrl("/api/v1/school-admin/courses/ai-recognize"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ courseIds }),
  });
  return handleResponse<AIRecognitionResponse>(res);
}

export async function recognizeAllUnmapped(): Promise<AIRecognitionResponse> {
  const res = await fetch(buildUrl("/api/v1/school-admin/courses/ai-recognize"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ scope: "unmapped" }),
  });
  return handleResponse<AIRecognitionResponse>(res);
}

export async function applyAIMapping(courseId: string, payload: AIMappingAction): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/courses/${courseId}/ai-mapping`), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to apply AI mapping");
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
  const res = await fetch(buildUrl(`/api/v1/school-admin/courses/import/${jobId}`), {
    headers: getHeaders(),
  });
  return handleResponse<CourseImportStatus>(res);
}

export async function downloadCourseImportFailures(jobId: string): Promise<Blob> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/courses/import/${jobId}/download-failures`),
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to download failure report");
  return res.blob();
}
