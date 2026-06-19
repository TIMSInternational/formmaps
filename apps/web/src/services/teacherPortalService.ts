import { apiRequest } from "@/lib/api/apiClient";

// ============================================
// Teacher Portal Types
// ============================================

export interface TeacherProfile {
  id: string;
  name: string;
  email: string;
  schoolId: string | null;
  schoolName: string | null;
}

export interface TeacherPendingEvaluation {
  evaluationId: string;
  studentName: string;
  deadline: string;
  token: string;
}

// Teacher profile (school + identity)
export async function getTeacherProfile(): Promise<TeacherProfile> {
  const res = await apiRequest("/api/v1/teacher/profile");
  return res.data ?? res;
}

// Pending 360 evaluations where the teacher is the evaluator
export async function getTeacherPendingEvaluations(): Promise<TeacherPendingEvaluation[]> {
  const res = await apiRequest("/api/v1/teacher/evaluations/pending");
  const items = res?.data ?? res ?? [];
  return Array.isArray(items) ? items : [];
}

// ─── Teacher Onboarding (token-based, public) ────────────────────────────────

export interface TeacherInviteTokenResponse {
  isValid: boolean;
  status: "valid" | "invalid" | "expired" | "used";
  email?: string;
  schoolName?: string;
  expiresAt?: string;
}

export interface TeacherOnboardingPayload {
  token: string;
  password: string;
  name: string;
}

export interface TeacherOnboardingResult {
  userId?: string;
  token: string;
  refreshToken?: string;
  redirectUrl?: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleId: string;
    roleName: string;
    permissions?: string[];
  };
}

/** Verify teacher invite token — public, no auth needed */
export async function verifyTeacherInviteToken(
  token: string
): Promise<TeacherInviteTokenResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(
    `${baseUrl}/api/v1/teacher/onboarding/verify?token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  const data = (json.data ?? json) as TeacherInviteTokenResponse;
  // The verify endpoint returns 200 with isValid:false for invalid/expired/used
  // tokens — surface that as an error so the onboarding page shows the right state.
  if (!data.isValid) {
    throw new Error(
      data.status === "expired"
        ? "This invitation has expired."
        : data.status === "used"
        ? "This invitation has already been used."
        : "This invitation link is invalid."
    );
  }
  return data;
}

/** Complete teacher account creation — public, no auth needed */
export async function completeTeacherOnboarding(
  payload: TeacherOnboardingPayload
): Promise<TeacherOnboardingResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(`${baseUrl}/api/v1/teacher/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as TeacherOnboardingResult;
}
