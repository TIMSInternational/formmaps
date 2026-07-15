"use client";

/**
 * Incremental violation flush that survives a killed tab. On
 * `visibilitychange`→hidden and on `pagehide` we drain the proctoring buffer
 * and ship it WITHOUT blocking unload:
 *  - token-scoped (unauthenticated) endpoints → `navigator.sendBeacon` (no auth
 *    header needed; queued by the browser even as the tab closes).
 *  - authed endpoints (LIA / PCA) → `fetch(..., { keepalive: true })`, which
 *    also survives unload AND can set the Authorization header + send cookies,
 *    which sendBeacon cannot.
 * Callers also flush normally on submit/complete via `flushViolations`.
 */
import type { LockdownViolation } from "./types";

export type ViolationTransport = "beacon" | "keepalive";

export interface ViolationFlushConfig {
  url: string;
  transport: ViolationTransport;
  /** Drains the proctoring buffer, returning (and clearing) pending violations. */
  drain: () => LockdownViolation[];
  /** Bearer token for `keepalive` (authed) transport. Cookies still carry auth. */
  token?: () => string | null | undefined;
  /**
   * Put violations back into the buffer when a send fails, so the evidence is
   * retried on the next flush instead of being lost (the buffer was already
   * drained/cleared before the send).
   */
  requeue?: (violations: LockdownViolation[]) => void;
}

/** Best-effort authed keepalive POST that survives unload. Requeues on failure. */
function keepaliveSend(config: ViolationFlushConfig, violations: LockdownViolation[], body: string): boolean {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = config.token?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    void fetch(config.url, { method: "POST", keepalive: true, credentials: "include", headers, body })
      .then((r) => { if (!r.ok) config.requeue?.(violations); })
      .catch(() => config.requeue?.(violations));
    return true;
  } catch {
    config.requeue?.(violations);
    return false;
  }
}

/**
 * Drain the buffer and send once. Returns true if a request was issued.
 * Never throws — flushing must never break the exam flow or unload. If a send
 * cannot be issued the drained violations are requeued (never silently lost).
 */
export function flushViolations(config: ViolationFlushConfig): boolean {
  const violations = config.drain();
  if (!violations.length) return false;
  const body = JSON.stringify({ violations });

  if (config.transport === "beacon" && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const queued = navigator.sendBeacon(config.url, new Blob([body], { type: "application/json" }));
      if (queued) return true;
      // Beacon refused (e.g. queue/size limit) — fall back to keepalive fetch.
    } catch {
      // sendBeacon threw — fall back to keepalive fetch.
    }
  }
  return keepaliveSend(config, violations, body);
}

/**
 * Wire visibilitychange (hidden) + pagehide to `flushViolations`. Returns a
 * cleanup that removes both listeners.
 */
export function installViolationFlush(config: ViolationFlushConfig): () => void {
  const onPageHide = () => flushViolations(config);
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.hidden) flushViolations(config);
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
