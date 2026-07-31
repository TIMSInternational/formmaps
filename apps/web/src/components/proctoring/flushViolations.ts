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

export interface PostViolationsOptions {
  /** Bearer token, if the endpoint is authed. Cookies still carry auth. */
  token?: string | null;
  /**
   * Put violations back into the caller's buffer when the send fails, so the
   * evidence is retried on the next flush instead of being lost.
   */
  requeue?: (violations: LockdownViolation[]) => void;
}

/**
 * Best-effort authed keepalive POST that survives unload. Never throws —
 * flushing must never break the exam flow or unload. Requeues on failure via
 * `opts.requeue` (never silently lost). Shared by the pagehide/tab-hide
 * backstop below AND by `useProctoring`'s per-event debounced live flush.
 */
export function postViolations(url: string, violations: LockdownViolation[], opts: PostViolationsOptions = {}): void {
  if (!violations.length) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const body = JSON.stringify({ violations });
  try {
    void fetch(url, { method: "POST", keepalive: true, credentials: "include", headers, body })
      .then((r) => { if (!r.ok) opts.requeue?.(violations); })
      .catch(() => opts.requeue?.(violations));
  } catch {
    opts.requeue?.(violations);
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

  if (config.transport === "beacon" && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const body = JSON.stringify({ violations });
      const queued = navigator.sendBeacon(config.url, new Blob([body], { type: "application/json" }));
      if (queued) return true;
      // Beacon refused (e.g. queue/size limit) — fall back to keepalive fetch.
    } catch {
      // sendBeacon threw — fall back to keepalive fetch.
    }
  }
  postViolations(config.url, violations, { token: config.token?.(), requeue: config.requeue });
  return true;
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
