import {
  isIndependentStudentUser,
  isSchoolOnlyRoute,
  isStudentPaywallEnabled,
  unentitledStudentRedirect,
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

  it("flag OFF keeps today's /subscribe redirect; ON sends to the locked screen", () => {
    expect(unentitledStudentRedirect(false)).toBe("/subscribe");
    expect(unentitledStudentRedirect(true)).toBe("/complete-purchase");
  });
});
