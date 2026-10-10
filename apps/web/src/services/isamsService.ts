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

export interface IsamsTestResult {
  connected: boolean;
  message: string;
}

// audit 2026-10-09 C17: "Test connection" used to read the cached status (or just check the URL
// started with "http") — it never contacted iSAMS. This calls the real test endpoint. With no
// apiKey, the server tests the school's stored credentials. Errors propagate to the caller.
export async function testIsamsConnection(
  schoolId: string,
  payload: { endpoint: string; apiKey?: string }
): Promise<IsamsTestResult> {
  const res = await apiRequest(
    `/api/v1/school-admin/integrations/isams/test?schoolId=${encodeURIComponent(schoolId)}`,
    {
      method: "POST",
      data: { endpoint: payload.endpoint, authType: "api_key", ...(payload.apiKey ? { credentials: payload.apiKey } : {}) },
    }
  );
  const data = res?.data ?? res;
  return { connected: !!data?.connected, message: typeof data?.message === "string" ? data.message : "" };
}

export async function triggerIsamsSync(schoolId: string) {
  return await apiRequest(
    `/api/v1/school-admin/integrations/isams/sync?schoolId=${encodeURIComponent(schoolId)}`,
    { method: "POST" }
  );
}
