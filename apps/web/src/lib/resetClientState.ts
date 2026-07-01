import { getQueryClient } from "@/components/QueryProvider";

/**
 * Device/session-level keys that are safe to keep across an account change.
 * Everything NOT listed here is wiped on identity change — an *allowlist*, so
 * any future cache key a developer adds is cleared by default and can never
 * leak one account's data into the next on a shared browser.
 */
const PRESERVED_KEYS = new Set<string>([
  "i18nextLng", // language preference (device-level)
  "telemetry_consent", // analytics consent — legal, must persist per device
  "admin-theme", // light/dark theme preference
  "auth_message", // transient message shown on /login after a forced logout
]);

function wipeExceptAllowlist(store: Storage): void {
  try {
    // Snapshot keys first — removing while iterating live indices is unsafe.
    for (const key of Object.keys(store)) {
      if (!PRESERVED_KEYS.has(key)) store.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private mode / quota) — non-fatal.
  }
}

/**
 * Reset all client-held state that is scoped to the signed-in user.
 *
 * Called on every identity change (login, signup, logout, forced 401 logout)
 * so an account never inherits a previous user's cached data. This is the
 * storage half of the guarantee; remounting the authenticated tree by user id
 * (see AuthWrapper) handles in-memory React state.
 *
 * The persisted zustand store (`timcare-global-store`) is intentionally wiped
 * too — it holds the full user identity, the single most important thing that
 * must not linger. Theme and language survive via their own preserved keys.
 */
export function resetClientState(): void {
  if (typeof window === "undefined") return;
  wipeExceptAllowlist(window.localStorage);
  wipeExceptAllowlist(window.sessionStorage);
  // Drop all cached server responses. Queries are user-keyed, but a hard clear
  // guarantees no cross-account bleed even for a mid-session switch.
  try {
    getQueryClient()?.clear();
  } catch {
    // Query client not initialized yet — nothing to clear.
  }
}
