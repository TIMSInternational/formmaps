import { apiRequest } from "@/lib/api/apiClient";

export async function saveIsamsConfig(schoolId: string, payload: Record<string, unknown>) {
  return await apiRequest(
    `/api/v1/school-admin/integrations/isams?schoolId=${encodeURIComponent(schoolId)}`,
    { method: "POST", data: payload }
  );
}

export async function getIsamsStatus(schoolId: string) {
  try {
    return await apiRequest(
      `/api/v1/school-admin/integrations/isams/status?schoolId=${encodeURIComponent(schoolId)}`
    );
  } catch {
    return { connected: false };
  }
}

export async function triggerIsamsSync(schoolId: string) {
  return await apiRequest(
    `/api/v1/school-admin/integrations/isams/sync?schoolId=${encodeURIComponent(schoolId)}`,
    { method: "POST" }
  );
}
