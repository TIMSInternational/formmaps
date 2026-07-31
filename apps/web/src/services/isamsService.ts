import { apiRequest } from "@/lib/api/apiClient";

export async function saveIsamsConfig(schoolId: string, payload: Record<string, unknown>) {
  return await apiRequest(
    `/api/v1/school-admin/integrations/isams?schoolId=${encodeURIComponent(schoolId)}`,
    { method: "POST", data: payload }
  );
}

export interface IsamsStatus {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  lastSyncAt: string | null;
}

export async function getIsamsStatus(schoolId: string): Promise<IsamsStatus> {
  try {
    const res = await apiRequest(
      `/api/v1/school-admin/integrations/isams/status?schoolId=${encodeURIComponent(schoolId)}`
    );
    // apiRequest resolves to the {success, data} envelope — unwrap it.
    const status = res?.data ?? res;
    return {
      configured: !!status?.configured,
      enabled: !!status?.enabled,
      connected: !!status?.connected,
      lastSyncAt: status?.lastSyncAt ?? null,
    };
  } catch {
    return { configured: false, enabled: false, connected: false, lastSyncAt: null };
  }
}

export async function triggerIsamsSync(schoolId: string) {
  return await apiRequest(
    `/api/v1/school-admin/integrations/isams/sync?schoolId=${encodeURIComponent(schoolId)}`,
    { method: "POST" }
  );
}
