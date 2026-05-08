import type {
  CommunityServiceSummary,
  CommunityServiceEntry,
  CommunityServicePayload,
  CommunityServiceVerifyPayload,
} from "@/types/communityService";
import { apiRequest } from "@/lib/api/apiClient";

// ─── Student: own community service hours ─────────────────────────

export async function getMyCommunityService(): Promise<CommunityServiceSummary> {
  const res = await apiRequest("/api/v1/student/community-service");
  return (res.data ?? res) as CommunityServiceSummary;
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
  return (res.data ?? res) as CommunityServiceSummary;
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
