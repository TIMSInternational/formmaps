/**
 * Regression: NotificationCenter used to seed "Your top 10 career matches are
 * ready" / "We found universities matching your profile" to EVERY user —
 * including brand-new students with 0/3 assessments (contradicting their
 * locked dashboard) and non-student roles. Seeds must be gated on the real
 * assessment state and only shown to students.
 */
import { buildSeedNotifications } from "../notificationSeeds";

const t = (key: string) => key;

describe("buildSeedNotifications", () => {
  it("non-student roles get no seeded notifications", () => {
    expect(buildSeedNotifications(t, false, true)).toEqual([]);
    expect(buildSeedNotifications(t, false, false)).toEqual([]);
  });

  it("student with incomplete assessments: onboarding seeds only — no results claims", () => {
    const seeds = buildSeedNotifications(t, true, false);
    const ids = seeds.map((s) => s.id);
    expect(ids).toContain("welcome");
    expect(ids).toContain("build-resume");
    expect(ids).not.toContain("explore-careers");
    expect(ids).not.toContain("university-finder");
  });

  it("student with completed assessments: results-ready seeds included", () => {
    const seeds = buildSeedNotifications(t, true, true);
    const ids = seeds.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(["welcome", "explore-careers", "university-finder", "build-resume"]),
    );
  });

  it("seeds start unread", () => {
    expect(buildSeedNotifications(t, true, true).every((s) => s.read === false)).toBe(true);
  });
});
