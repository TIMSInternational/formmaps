import { toLocalDateString, formatDateOnly } from "../dateUtils";

describe("toLocalDateString", () => {
  it("uses the LOCAL calendar date, not the UTC one", () => {
    // 11:30 PM local on Jun 5 — in any timezone west of UTC this is already
    // Jun 6 in UTC. The local date string must still say Jun 5.
    const d = new Date(2026, 5, 5, 23, 30, 0); // local Jun 5, 11:30 PM
    expect(toLocalDateString(d)).toBe("2026-06-05");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 0, 3, 12, 0, 0); // local Jan 3
    expect(toLocalDateString(d)).toBe("2026-01-03");
  });
});

describe("formatDateOnly", () => {
  it("renders a date-only UTC timestamp without timezone drift", () => {
    // Date-only values are stored as UTC midnight. Rendering them with local
    // formatting shifts them a day back in any western timezone (the
    // "entered 2026-05-01, displayed Apr 30" bug).
    expect(formatDateOnly("2026-05-01T00:00:00.000Z")).toBe("May 1, 2026");
    expect(formatDateOnly("2026-07-15T00:00:00.000Z")).toBe("Jul 15, 2026");
  });

  it("returns an em dash for missing values", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
    expect(formatDateOnly("")).toBe("—");
  });

  it("tolerates a bare YYYY-MM-DD string", () => {
    expect(formatDateOnly("2026-05-01")).toBe("May 1, 2026");
  });
});
