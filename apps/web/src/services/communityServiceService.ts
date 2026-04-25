import type {
  CommunityServiceSummary,
  CommunityServiceEntry,
  CommunityServicePayload,
  CommunityServiceVerifyPayload,
} from "@/types/communityService";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

function getHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// ─── Student: own community service hours ─────────────────────────

export async function getMyCommunityService(): Promise<CommunityServiceSummary> {
  const res = await fetch(`${API_BASE}/api/v1/student/community-service`, {
    headers: getHeaders(),
  });
  return handleResponse<CommunityServiceSummary>(res);
}

export async function logCommunityService(
  payload: CommunityServicePayload
): Promise<CommunityServiceEntry> {
  const res = await fetch(`${API_BASE}/api/v1/student/community-service`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CommunityServiceEntry>(res);
}

// ─── Admin/Counselor: view & verify student hours ──────────────────

export async function getStudentCommunityService(
  studentId: string
): Promise<CommunityServiceSummary> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/community-service`,
    { headers: getHeaders() }
  );
  return handleResponse<CommunityServiceSummary>(res);
}

export async function verifyCommunityServiceEntry(
  entryId: string,
  payload: CommunityServiceVerifyPayload
): Promise<CommunityServiceEntry> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/community-service/${entryId}/verify`,
    {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  );
  return handleResponse<CommunityServiceEntry>(res);
}
