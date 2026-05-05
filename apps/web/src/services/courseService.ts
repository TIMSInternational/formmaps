import {
  Course,
  CourseEnrollment,
  CourseEnrollmentPayload,
  CourseProgressPayload,
  CourseCompletionPayload,
} from "@/types/course";
import { apiRequest } from "@/lib/api/apiClient";

export async function enrollInCourse(
  payload: CourseEnrollmentPayload
): Promise<CourseEnrollment> {
  const { course, enrollmentSource } = payload;
  return apiRequest("/api/course/enroll", {
    method: "POST",
    data: {
      courseId: course.id,
      courseTitle: course.title,
      courseThumbnail: course.thumbnailUrl,
      courseraUrl: course.courseraUrl,
      totalModules: course.syllabus?.length ?? 0,
      enrollmentSource,
    },
  });
}

export async function trackCourseProgress(
  payload: CourseProgressPayload
): Promise<CourseEnrollment | null> {
  return apiRequest(`/api/course/progress/${payload.enrollmentId}`, {
    method: "PUT",
    data: {
      status: payload.status,
      completedModules: payload.completedModules,
      totalModules: payload.totalModules,
      percentage: payload.percentage,
      lastAccessedAt: payload.lastAccessedAt ?? new Date().toISOString(),
    },
  });
}

export async function markCourseCompleted(
  payload: CourseCompletionPayload
): Promise<CourseEnrollment | null> {
  return apiRequest(`/api/course/progress/${payload.enrollmentId}`, {
    method: "PUT",
    data: {
      status: "completed",
      percentage: 100,
      lastAccessedAt: payload.completedAt ?? new Date().toISOString(),
    },
  });
}

export async function getUserEnrollments(): Promise<CourseEnrollment[]> {
  const response = await apiRequest("/api/course/progress", { method: "GET" });
  return response?.enrollments ?? response ?? [];
}

// --- Course listing & admin ---
export async function listCourses() {
  const response = await apiRequest("/api/course", { method: "GET" });
  const data = response?.data ?? response;
  return data;
}

export async function getRecommendedCourses() {
  const response = await apiRequest("/api/course/recommended", { method: "GET" });
  const data = response?.data ?? response;
  return data;
}

export async function adminListCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  const url = `/api/admin/courses?${q.toString()}`;
  const response = await apiRequest(url, { method: "GET" });
  const data = response?.data ?? response;
  return data;
}

export async function getCourseById(id: string) {
  const response = await apiRequest(`/api/admin/courses/${id}`, { method: "GET" });
  return response?.data ?? response ?? null;
}

export async function adminCreateCourse(payload: Course) {
  const response = await apiRequest(`/api/admin/courses`, {
    method: "POST",
    data: payload,
  });
  return response?.data ?? response;
}

// --- Import flow wrappers (frontend -> API) ---
export async function adminStartImport(url: string, source?: string) {
  return apiRequest(`/api/admin/courses/import`, {
    method: "POST",
    data: { url, source },
  });
}

export async function adminGetImportStatus(jobId: string) {
  return apiRequest(`/api/admin/courses/import/${jobId}/status`, {
    method: "GET",
  });
}

export async function adminAcceptImport(
  jobId: string,
  overrides?: Record<string, any>
) {
  return apiRequest(`/api/admin/courses/import/${jobId}/accept`, {
    method: "POST",
    data: { overrides },
  });
}

export async function adminUpdateCourse(id: string, payload: Partial<Course>) {
  const response = await apiRequest(`/api/admin/courses/${id}`, {
    method: "PUT",
    data: payload,
  });
  return response?.data ?? response;
}

export async function adminDeleteCourse(id: string) {
  const response = await apiRequest(`/api/admin/courses/${id}`, {
    method: "DELETE",
  });
  return response?.data ?? response;
}

export async function adminUpdateCourseApi(
  id: string,
  payload: Partial<Course>
) {
  const response = await apiRequest(`/api/admin/courses/${id}`, {
    method: "PUT",
    data: payload,
  });
  return response?.data ?? response;
}

export async function adminDeleteCourseApi(id: string) {
  const response = await apiRequest(`/api/admin/courses/${id}`, {
    method: "DELETE",
  });
  return response?.data ?? response;
}

export async function getRecommendationsBySkills(skills: string[]): Promise<Course[]> {
  try {
    const response = await apiRequest("/api/course/recommended", {
      method: "GET",
      params: { skills: skills.join(",") },
    });
    const courses = response?.courses ?? response ?? [];
    if (courses.length > 0) return courses.slice(0, 4);
  } catch {
    // Fallback to client-side filtering if endpoint doesn't support skills param
  }

  const allCourses = await listCourses();
  const courseList = allCourses.courses || [];
  const matched = courseList.filter((course: Course) =>
    skills.some((skill) =>
      course.title.toLowerCase().includes(skill.toLowerCase())
    )
  );
  return (matched.length > 0 ? matched : courseList).slice(0, 4);
}
