import type {
  GraduationRuleSet,
  GraduationRuleSetWithId,
  StudentGraduationProgress,
  GraduationProgressResponse,
} from "@/types/graduation";
import { apiRequest } from "@/lib/api/apiClient";

const buildQueryString = (params?: Record<string, string | number | undefined>): string => {
  if (!params) return "";
  const filtered: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      filtered[key] = String(value);
    }
  });
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `?${qs}` : "";
};

// ============================================
// Graduation Rules
// ============================================

export async function getGraduationRules(): Promise<GraduationRuleSetWithId> {
  const res = await apiRequest("/api/v1/school-admin/graduation/rules");
  return res.data ?? res;
}

export async function createGraduationRules(payload: GraduationRuleSet): Promise<GraduationRuleSetWithId> {
  const res = await apiRequest("/api/v1/school-admin/graduation/rules", {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}

export async function updateGraduationRules(
  ruleSetId: string,
  payload: Partial<GraduationRuleSet>
): Promise<GraduationRuleSetWithId> {
  const res = await apiRequest(`/api/v1/school-admin/graduation/rules/${ruleSetId}`, {
    method: "PUT",
    data: payload,
  });
  return res.data ?? res;
}

// ============================================
// Graduation Progress
// ============================================

export async function getStudentGraduationProgress(
  studentId: string
): Promise<StudentGraduationProgress> {
  const res = await apiRequest(`/api/v1/school-admin/graduation/progress/${studentId}`);
  return res.data ?? res;
}

export async function getAllGraduationProgress(params?: {
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
}): Promise<GraduationProgressResponse> {
  const res = await apiRequest(
    `/api/v1/school-admin/graduation/progress${buildQueryString(params as Record<string, string | number | undefined>)}`
  );
  return res.data ?? res;
}
