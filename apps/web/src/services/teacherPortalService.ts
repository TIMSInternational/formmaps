import { apiRequest } from "@/lib/api/apiClient";
import i18n from "@/lib/i18n";

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
  /** null when the student has no name — render t("evaluations.yourStudent"). */
  studentName: string | null;
  deadline: string;
  token: string;
}

// Teacher profile (school + identity)
export async function getTeacherProfile(): Promise<TeacherProfile> {
  const res = await apiRequest("/api/v1/teacher/profile");
  return res.data ?? res;
}

/** A real student name, or null. Older APIs sent the English placeholder "your student" for a missing name. */
export function namedOrNull(name: string | null | undefined): string | null {
  return name && name !== "your student" ? name : null;
}

// Pending 360 evaluations where the teacher is the evaluator
export async function getTeacherPendingEvaluations(): Promise<TeacherPendingEvaluation[]> {
  const res = await apiRequest("/api/v1/teacher/evaluations/pending");
  const items = res?.data ?? res ?? [];
  return Array.isArray(items) ? items.map((e: TeacherPendingEvaluation) => ({ ...e, studentName: namedOrNull(e.studentName) })) : [];
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
        ? i18n.t("onboarding.inviteErrors.expired", { ns: "teacher" })
        : data.status === "used"
        ? i18n.t("onboarding.inviteErrors.used", { ns: "teacher" })
        : i18n.t("onboarding.inviteErrors.invalid", { ns: "teacher" })
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
