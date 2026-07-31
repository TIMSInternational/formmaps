import { toLocalDateString, formatDateOnly, parseYmdLocal } from "../dateUtils";
import { format } from "date-fns";

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

describe("parseYmdLocal", () => {
  // This suite runs under a forced negative-UTC-offset zone (America/New_York)
  // set process-wide by jest.global-setup.js (see that file for why — a
  // per-file `process.env.TZ = ...` inside beforeAll() does NOT work: it's a
  // no-op, since the jsdom test environment's Date/Intl behavior is already
  // locked in before beforeAll() runs). This is exactly the class of
  // environment where `new Date("2026-08-03")` (parsed as UTC midnight)
  // renders as Aug 2 instead of Aug 3 — the bug this helper exists to avoid
  // (e.g. `nextAvailableDate` in BookingModal.tsx and AvailabilityStatus.tsx).

  it("parses 'YYYY-MM-DD' as the SAME local calendar day, not a day earlier", () => {
    const d = parseYmdLocal("2026-08-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August (0-indexed)
    expect(d.getDate()).toBe(3);
    expect(format(d, "MMM d")).toBe("Aug 3");
  });

  it("proves the bug this guards against: naive `new Date(ymd)` IS off by one under this TZ", () => {
    // Sanity check that the test environment actually reproduces the bug
    // class — if this assertion ever fails, the process-wide TZ forcing in
    // jest.global-setup.js stopped working and the regression test above
    // would no longer be meaningful.
    const naive = new Date("2026-08-03");
    expect(format(naive, "MMM d")).toBe("Aug 2");
  });
});
