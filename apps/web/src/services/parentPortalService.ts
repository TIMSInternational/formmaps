import { apiClient, apiRequest } from "@/lib/api/apiClient";
import { namedOrNull } from "./teacherPortalService";
import type {
  ChildProgressSummary,
  ChildResults,
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
    creditProgress?: { earned?: number; required?: number | null; percentage?: number | null };
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
    // null means the school has not configured a graduation rule set. Collapsing it to 0
    // renders "18 / 0 credits" and a 0% bar, which reads as a requirement of zero rather
    // than an unknown one — and reverts the server-side fix at the UI layer.
    creditsRequired: d.creditProgress?.required ?? null,
    creditPercentage: d.creditProgress?.percentage ?? null,
    assessmentStatus: { completed: completedCount, total: 3 },
  };
}

/** The linked child's results (audit E1). 403 when the link is gone, 402 when the child's results are unpaid. */
export async function getChildResults(studentId: string, lang: "es" | "en"): Promise<ChildResults> {
  const res = await apiRequest(`/api/v1/parent/children/${studentId}/results?lang=${lang}`);
  return (res.data ?? res) as ChildResults;
}

/** The child's Career & University report PDF. */
export async function getChildReportBlob(studentId: string, lang: "es" | "en"): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url: `/api/v1/parent/children/${studentId}/report/pdf?lang=${lang}`,
    method: "GET",
    responseType: "blob",
  });
  return response.data;
}

// Get pending 360 evaluations for parent
export async function getParentPendingEvaluations(): Promise<
  { evaluationId: string; studentName: string | null; deadline: string; token: string }[]
> {
  const res = await apiRequest("/api/v1/parent/evaluations/pending");
  const items = res?.data ?? res ?? [];
  // null name → the page says "your student" in the viewer's language (audit F).
  return Array.isArray(items)
    ? items.map((e: { evaluationId: string; studentName: string | null; deadline: string; token: string }) => ({ ...e, studentName: namedOrNull(e.studentName) }))
    : [];
}

// ─── Parent Invitation (called by school-admin / counselor) ──────────────────

/**
 * Which backend surface the student-parents panel talks to. The school-admin routes need
 * `school:manage`, so a counselor got a 403 on every call (audit 2026-10-09 C9); counselors use
 * the caseload-checked routes instead.
 */
export type ParentPanelScope = "school-admin" | "counselor";

/**
 * What every invite/resend answers (audit 2026-10-09 C8b): the invitation link is EMAILED to the
 * parent and never returned. `alreadyLinked` = the address already belongs to a parent account and
 * was attached directly (C8) — `emailSent` then refers to the "you've been linked" notice.
 */
export interface ParentInviteResult {
  id?: string;
  emailSent: boolean;
  alreadyLinked?: boolean;
}

type RawParentLink = Partial<StudentParentLink> & {
  parentEmail?: string;
  parentName?: string;
  relation?: string;
  isAccepted?: boolean;
  tokenExpiresAt?: string | null;
  createdDate?: string;
  acceptedAt?: string | null;
  parentUserId?: string | null;
};

/**
 * The panel renders `{ name, email, relationship, status }`. The school-admin and counselor routes
 * already answer that shape; GET /student/parents answers raw link rows. Accept both.
 */
export function toStudentParentLink(row: RawParentLink): StudentParentLink {
  if (row.status && row.email !== undefined) return row as StudentParentLink;
  const expired = !!row.tokenExpiresAt && new Date(row.tokenExpiresAt).getTime() < Date.now();
  return {
    id: row.id ?? "",
    name: row.name ?? row.parentName ?? "",
    email: row.email ?? row.parentEmail ?? "",
    relationship: (row.relationship ?? row.relation ?? "other") as ParentRelationship,
    status: row.isAccepted ? "accepted" : expired ? "expired" : "pending",
    invitedAt: row.invitedAt ?? row.createdDate ?? "",
    acceptedAt: row.acceptedAt ?? undefined,
    parentUserId: row.parentUserId ?? undefined,
  };
}

const asRows = (res: { data?: unknown } | unknown): StudentParentLink[] => {
  const body = (res as { data?: unknown })?.data ?? res;
  return Array.isArray(body) ? body.map((r) => toStudentParentLink(r as RawParentLink)) : [];
};

// List all parents/guardians linked to a student
export async function getStudentParents(
  studentId: string,
  scope: ParentPanelScope = "school-admin"
): Promise<StudentParentLink[]> {
  const res = await apiRequest(
    scope === "counselor"
      ? `/api/v1/counselor/students/${studentId}/parents`
      : `/api/v1/school-admin/students/${studentId}/parents`
  );
  return asRows(res);
}

// Invite a parent/guardian to a student's portal
export async function inviteParentToStudent(
  payload: ParentInviteRequest,
  scope: ParentPanelScope = "school-admin"
): Promise<ParentInviteResult> {
  const { studentId, ...body } = payload;
  const res =
    scope === "counselor"
      ? // Caseload-checked for counselors (routes/parent.ts POST /invite).
        await apiRequest("/api/v1/parent/invite", {
          method: "POST",
          data: { studentId, parentEmail: body.email, parentName: body.name, relation: body.relationship },
        })
      : await apiRequest(`/api/v1/school-admin/students/${studentId}/parents/invite`, {
          method: "POST",
          data: body,
        });
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
  parentLinkId: string,
  scope: ParentPanelScope = "school-admin"
): Promise<ParentInviteResult> {
  const res = await apiRequest(
    scope === "counselor"
      ? `/api/v1/parent/${parentLinkId}/resend`
      : `/api/v1/school-admin/students/${studentId}/parents/${parentLinkId}/resend`,
    { method: "POST" }
  );
  return res?.data ?? res;
}

// ─── Student Self-Invitation (called by student) ─────────────────────────────

// List all parents/guardians linked to the current student
export async function getMyParents(): Promise<StudentParentLink[]> {
  return asRows(await apiRequest("/api/v1/student/parents"));
}

// Invite a parent/guardian to the current student's portal. The route reads
// { parentEmail, parentName, relation } — the form's { email, name, relationship } was
// answered "parentEmail required", so this never worked from the UI.
export async function inviteMyParent(
  payload: Omit<ParentInviteRequest, "studentId">
): Promise<ParentInviteResult> {
  const res = await apiRequest("/api/v1/student/parents/invite", {
    method: "POST",
    data: { parentEmail: payload.email, parentName: payload.name, relation: payload.relationship },
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
): Promise<ParentInviteResult> {
  const res = await apiRequest(`/api/v1/student/parents/${parentLinkId}/resend`, {
    method: "POST",
  });
  return res?.data ?? res;
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
