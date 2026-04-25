import {
  Course,
  CourseEnrollment,
  CourseEnrollmentPayload,
  CourseProgressPayload,
  CourseCompletionPayload,
} from "@/types/course";
import { mockCourses } from "@/data/mockCourses";
import { apiRequest } from "@/lib/api/apiClient";

const enrollmentStore = new Map<string, CourseEnrollment>();

const simulateNetworkDelay = async <T>(value: T, delay = 200): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(value), delay));
};

const buildEnrollmentRecord = (
  course: Course,
  enrollmentId: string,
  _source: "catalog" | "recommended" | "dashboard"
): CourseEnrollment => {
  const now = new Date().toISOString();

  return {
    enrollmentId,
    courseId: course.id,
    courseTitle: course.title,
    courseThumbnail: course.thumbnailUrl,
    courseraUrl: course.courseraUrl,
    enrolledAt: now,
    status: "in_progress",
    progress: {
      completedModules: 0,
      totalModules: course.syllabus.length,
      percentage: 0,
      lastAccessedAt: now,
    },
  };
};

export async function enrollInCourse(
  payload: CourseEnrollmentPayload
): Promise<CourseEnrollment> {
  const { course, enrollmentSource } = payload;
  const enrollmentId = `enrollment_${course.id}_${Date.now()}`;
  const enrollment = buildEnrollmentRecord(
    course,
    enrollmentId,
    enrollmentSource
  );

  enrollmentStore.set(enrollmentId, enrollment);

  return simulateNetworkDelay(enrollment);
}

export async function trackCourseProgress(
  payload: CourseProgressPayload
): Promise<CourseEnrollment | null> {
  const existing = enrollmentStore.get(payload.enrollmentId);

  if (!existing) {
    return simulateNetworkDelay(null);
  }

  const updated: CourseEnrollment = {
    ...existing,
    status: payload.status ?? existing.status,
    progress: {
      ...existing.progress,
      completedModules:
        payload.completedModules ?? existing.progress.completedModules,
      totalModules: payload.totalModules ?? existing.progress.totalModules,
      percentage: payload.percentage ?? existing.progress.percentage,
      lastAccessedAt: payload.lastAccessedAt ?? new Date().toISOString(),
    },
  };

  enrollmentStore.set(payload.enrollmentId, updated);

  return simulateNetworkDelay(updated);
}

export async function markCourseCompleted(
  payload: CourseCompletionPayload
): Promise<CourseEnrollment | null> {
  const existing = enrollmentStore.get(payload.enrollmentId);

  if (!existing) {
    return simulateNetworkDelay(null);
  }

  const updated: CourseEnrollment = {
    ...existing,
    status: "completed",
    progress: {
      ...existing.progress,
      completedModules: existing.progress.totalModules,
      percentage: 100,
      lastAccessedAt: payload.completedAt ?? new Date().toISOString(),
    },
  };

  enrollmentStore.set(payload.enrollmentId, updated);

  return simulateNetworkDelay(updated);
}

// --- Course listing & admin (mock) ---
export async function listCourses() {
  return simulateNetworkDelay({
    courses: mockCourses,
    meta: { total: mockCourses.length, page: 1, pageSize: mockCourses.length },
  });
}

export async function adminListCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  try {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.search) q.set("search", params.search);
    const url = `/api/admin/courses?${q.toString()}`;
    const response = await apiRequest(url, { method: "GET" });
    const data = response?.data ?? response;
    // If backend returns empty courses and local mocks are explicitly enabled, fall back to mock list
    const useLocal = process.env.NEXT_PUBLIC_USE_LOCAL_API === "true";
    if ((!data || !data.courses || data.courses.length === 0) && useLocal) {
      return listCourses();
    }
    return data;
  } catch (err) {
    const useLocal = process.env.NEXT_PUBLIC_USE_LOCAL_API === "true";
    if (useLocal) return listCourses();
    throw err;
  }
}

export async function getCourseById(id: string) {
  const found = mockCourses.find((c) => c.id === id);
  return simulateNetworkDelay(found ?? null);
}

export async function adminCreateCourse(payload: Course) {
  try {
    const response = await apiRequest(`/api/admin/courses`, {
      method: "POST",
      data: payload,
    });
    return response?.data ?? response;
  } catch (err) {
    // Fallback to mock behaviour if backend unavailable
    const id = `course_${Date.now()}`;
    const created = { ...payload, id } as Course;
    mockCourses.push(created);
    return simulateNetworkDelay(created);
  }
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
  const idx = mockCourses.findIndex((c) => c.id === id);
  if (idx === -1) return simulateNetworkDelay(null);
  mockCourses[idx] = { ...mockCourses[idx], ...payload } as Course;
  return simulateNetworkDelay(mockCourses[idx]);
}

export async function adminDeleteCourse(id: string) {
  const idx = mockCourses.findIndex((c) => c.id === id);
  if (idx === -1) return simulateNetworkDelay(false);
  mockCourses.splice(idx, 1);
  return simulateNetworkDelay(true);
}

// Replace update/delete with server-backed variants too (with mock fallback)
export async function adminUpdateCourseApi(
  id: string,
  payload: Partial<Course>
) {
  try {
    const response = await apiRequest(`/api/admin/courses/${id}`, {
      method: "PUT",
      data: payload,
    });
    return response?.data ?? response;
  } catch (err) {
    return adminUpdateCourse(id, payload);
  }
}

export async function adminDeleteCourseApi(id: string) {
  try {
    const response = await apiRequest(`/api/admin/courses/${id}`, {
      method: "DELETE",
    });
    return response?.data ?? response;
  } catch (err) {
    return adminDeleteCourse(id);
  }
}

export async function getRecommendationsBySkills(skills: string[]): Promise<Course[]> {
  const allCourses = await listCourses();
  
  // Simple mock matching logic: if course title contains skill
  const recommended = (allCourses.courses || []).filter(course => 
    skills.some(skill => 
      course.title.toLowerCase().includes(skill.toLowerCase())
    )
  );

  // Fallback if no direct matches, just return top rated
  if (recommended.length === 0) {
    return (allCourses.courses || []).slice(0, 3);
  }

  return simulateNetworkDelay(recommended.slice(0, 4));
}
