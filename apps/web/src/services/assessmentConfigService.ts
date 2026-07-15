import type {
  AssessmentConfigResponse,
  AssessmentConfigPayload,
  AssessmentStatusSummary,
} from "@/types/assessmentConfig";
import { apiRequest } from "@/lib/api/apiClient";
import { toCamel } from "@/lib/toCamel";

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
