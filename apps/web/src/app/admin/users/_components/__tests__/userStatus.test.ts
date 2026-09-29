import { daysUntil, displayStatus, formatSignedPercent } from "../userStatus";

describe("displayStatus", () => {
  it("separates an invited account from an onboarded one — isActive alone could not", () => {
    expect(displayStatus({ status: "active", inviteStatus: "invited" })).toBe("invited");
    expect(displayStatus({ status: "active", inviteStatus: "expired" })).toBe("expired");
    expect(displayStatus({ status: "active", inviteStatus: "active" })).toBe("active");
  });
  it("treats a missing inviteStatus (older backend) as the old active/inactive reading", () => {
    expect(displayStatus({ status: "active" })).toBe("active");
    expect(displayStatus({ status: "inactive" })).toBe("inactive");
  });
  it("lets deactivation win over a pending invite", () => {
    expect(displayStatus({ status: "inactive", inviteStatus: "invited" })).toBe("inactive");
  });
});

describe("daysUntil", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  it("counts whole days left", () => {
    expect(daysUntil("2026-09-30T13:00:00Z", now)).toBe(2);
    expect(daysUntil("2026-09-29T11:00:00Z", now)).toBe(0);
  });
  it("never goes negative and tolerates missing/garbage dates", () => {
    expect(daysUntil("2026-09-20T00:00:00Z", now)).toBe(0);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("not a date", now)).toBeNull();
  });
});

describe("formatSignedPercent", () => {
  it("never renders '+-'", () => {
    expect(formatSignedPercent(-5)).toBe("−5.0%");
    expect(formatSignedPercent(-5)).not.toContain("+");
  });
  it("signs positives and leaves zero unsigned", () => {
    expect(formatSignedPercent(12.34)).toBe("+12.3%");
    expect(formatSignedPercent(0)).toBe("0.0%");
    expect(formatSignedPercent(-0.01)).toBe("0.0%");
    expect(formatSignedPercent(undefined)).toBe("0.0%");
  });
});
