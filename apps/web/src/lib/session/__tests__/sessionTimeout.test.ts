import {
  EXPIRY_WARNING_LEAD_MS,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_LEAD_MS,
  evaluateSession,
  formatCountdown,
  parseLogoutBroadcast,
  parseSessionExpiresAt,
} from "@/lib/session/sessionTimeout";

const T0 = 1_790_000_000_000;
const MIN = 60 * 1000;

describe("parseSessionExpiresAt", () => {
  it("reads epoch ms from among other cookies", () => {
    expect(parseSessionExpiresAt(`logged_in=true; session_expires_at=${T0}; x=1`)).toBe(T0);
  });

  it.each([
    ["missing", "logged_in=true"],
    ["empty", "session_expires_at="],
    ["not a number", "session_expires_at=soon"],
    ["an ISO date, not epoch ms", "session_expires_at=2026-09-28T12:00:00Z"],
    ["negative", "session_expires_at=-5"],
    ["a prefix-named cookie only", "xsession_expires_at=123"],
  ])("returns null when %s", (_label, cookie) => {
    expect(parseSessionExpiresAt(cookie)).toBeNull();
  });
});

describe("evaluateSession", () => {
  const at = (idleMin: number, expiresInMin: number | null) =>
    evaluateSession({
      now: T0,
      lastActivity: T0 - idleMin * MIN,
      expiresAt: expiresInMin === null ? null : T0 + expiresInMin * MIN,
    });

  it("is active well inside both limits", () => {
    expect(at(5, 600)).toEqual({ kind: "active" });
  });

  it("warns exactly when 2 minutes of idle time remain", () => {
    expect(at(27.99, null).kind).toBe("active");
    expect(at(28, null)).toEqual({ kind: "idle-warning", msRemaining: IDLE_WARNING_LEAD_MS });
  });

  it("logs out for idle at 30 minutes", () => {
    expect(at(30, null)).toEqual({ kind: "logout", reason: "idle" });
    expect(IDLE_TIMEOUT_MS).toBe(30 * MIN);
  });

  it("warns 2 minutes before the absolute deadline and logs out at it", () => {
    expect(at(0, 2.01).kind).toBe("active");
    expect(at(0, 2)).toEqual({ kind: "expiry-warning", msRemaining: EXPIRY_WARNING_LEAD_MS });
    expect(at(0, 0)).toEqual({ kind: "logout", reason: "expired" });
  });

  it("the absolute deadline wins when both are due", () => {
    expect(at(31, -1)).toEqual({ kind: "logout", reason: "expired" });
  });
});

describe("evaluateSession — overlapping warnings", () => {
  it("shows the idle warning when idle ends first", () => {
    const s = evaluateSession({ now: T0, lastActivity: T0 - 29 * MIN, expiresAt: T0 + 1.5 * MIN });
    expect(s.kind).toBe("idle-warning");
  });

  it("shows the expiry warning when the deadline ends first", () => {
    const s = evaluateSession({ now: T0, lastActivity: T0 - 28.5 * MIN, expiresAt: T0 + 0.5 * MIN });
    expect(s.kind).toBe("expiry-warning");
  });
});

describe("formatCountdown", () => {
  it.each([
    [120_000, "2:00"],
    [65_000, "1:05"],
    [1, "0:01"],
    [0, "0:00"],
    [-5, "0:00"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("parseLogoutBroadcast", () => {
  it("accepts the two reasons and nothing else", () => {
    expect(parseLogoutBroadcast(JSON.stringify({ reason: "idle", at: T0 }))).toBe("idle");
    expect(parseLogoutBroadcast(JSON.stringify({ reason: "expired", at: T0 }))).toBe("expired");
    expect(parseLogoutBroadcast(JSON.stringify({ reason: "other" }))).toBeNull();
    expect(parseLogoutBroadcast("not json")).toBeNull();
    expect(parseLogoutBroadcast(null)).toBeNull();
  });
});
