import { apiRequest } from "@/lib/api/apiClient";
import type {
  ChildProgressSummary,
  ParentProfile,
  ParentInviteRequest,
  StudentParentLink,
  ParentNotification,
  ParentRelationship,
} from "@/types/parentPortal";

const getCurrentLanguage = (): string => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
};

// Parent profile
export async function getParentProfile(): Promise<ParentProfile> {
  const res = await apiRequest("/api/v1/parent/profile");
  return res.data ?? res;
}

// Child progress summary
export async function getChildProgress(
  studentId: string
): Promise<ChildProgressSummary> {
  const res = await apiRequest(
    `/api/v1/parent/children/${studentId}/progress`
  );
  return res.data ?? res;
}

// Get pending 360 evaluations for parent
export async function getParentPendingEvaluations(): Promise<
  { evaluationId: string; studentName: string; deadline: string; token: string }[]
> {
  const res = await apiRequest("/api/v1/parent/evaluations/pending");
  return res.data ?? res;
}

// ─── Parent Invitation (called by school-admin / counselor) ──────────────────

// List all parents/guardians linked to a student
export async function getStudentParents(
  studentId: string
): Promise<StudentParentLink[]> {
  const res = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/parents`
  );
  return res.data ?? res;
}

// Invite a parent/guardian to a student's portal
export async function inviteParentToStudent(
  payload: ParentInviteRequest
): Promise<{ inviteId: string; message: string }> {
  const { studentId, ...body } = payload;
  const res = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/parents/invite`,
    { method: "POST", data: body }
  );
  return res.data ?? res;
}

// Revoke a parent's access from a student
export async function revokeParentAccess(
  studentId: string,
  parentLinkId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/school-admin/students/${studentId}/parents/${parentLinkId}`,
    { method: "DELETE" }
  );
}

// Resend a pending invite
export async function resendParentInvite(
  studentId: string,
  parentLinkId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/school-admin/students/${studentId}/parents/${parentLinkId}/resend`,
    { method: "POST" }
  );
}

// ─── Student Self-Invitation (called by student) ─────────────────────────────

// List all parents/guardians linked to the current student
export async function getMyParents(): Promise<StudentParentLink[]> {
  const res = await apiRequest("/api/v1/student/parents");
  return res.data ?? res;
}

// Invite a parent/guardian to the current student's portal
export async function inviteMyParent(
  payload: Omit<ParentInviteRequest, "studentId">
): Promise<{ inviteId: string; message: string }> {
  const res = await apiRequest("/api/v1/student/parents/invite", {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}

// Revoke a parent's access from the current student
export async function revokeMyParentAccess(
  parentLinkId: string
): Promise<void> {
  await apiRequest(`/api/v1/student/parents/${parentLinkId}`, {
    method: "DELETE",
  });
}

// Resend a pending invite for the current student
export async function resendMyParentInvite(
  parentLinkId: string
): Promise<void> {
  await apiRequest(`/api/v1/student/parents/${parentLinkId}/resend`, {
    method: "POST",
  });
}

// ─── Parent Notifications ────────────────────────────────────────────────────

export async function getParentNotifications(): Promise<ParentNotification[]> {
  const res = await apiRequest("/api/v1/parent/notifications");
  return res.data ?? res;
}

export async function markParentNotificationRead(id: string): Promise<void> {
  await apiRequest(`/api/v1/parent/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllParentNotificationsRead(): Promise<void> {
  await apiRequest("/api/v1/parent/notifications/read-all", {
    method: "PATCH",
  });
}

// ─── Parent Onboarding (token-based, public) ─────────────────────────────────

export interface ParentInviteTokenResponse {
  email: string;
  studentName: string;
  relationship: ParentRelationship;
  schoolName: string;
  invitedBy: string;
  inviterRole: string;
}

export interface ParentOnboardingPayload {
  token: string;
  password: string;
  name: string;
}

export interface ParentOnboardingResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

/** Verify parent invite token — public, no auth needed */
export async function verifyParentInviteToken(
  token: string
): Promise<ParentInviteTokenResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(
    `${baseUrl}/api/v1/parent/onboarding/verify?token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ParentInviteTokenResponse;
}

/** Complete parent account creation — public, no auth needed */
export async function completeParentOnboarding(
  payload: ParentOnboardingPayload
): Promise<ParentOnboardingResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(`${baseUrl}/api/v1/parent/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ParentOnboardingResult;
}
