import type {
  CommunityServiceSummary,
  CommunityServiceEntry,
  CommunityServicePayload,
  CommunityServiceUpdatePayload,
  CommunityServiceVerifyPayload,
} from "@/types/communityService";
import { apiRequest } from "@/lib/api/apiClient";

// Backend shapes differ per endpoint (student: {data:[…],totalHours};
// admin: bare entries[]) and hours come back as Decimal strings. Normalize
// everything into the CommunityServiceSummary the pages render.
function toSummary(payload: unknown): CommunityServiceSummary {
  const p = (payload ?? {}) as Record<string, unknown>;
  const rawEntries = Array.isArray(payload) ? payload : (p.entries ?? p.data ?? []);
  const entries = (Array.isArray(rawEntries) ? rawEntries : []).map((e) => ({
    ...(e as CommunityServiceEntry),
    hours: Number((e as { hours: unknown }).hours) || 0,
  }));
  const logged =
    typeof p.totalHoursLogged === "number" ? p.totalHoursLogged :
    typeof p.totalHours === "number" ? p.totalHours :
    entries.reduce((s, e) => s + e.hours, 0);
  const verified =
    typeof p.totalHoursVerified === "number"
      ? p.totalHoursVerified
      : entries.filter((e) => e.status === "verified").reduce((s, e) => s + e.hours, 0);
  return {
    totalHoursRequired: typeof p.totalHoursRequired === "number" ? p.totalHoursRequired : 0,
    totalHoursLogged: logged,
    totalHoursVerified: verified,
    entries,
  };
}

// ─── Student: own community service hours ─────────────────────────

export async function getMyCommunityService(): Promise<CommunityServiceSummary> {
  const res = await apiRequest("/api/v1/student/community-service");
  return toSummary(res.data ?? res);
}

export async function logCommunityService(
  payload: CommunityServicePayload
): Promise<CommunityServiceEntry> {
  const res = await apiRequest("/api/v1/student/community-service", {
    method: "POST",
    data: payload,
  });
  return (res.data ?? res) as CommunityServiceEntry;
}

// ─── Admin/Counselor: view & verify student hours ──────────────────

export async function getStudentCommunityService(
  studentId: string
): Promise<CommunityServiceSummary> {
  const res = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/community-service`
  );
  return toSummary(res.data ?? res);
}

export async function verifyCommunityServiceEntry(
  entryId: string,
  payload: CommunityServiceVerifyPayload
): Promise<CommunityServiceEntry> {
  const res = await apiRequest(
    `/api/v1/school-admin/community-service/${entryId}/verify`,
    { method: "PUT", data: payload }
  );
  return (res.data ?? res) as CommunityServiceEntry;
}

// ─── Student: edit and delete own entries ─────────────────────────

export async function updateCommunityService(
  entryId: string,
  payload: CommunityServiceUpdatePayload
): Promise<CommunityServiceEntry> {
  const res = await apiRequest(`/api/v1/student/community-service/${entryId}`, {
    method: "PUT",
    data: payload,
  });
  return (res.data ?? res) as CommunityServiceEntry;
}

export async function deleteCommunityService(
  entryId: string
): Promise<CommunityServiceEntry> {
  const res = await apiRequest(`/api/v1/student/community-service/${entryId}`, {
    method: "DELETE",
  });
  return (res.data ?? res) as CommunityServiceEntry;
}
