/**
 * Auth errors as the UI should explain them — never as the server's raw English.
 *
 * The API answers auth failures with a stable `code` (INVALID_CREDENTIALS, ACCOUNT_LOCKED,
 * INVITE_EXPIRED, ...) alongside its human `message`. The message is English and written for
 * developers; this module turns the code into an i18n key so a Spanish-speaking student reads
 * Spanish, and so each state can carry its own next step instead of a dead end.
 *
 * Every mapper falls back on the HTTP status (and, for the one lockout message the legacy API
 * already sends, its text) so it behaves correctly against a backend that predates the codes.
 */

export class AuthApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterMinutes?: number;
  readonly data?: Record<string, unknown>;

  constructor(
    message: string,
    opts: { status: number; code?: string; retryAfterMinutes?: number; data?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "AuthApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.retryAfterMinutes = opts.retryAfterMinutes;
    this.data = opts.data;
  }
}

/** Build an AuthApiError from a non-OK fetch Response (body may be missing or not JSON). */
export async function authApiErrorFrom(response: Response, fallbackMessage: string): Promise<AuthApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    retryAfterMinutes?: number;
    data?: Record<string, unknown>;
  };
  return new AuthApiError(body.message || fallbackMessage, {
    status: response.status,
    code: typeof body.code === "string" ? body.code : undefined,
    retryAfterMinutes: typeof body.retryAfterMinutes === "number" ? body.retryAfterMinutes : undefined,
    data: body.data,
  });
}

function asAuthError(err: unknown): { status?: number; code?: string; retryAfterMinutes?: number; message?: string } {
  if (err instanceof AuthApiError) return err;
  if (err && typeof err === "object") {
    const e = err as { status?: number; code?: string; message?: string; response?: { status?: number; data?: { code?: string; message?: string } } };
    return {
      status: e.status ?? e.response?.status,
      code: e.code ?? e.response?.data?.code,
      message: e.response?.data?.message ?? e.message,
    };
  }
  return {};
}

export interface DescribedError {
  /** i18n key, resolved by the caller with `t(key, params)`. */
  key: string;
  params?: Record<string, string | number>;
}

export interface DescribedLoginError extends DescribedError {
  /** Show the "invited recently? use your invitation link" hint under the error. */
  inviteHint: boolean;
}

const DEFAULT_LOCK_MINUTES = 15;

export function describeLoginError(err: unknown): DescribedLoginError {
  const { status, code, retryAfterMinutes, message } = asAuthError(err);

  const lockedByText = typeof message === "string" && /locked/i.test(message);
  if (code === "ACCOUNT_LOCKED" || (!code && status === 429 && lockedByText)) {
    const fromText = typeof message === "string" ? Number(message.match(/(\d+)\s*minute/i)?.[1]) : NaN;
    const minutes = retryAfterMinutes ?? (Number.isFinite(fromText) && fromText > 0 ? fromText : DEFAULT_LOCK_MINUTES);
    return { key: "auth.errors.accountLocked", params: { count: minutes }, inviteHint: false };
  }
  if (code === "RATE_LIMITED" || (!code && status === 429)) {
    return { key: "auth.errors.rateLimited", inviteHint: false };
  }
  if (code === "ACCOUNT_DISABLED" || (!code && status === 403)) {
    return { key: "auth.errors.accountDisabled", inviteHint: false };
  }
  if (code === "INVALID_CREDENTIALS" || (!code && status === 401)) {
    return { key: "auth.errors.invalidCredentials", inviteHint: true };
  }
  return { key: "auth.errors.loginFailed", inviteHint: false };
}

/** Signup: is this the "email already has an account or a pending invite" case? */
export function isEmailUnavailable(err: unknown): boolean {
  const { status, code, message } = asAuthError(err);
  if (code === "EMAIL_UNAVAILABLE") return true;
  if (code) return false;
  return status === 409 || (typeof message === "string" && /unable to create account with this email/i.test(message));
}

export type InviteProblem = "expired" | "used" | "invalid" | "unknown";

/** Classify a failed invite-token validation/completion. */
export function classifyInviteError(err: unknown): InviteProblem {
  const { status, code } = asAuthError(err);
  if (code === "INVITE_EXPIRED" || (!code && status === 410)) return "expired";
  if (code === "INVITE_USED" || (!code && status === 409)) return "used";
  if (code === "INVITE_INVALID" || (!code && (status === 404 || status === 400))) return "invalid";
  return "unknown";
}

export type ResendProblem = "rate_limited" | "used" | "invalid" | "unknown";

export function classifyResendError(err: unknown): ResendProblem {
  const { status, code } = asAuthError(err);
  if (code === "RATE_LIMITED" || (!code && status === 429)) return "rate_limited";
  if (code === "INVITE_USED" || (!code && status === 409)) return "used";
  if (code === "INVITE_INVALID" || (!code && status === 404)) return "invalid";
  return "unknown";
}
