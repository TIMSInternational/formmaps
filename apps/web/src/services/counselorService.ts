import { apiRequest } from "@/lib/api/apiClient";

// Counselor dashboard (counselor-scoped)
export async function getCounselorDashboard(): Promise<any> {
  const res = await apiRequest(`/api/v1/counselor/dashboard`);
  return res.data ?? res;
}

// Counselor dashboard: pending change requests across all assigned students
export async function getCounselorDashboardChangeRequests(): Promise<any> {
  const res = await apiRequest(`/api/v1/counselor/dashboard/change-requests?limit=30`);
  return res.data ?? res;
}

// ============================================
// Counselor Onboarding
// ============================================

export interface CounselorTokenVerifyResponse {
  email: string;
  invitedBy: string;
  assignAll: boolean;
  assignedStudentCount: number;
  schoolName?: string;
}

export interface CounselorOnboardingPayload {
  token: string;
  password: string;
  name: string;
  // Sent flat (not wrapped in profile object) — confirmed from backend Postman collection
  phone?: string;
  timezone?: string;
}

export interface CounselorOnboardingResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    schoolId: string;
  };
}

export async function verifyCounselorToken(
  token: string
): Promise<CounselorTokenVerifyResponse> {
  const res = await apiRequest(
    `/api/v1/counselor/onboarding/verify?token=${encodeURIComponent(token)}`
  );
  return res.data ?? res;
}

export async function completeCounselorOnboarding(
  payload: CounselorOnboardingPayload
): Promise<CounselorOnboardingResult> {
  const res = await apiRequest(`/api/v1/counselor/onboarding/complete`, {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}
