/**
 * Session timeout policy and the timing math behind <SessionTimeout />.
 *
 * Two independent limits, both decided by the product owner (2026-09-28):
 *
 *  - IDLE: 30 minutes with no activity signs you out, with a warning 2 minutes before.
 *    Tracked here in the browser; shared across tabs through localStorage so activity in one
 *    tab keeps the others alive.
 *  - ABSOLUTE: 12 hours after sign-in, no matter how active you are. ENFORCED BY THE SERVER
 *    (the refresh token inherits its deadline across rotations). The backends also plant a
 *    readable `session_expires_at` cookie (epoch ms) so an open tab can warn 2 minutes early
 *    and sign out on time instead of sitting on a stale screen until its next API call.
 *
 * Everything here is pure: the component feeds it `now` from the wall clock on every tick,
 * so a laptop that slept through a deadline is handled on the first tick after waking,
 * not whenever a long setTimeout happens to fire.
 */

/** The server's hard limit. Used here only to derive sign-in time from the deadline cookie. */
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_LEAD_MS = 2 * 60 * 1000;
export const EXPIRY_WARNING_LEAD_MS = 2 * 60 * 1000;

/** Last activity (epoch ms), shared across tabs. Wiped with the rest of the user's state on logout. */
export const LAST_ACTIVITY_KEY = "fm_last_activity";
/** Cross-tab logout broadcast. Preserved by resetClientState so it survives the wipe it triggers. */
export const LOGOUT_BROADCAST_KEY = "fm_session_logout";
export const SESSION_EXPIRES_COOKIE = "session_expires_at";

export type LogoutReason = "idle" | "expired";

export type SessionState =
  | { kind: "active" }
  | { kind: "idle-warning"; msRemaining: number }
  | { kind: "expiry-warning"; msRemaining: number }
  | { kind: "logout"; reason: LogoutReason };

/** Read the absolute deadline from a cookie string. Missing or malformed → null (idle only). */
export function parseSessionExpiresAt(cookieString: string): number | null {
  for (const part of cookieString.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== SESSION_EXPIRES_COOKIE) continue;
    const raw = decodeURIComponent(rest.join("=").trim());
    if (!/^\d+$/.test(raw)) return null;
    const ms = Number(raw);
    return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
  }
  return null;
}

/**
 * Where the session stands at `now`. The absolute deadline wins over idle when both are due,
 * because it is the one the server will enforce regardless. When both warnings are live, the
 * one that ends sooner is shown.
 */
export function evaluateSession(input: {
  now: number;
  lastActivity: number;
  expiresAt: number | null;
}): SessionState {
  const { now, lastActivity, expiresAt } = input;
  const idleRemaining = lastActivity + IDLE_TIMEOUT_MS - now;
  const expiryRemaining = expiresAt === null ? Infinity : expiresAt - now;

  if (expiryRemaining <= 0) return { kind: "logout", reason: "expired" };
  if (idleRemaining <= 0) return { kind: "logout", reason: "idle" };

  const expiryWarning = expiryRemaining <= EXPIRY_WARNING_LEAD_MS;
  const idleWarning = idleRemaining <= IDLE_WARNING_LEAD_MS;

  if (expiryWarning && (!idleWarning || expiryRemaining <= idleRemaining)) {
    return { kind: "expiry-warning", msRemaining: expiryRemaining };
  }
  if (idleWarning) return { kind: "idle-warning", msRemaining: idleRemaining };
  return { kind: "active" };
}

/** 125_000 → "2:05". Rounds UP so the display never shows 0:00 while time remains. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function readLastActivity(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(ms: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(ms));
  } catch {
    // Private mode / quota — idle still works per-tab from the in-memory value.
  }
}

export function broadcastLogout(reason: LogoutReason, at: number): void {
  try {
    window.localStorage.setItem(LOGOUT_BROADCAST_KEY, JSON.stringify({ reason, at }));
  } catch {
    // Other tabs will still notice on their next API call (the server session is gone).
  }
}

export function parseLogoutBroadcast(raw: string | null): LogoutReason | null {
  if (!raw) return null;
  try {
    const { reason } = JSON.parse(raw) as { reason?: unknown };
    return reason === "idle" || reason === "expired" ? reason : null;
  } catch {
    return null;
  }
}
