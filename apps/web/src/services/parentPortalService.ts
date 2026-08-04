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

// Child progress summary.
// The API returns a nested shape ({ student, creditProgress, assessments });
// flatten it to the summary the page renders. Without this map the page read
// undefined for name/credits/isOnTrack → blank title + permanent "At Risk".
export async function getChildProgress(
  studentId: string
): Promise<ChildProgressSummary> {
  const res = await apiRequest(
    `/api/v1/parent/children/${studentId}/progress`
  );
  const d = (res.data ?? res) as {
    student?: { id?: string; name?: string; gradeLevel?: number };
    gpa?: number | null;
    isOnTrack?: boolean;
    creditProgress?: { earned?: number; required?: number; percentage?: number };
    assessments?: {
      pca?: { completed?: boolean };
      mil?: { completed?: number; total?: number };
      evaluation360?: { completed?: number; total?: number };
    };
  };
  const a = d.assessments ?? {};
  const completedCount =
    (a.pca?.completed ? 1 : 0) +
    ((a.mil?.completed ?? 0) >= (a.mil?.total ?? 5) ? 1 : 0) +
    ((a.evaluation360?.total ?? 0) > 0 && (a.evaluation360?.completed ?? 0) >= (a.evaluation360?.total ?? 0) ? 1 : 0);
  return {
    studentId: d.student?.id ?? studentId,
    studentName: d.student?.name ?? "",
    gradeLevel: d.student?.gradeLevel ?? 0,
    gpa: d.gpa ?? null, // keep null so the page shows "N/A", not a fake "0.00"
    isOnTrack: d.isOnTrack ?? true,
    creditsEarned: d.creditProgress?.earned ?? 0,
    creditsRequired: d.creditProgress?.required ?? 0,
    creditPercentage: d.creditProgress?.percentage ?? 0,
    assessmentStatus: { completed: completedCount, total: 3 },
    careerPath: "",
    recentActivity: [],
    pendingActions: [],
  };
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

// GET /parent/notifications answers with a paginated envelope — the body is
// `{ data: { data: [...], total, page, limit } }`, so `res.data` is the ENVELOPE, not
// the rows. Returning it as-is handed the page an object where it expected an array,
// and the page's `Array.isArray(...) ? ... : []` guard then rendered "all caught up"
// no matter how many notifications the parent had.
export async function getParentNotifications(): Promise<ParentNotification[]> {
  const res = await apiRequest("/api/v1/parent/notifications");
  const envelope = res.data ?? res;
  const rows = Array.isArray(envelope) ? envelope : envelope?.data;
  return Array.isArray(rows) ? rows : [];
}

export async function markParentNotificationRead(id: string): Promise<void> {
  await apiRequest(`/api/v1/parent/notifications/${id}/read`, {
    method: "PUT",
  });
}

export async function markAllParentNotificationsRead(): Promise<void> {
  await apiRequest("/api/v1/parent/notifications/read-all", {
    method: "PUT",
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
