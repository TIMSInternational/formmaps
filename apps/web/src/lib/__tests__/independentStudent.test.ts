import {
  isIndependentStudentUser,
  isSchoolOnlyRoute,
  isStudentPaywallEnabled,
  studentAccessRedirect,
} from "../independentStudent";

describe("independentStudent (#399)", () => {
  it("is independent only when the school is KNOWN to be absent", () => {
    expect(isIndependentStudentUser({ role: "student", schoolId: null })).toBe(true);
    expect(isIndependentStudentUser({ role: "Student", schoolId: null })).toBe(true);
    expect(isIndependentStudentUser({ role: "student", schoolId: "s1" })).toBe(false);
    expect(isIndependentStudentUser({ role: "student" })).toBe(false); // not loaded yet
    expect(isIndependentStudentUser({ role: "parent", schoolId: null })).toBe(false);
    expect(isIndependentStudentUser({ role: "coach", schoolId: null })).toBe(false);
  });

  it("matches the school-only routes and their sub-pages, nothing else", () => {
    for (const p of ["/dashboard/transcript", "/dashboard/video/abc", "/dashboard/book-counselor", "/dashboard/recommendations"]) {
      expect(isSchoolOnlyRoute(p)).toBe(true);
    }
    for (const p of ["/dashboard", "/dashboard/videos", "/dashboard/test-scores", "/dashboard/my-sessions", null, undefined]) {
      expect(isSchoolOnlyRoute(p)).toBe(false);
    }
  });

  it("the paywall flag defaults OFF", () => {
    expect(isStudentPaywallEnabled(undefined)).toBe(false);
    expect(isStudentPaywallEnabled("")).toBe(false);
    expect(isStudentPaywallEnabled("false")).toBe(false);
    expect(isStudentPaywallEnabled("true")).toBe(true);
    expect(isStudentPaywallEnabled("1")).toBe(true);
  });

  it("flag OFF keeps today's rule: no entitlement → /subscribe", () => {
    expect(studentAccessRedirect("/dashboard/resumes", { hasActiveSubscription: false }, false)).toBe("/subscribe");
    expect(studentAccessRedirect("/dashboard/resumes", { hasActiveSubscription: true }, false)).toBeNull();
  });

  it("flag ON, unpaid: assessments open, everything else → /complete-purchase", () => {
    const unpaid = { hasActiveSubscription: false, hasFullPlatform: false, hasPaidAccess: false };
    expect(studentAccessRedirect("/dashboard/assessments/lia", unpaid, true)).toBeNull();
    expect(studentAccessRedirect("/dashboard/resumes", unpaid, true)).toBe("/complete-purchase");
    expect(studentAccessRedirect("/dashboard/career-paths", unpaid, true)).toBe("/complete-purchase");
  });

  it("flag ON, trial / subscription: whole platform", () => {
    expect(studentAccessRedirect("/dashboard/resumes", { hasActiveSubscription: true, hasFullPlatform: true, hasPaidAccess: false }, true)).toBeNull();
  });

  it("flag ON, one-time: assessments + results areas only", () => {
    const once = { hasActiveSubscription: true, hasFullPlatform: false, hasPaidAccess: true };
    expect(studentAccessRedirect("/dashboard/assessments/pca", once, true)).toBeNull();
    expect(studentAccessRedirect("/dashboard/career-paths", once, true)).toBeNull();
    expect(studentAccessRedirect("/dashboard/resumes", once, true)).toBe("/complete-purchase");
  });
});
