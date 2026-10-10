/**
 * Audit 2026-10-09 F: the /dashboard rule let coaches into the whole student dashboard.
 * Coaches belong in /dashboard/coaching (matched first); every other /dashboard path is students only.
 */
import { findRouteRule, resolveLoginRedirect, resolveRedirect } from "../routePermissions";
import { Roles } from "../permissions";

describe("/dashboard route rule (audit F)", () => {
  it("a coach on a student dashboard page is denied and sent to the coaching portal", () => {
    for (const path of ["/dashboard", "/dashboard/assessments", "/dashboard/profile", "/dashboard/subscriptions"]) {
      const rule = findRouteRule(path)!;
      expect(rule.path).toBe("/dashboard");
      expect(rule.allowed).not.toContain(Roles.COACH);
      expect(resolveRedirect(rule, Roles.COACH)).toBe("/dashboard/coaching");
    }
  });

  it("the coaching portal still matches first and admits coaches", () => {
    const rule = findRouteRule("/dashboard/coaching/sessions")!;
    expect(rule.path).toBe("/dashboard/coaching");
    expect(rule.allowed).toContain(Roles.COACH);
  });

  it("students keep the dashboard", () => {
    expect(findRouteRule("/dashboard/assessments")!.allowed).toContain(Roles.STUDENT);
  });

  it("a coach's login deep link into the student dashboard lands on the coaching home", () => {
    expect(resolveLoginRedirect("/dashboard/assessments", Roles.COACH)).toBe("/dashboard/coaching");
    expect(resolveLoginRedirect("/dashboard/coaching/earnings", Roles.COACH)).toBe("/dashboard/coaching/earnings");
  });
});
