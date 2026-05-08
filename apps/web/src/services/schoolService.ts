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
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/admin/schools/${schoolId}/invite`, {
    method: "POST",
  });
}

export async function getSchoolStats(): Promise<SchoolStats> {
  try {
    const res = await apiRequest("/api/v1/admin/schools/stats");
    return res.data || res;
  } catch (error) {
    throw error;
  }
}

// ============================================
// School Admin Onboarding
// ============================================

export async function getSchoolAdminOnboardingStatus(
  token: string,
): Promise<SchoolAdminOnboardingStatus> {
  const res = await apiRequest(`/api/v1/school-admin/${token}/onboarding-status`);
  return res.data;
}

export async function submitSchoolAdminOnboarding(
  token: string,
  data: SchoolAdminOnboardingData,
): Promise<{ success: boolean; redirectUrl: string }> {
  return apiRequest(`/api/v1/school-admin/${token}/onboarding`, {
    method: "POST",
    data,
  });
}
