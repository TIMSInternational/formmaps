import { apiRequest } from "@/lib/api/apiClient";
import type {
  StudentAcademicGaps,
  AcademicGapSummary,
  CourseRecommendationsResponse,
} from "@/types/academicGap";

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

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), toCamel(v)])
    );
  }
  return obj;
}

// ============================================
// Academic Gap Analysis (SCRUM-139)
// ============================================

export async function getStudentAcademicGaps(studentId: string): Promise<StudentAcademicGaps> {
  const json = await apiRequest(
    buildPath(`/api/v1/school-admin/academic-gaps/students/${studentId}`)
  );
  return toCamel(json.data ?? json) as StudentAcademicGaps;
}

export async function getAcademicGapSummary(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AcademicGapSummary> {
  const json = await apiRequest(
    buildPath("/api/v1/school-admin/academic-gaps/summary", params as Record<string, string | number>)
  );
  return toCamel(json.data ?? json) as AcademicGapSummary;
}

// ============================================
// AI Course Recommendations (SCRUM-140)
// ============================================

export async function getStudentCourseRecommendations(
  studentId: string
): Promise<CourseRecommendationsResponse> {
  const json = await apiRequest(
    buildPath(`/api/v1/school-admin/academic-gaps/recommendations/${studentId}`)
  );
  return toCamel(json.data ?? json) as CourseRecommendationsResponse;
}
