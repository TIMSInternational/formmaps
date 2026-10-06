/**
 * #404 — coach booking: the session title must come from the real duration,
 * and slot instants (UTC from the API) must render in the STUDENT's timezone,
 * with the coach's wall-clock available as a hint. Every case pins an explicit
 * IANA zone so the result never depends on the machine running the suite.
 */
import {
  sessionDurationLabel,
  formatSlotTime,
  resolveStudentTimeZone,
} from "@/lib/coachBookingTime";

const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}|${opts?.count ?? ""}`;

describe("sessionDurationLabel", () => {
  it("labels a 30-minute session in minutes (never '1 Hour Session')", () => {
    expect(sessionDurationLabel(30, t)).toBe("booking.sessionMinutes|30");
  });
  it("uses hours when the duration is a whole number of hours", () => {
    expect(sessionDurationLabel(60, t)).toBe("booking.sessionHour|1");
    expect(sessionDurationLabel(120, t)).toBe("booking.sessionHours|2");
  });
  it("keeps minutes for non-whole hours", () => {
    expect(sessionDurationLabel(90, t)).toBe("booking.sessionMinutes|90");
  });
  it("returns null when the duration is unknown (loading / invalid)", () => {
    expect(sessionDurationLabel(undefined, t)).toBeNull();
    expect(sessionDurationLabel(0, t)).toBeNull();
    expect(sessionDurationLabel(Number.NaN, t)).toBeNull();
  });
});

describe("formatSlotTime", () => {
  // 2026-10-07T14:00:00Z = 09:00 Chicago (CDT, UTC-5) = 08:00 Costa Rica (UTC-6)
  const iso = "2026-10-07T14:00:00.000Z";

  it("renders the instant in the student's zone (Costa Rica, no DST)", () => {
    expect(formatSlotTime(iso, "America/Costa_Rica")).toBe("08:00am");
  });
  it("renders the same instant in the coach's zone (Chicago, CDT)", () => {
    expect(formatSlotTime(iso, "America/Chicago")).toBe("09:00am");
  });
  it("tracks DST: in January Chicago is UTC-6, same wall-clock as Costa Rica", () => {
    const jan = "2027-01-08T15:00:00.000Z";
    expect(formatSlotTime(jan, "America/Chicago")).toBe("09:00am");
    expect(formatSlotTime(jan, "America/Costa_Rica")).toBe("09:00am");
  });
  it("handles afternoon and midnight-adjacent times", () => {
    expect(formatSlotTime("2026-10-07T22:30:00.000Z", "America/Bogota")).toBe("05:30pm");
    expect(formatSlotTime("2026-10-07T05:00:00.000Z", "America/Bogota")).toBe("12:00am");
  });
  it("falls back to the raw string for an unparseable slot", () => {
    expect(formatSlotTime("not-a-date", "America/Bogota")).toBe("not-a-date");
  });
});

describe("resolveStudentTimeZone", () => {
  it("prefers a valid profile timezone", () => {
    expect(resolveStudentTimeZone("America/Bogota")).toBe("America/Bogota");
  });
  it("ignores an invalid profile timezone and falls back to the browser zone", () => {
    expect(resolveStudentTimeZone("Not/AZone")).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(resolveStudentTimeZone(undefined)).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});
