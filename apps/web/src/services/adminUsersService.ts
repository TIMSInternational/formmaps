import { apiRequest } from "@/lib/api/apiClient";
import { currentLanguage } from "@/lib/i18n/currentLanguage";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedDate: string;
  subscriptionStatus: "active" | "expired" | "none";
  /**
   * Whether the person has finished setting up. An invited account is `isActive` from the
   * moment it is invited, so `status` alone cannot tell "onboarded" from "never opened the
   * email" — this can. Absent on a backend that predates it; treat absent as "active".
   */
  inviteStatus?: "active" | "invited" | "expired";
  /** ISO expiry of the pending invitation link, when there is one. */
  inviteExpiresAt?: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: "student" | "coach" | "admin";
}

/**
 * Get all users with pagination and filtering (Admin only)
 */
export async function getAdminUsers(
  filters: AdminUsersFilters = {}
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  params.append("page", (filters.page || 1).toString());
  params.append("limit", (filters.limit || 20).toString());
  params.append("search", filters.search || "");
  params.append("role", filters.role || "");
  params.append("status", filters.status || "");

  const response = await apiRequest(
    `/api/v1/admin/users?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return response.data || response;
}

/**
 * Create a new user with an explicit role (Admin only).
 * Uses the admin endpoint (authed) — NOT public signup — so the selected role
 * is actually applied. apiRequest throws on non-2xx with the server message.
 */
export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const response = await apiRequest("/api/v1/admin/users", {
    method: "POST",
    data,
  });
  return response?.data ?? response;
}


// =============================================================================
// PLATFORM-ADMIN INVITE
// =============================================================================
// Distinct from `createUser` above: that one needs the admin to choose a
// password and cannot attach a school, which produces exactly the stranded
// school-less account this flow exists to avoid. An invite creates a PENDING
// account inside a named school and emails the person a token to finish it.

/** Mirrors INVITABLE_ROLES on the server. Exact strings — never "admin". */
export const INVITABLE_ROLES = ["student", "counselor", "school_admin"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface InviteUserPayload {
  email: string;
  name: string;
  role: InvitableRole;
  schoolId: string;
}

export interface InviteUserResult {
  userId: string;
  email: string;
  name: string;
  role: InvitableRole;
  schoolId: string;
  schoolName: string;
  /** "created" = new account; "resent" = an existing PENDING invite re-issued. */
  action: "created" | "resent";
  /** The real send result — surfaced as-is, never assumed true. */
  emailSent: boolean;
  expiresAt: string;
}

/** Server `code` values the wizard branches on. */
export type InviteErrorCode =
  | "INVALID_INPUT"
  | "INVALID_EMAIL"
  | "INVALID_ROLE"
  | "SCHOOL_NOT_FOUND"
  | "SCHOOL_FULL"
  | "EMAIL_ALREADY_ACTIVE"
  | "ROLE_NOT_CONFIGURED"
  | "UNKNOWN";

export class InviteError extends Error {
  readonly code: InviteErrorCode;
  constructor(code: InviteErrorCode, message: string) {
    super(message);
    this.name = "InviteError";
    this.code = code;
  }
}

/**
 * Invite one person into one school.
 *
 * Rethrows as an InviteError carrying the server's stable `code`, because the
 * UI has to tell "already has an account" apart from a generic failure — that
 * distinction is the whole point of the endpoint.
 */
export async function inviteUser(payload: InviteUserPayload): Promise<InviteUserResult> {
  try {
    const response = await apiRequest("/api/v1/admin/users/invite", {
      method: "POST",
      // The invite email goes out in the inviter's current language.
      data: { ...payload, language: currentLanguage() },
      showErrorToast: false, // the wizard renders the failure in place
    });
    return (response?.data ?? response) as InviteUserResult;
  } catch (err) {
    const body = (err as { data?: { code?: InviteErrorCode; message?: string } })?.data;
    const message = body?.message || (err instanceof Error ? err.message : "Could not send the invitation.");
    throw new InviteError(body?.code ?? "UNKNOWN", message);
  }
}

// =============================================================================
// PENDING INVITES, ROLE AND SCHOOL CHANGES
// =============================================================================
// Before these, the only way to re-send an invite, change someone's role or move them to
// another school was SQL against production. The backend routes (audited) already existed.

export interface ResendUserInviteResult {
  expiresAt?: string;
  emailSent?: boolean;
}

/** Re-issue a pending (or expired) invitation. 409 when the account is already set up. */
export async function resendUserInvite(userId: string): Promise<ResendUserInviteResult> {
  const response = await apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/resend-invite`, {
    method: "POST",
    data: { language: currentLanguage() },
    showErrorToast: false,
  });
  return (response?.data ?? response ?? {}) as ResendUserInviteResult;
}

export interface DeactivationImpact {
  isCoach: boolean;
  /** Paid sessions still to come that deactivating this coach will cancel and refund. */
  paidFutureSessions: number;
}

/** What deactivating this account will do (audit F4), so the confirm can name the cancelled sessions. */
export async function getDeactivationImpact(userId: string): Promise<DeactivationImpact> {
  const response = await apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/deactivation-impact`, {
    showErrorToast: false,
  });
  const data = (response?.data ?? response ?? {}) as Partial<DeactivationImpact>;
  return { isCoach: !!data.isCoach, paidFutureSessions: Number(data.paidFutureSessions) || 0 };
}

/** The coach bookings a deactivation cancelled; present only when the account was a coach's. */
export interface CoachBookingCancellation {
  cancelled: number;
  refunded: string[];
  refundFailed: string[];
}

/** PUT /admin/users/:id/status. Returns the coach booking outcome when the user was a coach. */
export async function setUserActive(userId: string, isActive: boolean): Promise<{ coachBookings?: CoachBookingCancellation }> {
  const response = await apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PUT",
    data: { isActive },
    showErrorToast: false,
  });
  return (response?.data ?? {}) as { coachBookings?: CoachBookingCancellation };
}

export interface RoleOption {
  id: string;
  name: string;
}

/** Active roles, for display. The role change itself goes by NAME (see updateUserRole). */
export async function getActiveRoles(): Promise<RoleOption[]> {
  const response = await apiRequest("/api/role/active", { method: "GET" });
  const rows = (response?.data ?? response ?? []) as Array<{ id?: string; name?: string }>;
  return rows.filter((r): r is RoleOption => typeof r.id === "string" && typeof r.name === "string");
}

/**
 * Roles the dedicated role endpoint accepts. Super Admin is deliberately absent: the panel can
 * never mint platform power — that stays an audited SQL step (infra/aws/sql/promote-*.sql).
 */
export const ASSIGNABLE_ROLES = ["student", "counselor", "school_admin", "teacher", "parent", "coach"] as const;

/**
 * Change a user's role via PUT /admin/users/:id/role — roleId + roleName together, audited as
 * USER_ROLE_CHANGE, refuses Super Admin, the caller's own account, and a no-op change.
 */
export async function updateUserRole(userId: string, roleName: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    data: { role: roleName },
    showErrorToast: false,
  });
}

/** Move a user to another school (audited server-side as USER_LINK_SCHOOL). */
export async function linkUserToSchool(userId: string, schoolId: string): Promise<{ schoolName?: string }> {
  const response = await apiRequest(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/link-school/${encodeURIComponent(schoolId)}`,
    { method: "POST", showErrorToast: false },
  );
  return (response?.data ?? response ?? {}) as { schoolName?: string };
}
