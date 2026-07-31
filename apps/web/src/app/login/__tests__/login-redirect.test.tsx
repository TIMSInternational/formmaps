/**
 * The ?redirect= param survives login: a deep link bounced through
 * /login?redirect=X must land on X after sign-in (when safe and the
 * user's role may access it), not on the role home.
 *
 * resolveLoginRedirect is the pure decision the login page applies to
 * window.location.href (hard navigation — jsdom can't stub that, so the
 * page wiring is covered by live browser verification).
 */
import { resolveLoginRedirect } from "@/lib/routePermissions";
import { Roles } from "@/lib/permissions";

describe("resolveLoginRedirect", () => {
  it("honors a safe same-portal deep link", () => {
    expect(resolveLoginRedirect("/dashboard/messages", Roles.STUDENT)).toBe("/dashboard/messages");
    expect(resolveLoginRedirect("/dashboard/courses?tab=plan", Roles.STUDENT)).toBe("/dashboard/courses?tab=plan");
    expect(resolveLoginRedirect("/counselor/students", Roles.COUNSELOR)).toBe("/counselor/students");
  });

  it("falls back to role home when the redirect targets another role's portal", () => {
    expect(resolveLoginRedirect("/counselor/students", Roles.STUDENT)).toBe("/dashboard");
    expect(resolveLoginRedirect("/admin/users", Roles.STUDENT)).toBe("/dashboard");
  });

  it("rejects external/absolute/protocol-relative redirect values", () => {
    expect(resolveLoginRedirect("https://evil.example.com/phish", Roles.STUDENT)).toBe("/dashboard");
    expect(resolveLoginRedirect("//evil.example.com", Roles.STUDENT)).toBe("/dashboard");
    expect(resolveLoginRedirect("javascript:alert(1)", Roles.STUDENT)).toBe("/dashboard");
  });

  it("rejects paths outside the known portals", () => {
    expect(resolveLoginRedirect("/api/v1/secrets", Roles.STUDENT)).toBe("/dashboard");
  });

  it("goes to role home when no redirect param is present", () => {
    expect(resolveLoginRedirect(null, Roles.STUDENT)).toBe("/dashboard");
    expect(resolveLoginRedirect(null, Roles.COUNSELOR)).toBe("/counselor");
  });
});
