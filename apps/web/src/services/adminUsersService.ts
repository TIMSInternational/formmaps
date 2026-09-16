import { apiRequest } from "@/lib/api/apiClient";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedDate: string;
  subscriptionStatus: "active" | "expired" | "none";
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
      data: payload,
      showErrorToast: false, // the wizard renders the failure in place
    });
    return (response?.data ?? response) as InviteUserResult;
  } catch (err) {
    const body = (err as { data?: { code?: InviteErrorCode; message?: string } })?.data;
    const message = body?.message || (err instanceof Error ? err.message : "Could not send the invitation.");
    throw new InviteError(body?.code ?? "UNKNOWN", message);
  }
}
