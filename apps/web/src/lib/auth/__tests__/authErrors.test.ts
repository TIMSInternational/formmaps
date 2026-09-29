import {
  AuthApiError,
  authApiErrorFrom,
  classifyInviteError,
  classifyResendError,
  describeLoginError,
  isEmailUnavailable,
} from "@/lib/auth/authErrors";
import { createTestI18n } from "@/test-utils/realI18n";

const err = (status: number, code?: string, message = "server english", retryAfterMinutes?: number) =>
  new AuthApiError(message, { status, code, retryAfterMinutes });

describe("describeLoginError", () => {
  it.each([
    ["INVALID_CREDENTIALS", 401, "auth.errors.invalidCredentials", true],
    ["ACCOUNT_DISABLED", 403, "auth.errors.accountDisabled", false],
    ["RATE_LIMITED", 429, "auth.errors.rateLimited", false],
  ])("maps code %s", (code, status, key, hint) => {
    expect(describeLoginError(err(status, code))).toMatchObject({ key, inviteHint: hint });
  });

  it("uses retryAfterMinutes for a coded lockout", () => {
    expect(describeLoginError(err(429, "ACCOUNT_LOCKED", "x", 7))).toEqual({
      key: "auth.errors.accountLocked", params: { count: 7 }, inviteHint: false,
    });
  });

  it("falls back on status for a backend without codes", () => {
    expect(describeLoginError(err(401)).key).toBe("auth.errors.invalidCredentials");
    expect(describeLoginError(err(403)).key).toBe("auth.errors.accountDisabled");
    expect(describeLoginError(err(429, undefined, "Too many requests")).key).toBe("auth.errors.rateLimited");
  });

  it("reads the minutes out of today's legacy lockout message", () => {
    const d = describeLoginError(err(429, undefined, "Account temporarily locked. Try again in 12 minute(s)"));
    expect(d).toEqual({ key: "auth.errors.accountLocked", params: { count: 12 }, inviteHint: false });
  });

  it("never passes the server's English through — unknown failures get the generic key", () => {
    expect(describeLoginError(err(500, undefined, "Internal server error")).key).toBe("auth.errors.loginFailed");
    expect(describeLoginError(new TypeError("Failed to fetch")).key).toBe("auth.errors.loginFailed");
  });
});

describe("isEmailUnavailable", () => {
  it("is true for the code, a bare 409, and the legacy message", () => {
    expect(isEmailUnavailable(err(409, "EMAIL_UNAVAILABLE"))).toBe(true);
    expect(isEmailUnavailable(err(409))).toBe(true);
    expect(isEmailUnavailable(err(400, undefined, "Unable to create account with this email"))).toBe(true);
  });
  it("is false for other signup failures", () => {
    expect(isEmailUnavailable(err(400, undefined, "Password too weak"))).toBe(false);
    expect(isEmailUnavailable(err(409, "SOMETHING_ELSE"))).toBe(false);
  });
});

describe("classifyInviteError / classifyResendError", () => {
  it("prefers the code over the status", () => {
    expect(classifyInviteError(err(400, "INVITE_EXPIRED"))).toBe("expired");
    expect(classifyInviteError(err(400, "INVITE_USED"))).toBe("used");
    expect(classifyInviteError(err(400, "INVITE_INVALID"))).toBe("invalid");
  });
  it("falls back on status", () => {
    expect(classifyInviteError(err(410))).toBe("expired");
    expect(classifyInviteError(err(409))).toBe("used");
    expect(classifyInviteError(err(404))).toBe("invalid");
    expect(classifyInviteError(err(500))).toBe("unknown");
  });
  it("classifies resend failures", () => {
    expect(classifyResendError(err(429, "RATE_LIMITED"))).toBe("rate_limited");
    expect(classifyResendError(err(409))).toBe("used");
    expect(classifyResendError(err(404))).toBe("invalid");
    expect(classifyResendError(err(502))).toBe("unknown");
  });
});

describe("authApiErrorFrom", () => {
  // jsdom has no fetch Response; the function only reads `status` and `json()`.
  const res = (status: number, body: unknown) =>
    ({ status, json: async () => (body instanceof Error ? Promise.reject(body) : body) }) as unknown as Response;

  it("carries status, code and retryAfterMinutes, and survives a non-JSON body", async () => {
    const coded = await authApiErrorFrom(res(429, { message: "m", code: "ACCOUNT_LOCKED", retryAfterMinutes: 3 }), "fallback");
    expect(coded).toMatchObject({ status: 429, code: "ACCOUNT_LOCKED", retryAfterMinutes: 3, message: "m" });
    const bare = await authApiErrorFrom(res(502, new SyntaxError("Unexpected token <")), "fallback");
    expect(bare).toMatchObject({ status: 502, code: undefined, message: "fallback" });
  });
});

describe("the keys exist and read correctly in both languages", () => {
  it("renders the lockout plural in en and es", () => {
    const en = createTestI18n("en");
    const es = createTestI18n("es");
    expect(en.t("auth.errors.accountLocked", { count: 1 })).toMatch(/1 minute\./);
    expect(en.t("auth.errors.accountLocked", { count: 5 })).toMatch(/5 minutes\./);
    expect(es.t("auth.errors.accountLocked", { count: 5 })).toMatch(/5 minutos\./);
    for (const key of ["invalidCredentials", "rateLimited", "accountDisabled", "invitedHint", "loginFailed"]) {
      expect(es.t(`auth.errors.${key}`)).not.toBe(`auth.errors.${key}`);
      expect(es.t(`auth.errors.${key}`)).not.toBe(en.t(`auth.errors.${key}`));
    }
  });
});
