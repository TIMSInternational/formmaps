import {
  School,
  SchoolInvitePayload,
  SchoolsResponse,
  SchoolStats,
  SchoolAdminOnboardingStatus,
  SchoolAdminOnboardingData,
} from "@/types/school";
import { apiRequest } from "@/lib/api/apiClient";

export async function getSchools(
  params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {},
): Promise<SchoolsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());
  if (params.search) query.append("search", params.search);

  const qs = query.toString();
  return apiRequest(`/api/v1/admin/schools${qs ? `?${qs}` : ""}`);
}

// audit 2026-10-09 E4 — Super Admin coverage report (GET /api/v1/admin/coverage, Node).
export type SchoolCoverageReason =
  | "active_contract"
  | "school_inactive"
  | "status_not_active"
  | "no_end_date"
  | "not_started"
  | "expired";

export interface SchoolCoverageRow {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  contractStartDate: string | null;
  contractEndDate: string | null;
  timezone: string;
  covered: boolean;
  reason: SchoolCoverageReason;
  students: number;
  coveredBySchool: number;
  coveredBySubscription: number;
  notCovered: number;
}

export interface CoverageReportResponse {
  success: boolean;
  data: SchoolCoverageRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  paywallEnabled: boolean;
  generatedAt: string;
}

export async function getCoverageReport(
  params: { page?: number; limit?: number } = {},
): Promise<CoverageReportResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());
  const qs = query.toString();
  return apiRequest(`/api/v1/admin/coverage${qs ? `?${qs}` : ""}`);
}

export async function inviteSchool(
  data: SchoolInvitePayload,
): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/v1/admin/schools/invite", {
    method: "POST",
    data,
  });
}

export async function updateSchool(
  schoolId: string,
  data: Partial<SchoolInvitePayload>,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/admin/schools/${schoolId}`, {
    method: "PUT",
    data,
  });
}

export async function resendSchoolInvite(
  schoolId: string,
): Promise<{ invitationUrl?: string; emailSent?: boolean }> {
  const res = await apiRequest(`/api/v1/admin/schools/${schoolId}/invite`, {
    method: "POST",
  });
  return res?.data ?? res;
}

export async function getSchoolStats(): Promise<SchoolStats> {
  try {
    const res = await apiRequest("/api/v1/admin/schools/stats");
    return res.data || res;
  } catch (error) {
    throw error;
  }
}

export async function toggleSchoolFeature(
  schoolId: string,
  features: { videoCallsEnabled?: boolean },
): Promise<{ success: boolean; data: { id: string; videoCallsEnabled: boolean } }> {
  return apiRequest(`/api/v1/admin/schools/${schoolId}/features`, {
    method: "PUT",
    data: features,
  });
}

// ============================================
// School Admin Onboarding
// ============================================

// Audit 2026-10-09 C1: these called /api/v1/school-admin/{token}/onboarding(-status), which existed in
// neither backend — every school invitation dead-ended. The real endpoints live under /authapi.

/** The invitation behind a token. An unknown or already-used token is a 404 → `isValid: false`. */
export async function getSchoolAdminOnboardingStatus(
  token: string,
): Promise<SchoolAdminOnboardingStatus> {
  try {
    const res = await apiRequest<{ data: { schoolName: string; email: string; maxStudents: number; status: "pending" | "expired" } }>(
      `/authapi/school-admin/invite-status?token=${encodeURIComponent(token)}`,
      { showErrorToast: false },
    );
    const d = res.data;
    return { userId: "", email: d.email, schoolName: d.schoolName, maxStudents: d.maxStudents, status: d.status, isValid: d.status === "pending" };
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return { userId: "", email: "", schoolName: "", maxStudents: 0, status: "expired", isValid: false };
    }
    throw err;
  }
}

export interface SchoolAdminSession {
  token: string;
  user: { id: string; email: string; name: string; role: { name: string }; schoolId: string; permissions: string[] };
}

/** Sets the admin's password and name, activates the school, and returns a signed-in session. */
export async function submitSchoolAdminOnboarding(
  token: string,
  data: Pick<SchoolAdminOnboardingData, "password"> & { adminInfo: Pick<SchoolAdminOnboardingData["adminInfo"], "name"> },
): Promise<SchoolAdminSession> {
  const res = await apiRequest<{ data: SchoolAdminSession }>(`/authapi/school-admin/complete-registration`, {
    method: "POST",
    data: { token, password: data.password, name: data.adminInfo.name.trim() },
    showErrorToast: false,
  });
  return res.data;
}
