import type {
  AssessmentConfigResponse,
  AssessmentConfigPayload,
  AssessmentStatusSummary,
} from "@/types/assessmentConfig";
import { apiRequest } from "@/lib/api/apiClient";

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), toCamel(v)])
    );
  }
  return obj;
}

export async function getAssessmentConfig(): Promise<AssessmentConfigResponse> {
  const res = await apiRequest("/api/v1/school-admin/assessments/config");
  return toCamel(res.data ?? res) as AssessmentConfigResponse;
}

export async function updateAssessmentConfig(payload: AssessmentConfigPayload): Promise<AssessmentConfigResponse> {
  const res = await apiRequest("/api/v1/school-admin/assessments/config", {
    method: "PUT",
    data: payload,
  });
  return toCamel(res.data ?? res) as AssessmentConfigResponse;
}

export async function getAssessmentStatus(): Promise<AssessmentStatusSummary> {
  const res = await apiRequest("/api/v1/school-admin/assessments/status");
  return toCamel(res.data ?? res) as AssessmentStatusSummary;
}
