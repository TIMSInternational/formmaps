import { apiRequest } from "@/lib/api/apiClient";
import { LoginResponse } from "./authService";
import { authApiErrorFrom, classifyInviteError, type InviteProblem } from "@/lib/auth/authErrors";

export interface VerifyTokenResponse {
  isValid: boolean | string;
  student?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  /**
   * The token is role-agnostic: the same onboarding token is issued to students
   * by the school-admin invite and to counselors/school admins by the
   * platform-admin invite. These two let one page name what the person was
   * actually invited to instead of assuming "student".
   */
  roleName?: string;
  schoolName?: string | null;
  message?: string;
  /**
   * Why the token is unusable, when it is — so the page can offer the right next step
   * (a new link for an expired invite, sign-in for an accepted one) instead of one dead end.
   */
  problem?: InviteProblem;
}

export interface CompleteOnboardingResponse extends LoginResponse {
  success: boolean;
  message?: string;
}

/**
 * Verify if the onboarding token is valid and get student details
 * Public endpoint — no auth needed, so we use raw fetch to avoid sending a JWT.
 */
export async function verifyStudentToken(token: string): Promise<VerifyTokenResponse> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const response = await fetch(
      `${baseUrl}/api/v1/student/onboarding/verify/${token}`
    );

    if (!response.ok) {
      // Not thrown: the page renders the problem state. The API's `code` says which one.
      const body = await response.json().catch(() => ({}));
      return { isValid: false, problem: classifyInviteError({ status: response.status, code: body?.code }) };
    }

    const result = await response.json();

    if (!(result.data?.isValid === true || result.data?.isValid === "true")) {
      // 200 with isValid:false is the older shape; a `code` on the payload still wins when present.
      const code = result.data?.code ?? result.code;
      return { isValid: false, problem: code ? classifyInviteError({ status: 200, code }) : "invalid" };
    }

    // API returns { data: { isValid: boolean, ... }, success: boolean, ... }
    // We need to map it to VerifyTokenResponse interface
    const mappedResponse = {
      isValid: result.data?.isValid || false,
      student: result.data ? {
        id: result.data.userId || result.data.id, // Try both/either
        name: result.data.name,
        email: result.data.email
      } : undefined,
      roleName: result.data?.roleName,
      schoolName: result.data?.schoolName ?? null,
      message: result.message
    };

    return mappedResponse;
  } catch {
    return { isValid: false, problem: "unknown" };
  }
}

/**
 * Complete onboarding by setting password
 * Public endpoint — no auth needed, so we use raw fetch to avoid sending a JWT.
 */
export async function completeStudentOnboarding(
  token: string,
  password: string,
  confirmPassword: string,
  userId: string
): Promise<CompleteOnboardingResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const response = await fetch(
    `${baseUrl}/api/v1/student/onboarding/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Without credentials, the browser DISCARDS the cross-origin Set-Cookie
      // from this response — the invited user ends up with a cookie-less
      // session where every cookie-authenticated call 401s.
      credentials: "include",
      body: JSON.stringify({
        Token: token,
        Password: password,
        ConfirmPassword: confirmPassword,
        UserId: userId
      }),
    }
  );

  if (!response.ok) {
    // Coded (INVITE_EXPIRED / INVITE_USED / INVITE_INVALID) so the page can switch to the
    // matching state if the invite lapsed while the form was open.
    throw await authApiErrorFrom(response, "Failed to complete onboarding");
  }

  const result = await response.json();

  // Map API response to CompleteOnboardingResponse interface
  // Check if data is nested inside 'data' property
  if (result.data) {
    // If token exists, map user data for auto-login
    if (result.data.token) {
      return {
        success: result.success !== undefined ? result.success : true,
        message: result.message,
        token: result.data.token,
        user: {
          id: result.data.user.id,
          name: result.data.user.name,
          email: result.data.user.email,
          roleId: result.data.user.roleId,
          role: result.data.user.role ? {
            id: result.data.user.role.id,
            name: result.data.user.role.name,
            description: result.data.user.role.description,
            isActive: result.data.user.role.isActive
          } : undefined
        }
      };
    }

    // If no token (registration only), return success with limited user data if available
    return {
      success: result.success !== undefined ? result.success : true,
      message: result.data.message || result.message,
      token: "", // Empty string or undefined if interface allows
      user: {
        id: result.data.userId || "",
        name: result.data.name || "",
        email: result.data.email || "",
        roleId: "",
      }
    };
  }

  return result;
}

export interface ResendInviteResult {
  /** Masked address the new link went to, e.g. "g***@gmail.com". */
  sentTo: string;
  /** ISO expiry of the new link. */
  expiresAt: string;
}

/**
 * Ask for a fresh invitation link using the expired one. Public — the expired token is the
 * only credential an invitee holds. The API mails the new link to the address already on the
 * invite (never one supplied here) and rate-limits the endpoint.
 */
export async function resendInvite(token: string): Promise<ResendInviteResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const response = await fetch(`${baseUrl}/authapi/invite/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw await authApiErrorFrom(response, "Could not send a new invitation link");
  const result = await response.json().catch(() => ({}));
  return { sentTo: result.data?.sentTo ?? "", expiresAt: result.data?.expiresAt ?? "" };
}
