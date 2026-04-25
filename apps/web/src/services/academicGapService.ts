import type {
  StudentAcademicGaps,
  AcademicGapSummary,
  CourseRecommendationsResponse,
} from "@/types/academicGap";

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
  return json.data ?? json;
};

// ============================================
// Academic Gap Analysis (SCRUM-139)
// ============================================

export async function getStudentAcademicGaps(studentId: string): Promise<StudentAcademicGaps> {
  const res = await fetch(
    buildUrl(`/api/v1/students/${studentId}/academic-gaps`),
    { headers: getHeaders() }
  );
  return handleResponse<StudentAcademicGaps>(res);
}

export async function getAcademicGapSummary(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AcademicGapSummary> {
  const res = await fetch(
    buildUrl("/api/v1/school-admin/academic-gaps/summary", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<AcademicGapSummary>(res);
}

// ============================================
// AI Course Recommendations (SCRUM-140)
// ============================================

export async function getStudentCourseRecommendations(
  studentId: string
): Promise<CourseRecommendationsResponse> {
  const res = await fetch(
    buildUrl(`/api/v1/students/${studentId}/course-recommendations`),
    { headers: getHeaders() }
  );
  return handleResponse<CourseRecommendationsResponse>(res);
}
