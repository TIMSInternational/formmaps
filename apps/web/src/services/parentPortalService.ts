import type {
  ChildProgressSummary,
  ParentProfile,
  ParentInviteRequest,
  StudentParentLink,
  ParentNotification,
  ParentRelationship,
} from "@/types/parentPortal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getCurrentLanguage = (): string => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
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

// Parent profile
export async function getParentProfile(): Promise<ParentProfile> {
  const res = await fetch(`${API_BASE}/api/v1/parent/profile`, {
    headers: getHeaders(),
  });
  return handleResponse<ParentProfile>(res);
}

// Child progress summary
export async function getChildProgress(
  studentId: string
): Promise<ChildProgressSummary> {
  const res = await fetch(
    `${API_BASE}/api/v1/parent/children/${studentId}/progress`,
    { headers: getHeaders() }
  );
  return handleResponse<ChildProgressSummary>(res);
}

// Get pending 360 evaluations for parent
export async function getParentPendingEvaluations(): Promise<
  { evaluationId: string; studentName: string; deadline: string; token: string }[]
> {
  const res = await fetch(`${API_BASE}/api/v1/parent/evaluations/pending`, {
    headers: getHeaders(),
  });
  return handleResponse<
    { evaluationId: string; studentName: string; deadline: string; token: string }[]
  >(res);
}

// ─── Parent Invitation (called by school-admin / counselor) ──────────────────

// List all parents/guardians linked to a student
export async function getStudentParents(
  studentId: string
): Promise<StudentParentLink[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/parents`,
    { headers: getHeaders() }
  );
  return handleResponse<StudentParentLink[]>(res);
}

// Invite a parent/guardian to a student's portal
export async function inviteParentToStudent(
  payload: ParentInviteRequest
): Promise<{ inviteId: string; message: string }> {
  const { studentId, ...body } = payload;
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/parents/invite`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    }
  );
  return handleResponse<{ inviteId: string; message: string }>(res);
}

// Revoke a parent's access from a student
export async function revokeParentAccess(
  studentId: string,
  parentLinkId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/parents/${parentLinkId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );
  return handleResponse<void>(res);
}

// Resend a pending invite
export async function resendParentInvite(
  studentId: string,
  parentLinkId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/parents/${parentLinkId}/resend`,
    {
      method: "POST",
      headers: getHeaders(),
    }
  );
  return handleResponse<void>(res);
}

// ─── Student Self-Invitation (called by student) ─────────────────────────────

// List all parents/guardians linked to the current student
export async function getMyParents(): Promise<StudentParentLink[]> {
  const res = await fetch(`${API_BASE}/api/v1/student/parents`, {
    headers: getHeaders(),
  });
  return handleResponse<StudentParentLink[]>(res);
}

// Invite a parent/guardian to the current student's portal
export async function inviteMyParent(
  payload: Omit<ParentInviteRequest, "studentId">
): Promise<{ inviteId: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/v1/student/parents/invite`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ inviteId: string; message: string }>(res);
}

// Revoke a parent's access from the current student
export async function revokeMyParentAccess(
  parentLinkId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/student/parents/${parentLinkId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );
  return handleResponse<void>(res);
}

// Resend a pending invite for the current student
export async function resendMyParentInvite(
  parentLinkId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/student/parents/${parentLinkId}/resend`,
    {
      method: "POST",
      headers: getHeaders(),
    }
  );
  return handleResponse<void>(res);
}

// ─── Parent Notifications ────────────────────────────────────────────────────

export async function getParentNotifications(): Promise<ParentNotification[]> {
  const res = await fetch(`${API_BASE}/api/v1/parent/notifications`, {
    headers: getHeaders(),
  });
  return handleResponse<ParentNotification[]>(res);
}

export async function markParentNotificationRead(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/parent/notifications/${id}/read`,
    { method: "PATCH", headers: getHeaders() }
  );
  return handleResponse<void>(res);
}

export async function markAllParentNotificationsRead(): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/parent/notifications/read-all`,
    { method: "PATCH", headers: getHeaders() }
  );
  return handleResponse<void>(res);
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
  const res = await fetch(
    `${API_BASE}/api/v1/parent/onboarding/verify?token=${encodeURIComponent(token)}`
  );
  return handleResponse<ParentInviteTokenResponse>(res);
}

/** Complete parent account creation — public, no auth needed */
export async function completeParentOnboarding(
  payload: ParentOnboardingPayload
): Promise<ParentOnboardingResult> {
  const res = await fetch(`${API_BASE}/api/v1/parent/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ParentOnboardingResult>(res);
}

