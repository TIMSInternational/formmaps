"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGlobalStore } from "@/store/useGlobalStore";
import { clearTokens, isLoggedIn } from "@/services/tokenRefreshService";
import { hardNavigate } from "@/lib/session/navigate";
import {
  LAST_ACTIVITY_KEY,
  LOGOUT_BROADCAST_KEY,
  SESSION_MAX_MS,
  broadcastLogout,
  evaluateSession,
  formatCountdown,
  parseLogoutBroadcast,
  parseSessionExpiresAt,
  readLastActivity,
  writeLastActivity,
  type LogoutReason,
  type SessionState,
} from "@/lib/session/sessionTimeout";

const TICK_MS = 1000;
/** Activity is recorded in memory on every event but written to storage at most this often. */
const ACTIVITY_WRITE_THROTTLE_MS = 5000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

/**
 * Signs the user out after 30 minutes idle or at the server's 12-hour deadline, with a
 * 2-minute warning for each. Mounted once in AuthWrapper, so it covers every signed-in
 * route; renders nothing and runs no timers while signed out. See lib/session/sessionTimeout.
 */
export function SessionTimeout() {
  const { t } = useTranslation();
  const isAuthenticated = useGlobalStore((s) => s.user.isAuthenticated);
  const assessmentActive = useGlobalStore((s) => s.assessmentActive);
  const [state, setState] = useState<SessionState>({ kind: "active" });

  const lastActivityRef = useRef(0);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);
  const stateKindRef = useRef<SessionState["kind"]>("active");

  const performLogout = useCallback((reason: LogoutReason, broadcast = true) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    // Broadcast first: the store's logout wipes storage, and the marker is allowlisted so it
    // survives that wipe as a real value change the other tabs can observe.
    if (broadcast) broadcastLogout(reason, Date.now());
    useGlobalStore.getState().logout(); // revokes server-side + resets client state
    clearTokens();
    const here = window.location.pathname + window.location.search;
    const redirect = here && !here.startsWith("/login") ? `&redirect=${encodeURIComponent(here)}` : "";
    hardNavigate(`/login?reason=${reason}${redirect}`);
  }, []);

  const setSessionState = useCallback((next: SessionState) => {
    stateKindRef.current = next.kind;
    setState((prev) => {
      if (prev.kind !== next.kind) return next;
      if ("msRemaining" in prev && "msRemaining" in next
          && Math.ceil(prev.msRemaining / 1000) === Math.ceil(next.msRemaining / 1000)) {
        return prev;
      }
      return next;
    });
  }, []);

  const tick = useCallback(() => {
    if (loggingOutRef.current || !isLoggedIn()) return;
    const now = Date.now();
    const stored = readLastActivity();
    if (stored !== null && stored > lastActivityRef.current) lastActivityRef.current = stored;
    const next = evaluateSession({
      now,
      lastActivity: lastActivityRef.current,
      expiresAt: parseSessionExpiresAt(document.cookie),
    });
    if (next.kind === "logout") {
      performLogout(next.reason);
      return;
    }
    setSessionState(next);
  }, [performLogout, setSessionState]);

  useEffect(() => {
    if (!isAuthenticated || !isLoggedIn()) return;
    loggingOutRef.current = false;

    // Start from the shared value when there is one: a user who closed the laptop an hour ago
    // is due for sign-out on return. Floor it at sign-in (derivable from the 12h deadline) so
    // a stale value left by an earlier session can never sign out a fresh one.
    const now = Date.now();
    const expiresAt = parseSessionExpiresAt(document.cookie);
    const signedInAt = expiresAt === null ? 0 : expiresAt - SESSION_MAX_MS;
    const stored = readLastActivity();
    lastActivityRef.current = Math.max(stored ?? now, signedInAt);
    if (stored === null) {
      writeLastActivity(now);
      lastWriteRef.current = now;
    }

    const onActivity = () => {
      // With a warning open, only its buttons count — an accidental keypress must not
      // silently dismiss "you are about to be signed out".
      if (stateKindRef.current !== "active") return;
      const at = Date.now();
      lastActivityRef.current = at;
      if (at - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        writeLastActivity(at);
        lastWriteRef.current = at;
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) tick();
      if (e.key === LOGOUT_BROADCAST_KEY) {
        const reason = parseLogoutBroadcast(e.newValue);
        if (reason) performLogout(reason, false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("scroll", onActivity, { passive: true, capture: true });
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(tick, TICK_MS);
    tick();

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("scroll", onActivity, { capture: true });
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [isAuthenticated, tick, performLogout]);

  const staySignedIn = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    writeLastActivity(now);
    lastWriteRef.current = now;
    setSessionState({ kind: "active" });
  };

  if (!isAuthenticated || state.kind === "active" || state.kind === "logout") return null;

  const isIdle = state.kind === "idle-warning";
  const title = isIdle ? t("auth.session.idleTitle") : t("auth.session.expiryTitle");
  const body = isIdle
    ? t(assessmentActive ? "auth.session.idleBodyAssessment" : "auth.session.idleBody")
    : t("auth.session.expiryBody");
  const block = (e: Event) => e.preventDefault();

  return (
    <Dialog open>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
        className="max-w-md"
        style={{
          background: "var(--admin-bg-panel, var(--background))",
          color: "var(--admin-font-primary, var(--foreground))",
          borderColor: "var(--admin-border-default, var(--border))",
        }}
      >
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        <DialogDescription style={{ color: "var(--admin-font-secondary, var(--muted-foreground))" }}>
          {body}
        </DialogDescription>
        <p
          className="text-2xl font-semibold tabular-nums"
          data-testid="session-countdown"
          style={{ color: "var(--admin-font-primary, var(--foreground))" }}
        >
          {t("auth.session.countdown", { time: formatCountdown(state.msRemaining) })}
        </p>
        <div className="flex justify-end gap-2">
          {isIdle ? (
            <>
              <button
                type="button"
                onClick={() => performLogout("idle")}
                className="h-9 px-4 rounded-md text-sm font-medium border"
                style={{
                  background: "transparent",
                  color: "var(--admin-font-secondary, var(--foreground))",
                  borderColor: "var(--admin-border-default, var(--border))",
                }}
              >
                {t("auth.session.signOut")}
              </button>
              <button
                type="button"
                autoFocus
                onClick={staySignedIn}
                className="h-9 px-4 rounded-md text-sm font-semibold"
                style={{ background: "var(--admin-accent-blue, #21707B)", color: "#FFFFFF" }}
              >
                {t("auth.session.staySignedIn")}
              </button>
            </>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={() => performLogout("expired")}
              className="h-9 px-4 rounded-md text-sm font-semibold"
              style={{ background: "var(--admin-accent-blue, #21707B)", color: "#FFFFFF" }}
            >
              {t("auth.session.signInAgain")}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
