"use client";

/**
 * Shared proctoring hook — the exam-integrity layer for EVERY assessment
 * runner (promoted verbatim from LIA's `useLockdown`): fullscreen enforcement,
 * violation capture (tab switch, blur, copy/paste/cut, context menu, blocked
 * keys), second-display detection (Chromium `screen.isExtended`), and an
 * elapsed-time clock. Face verification is stubbed behind
 * NEXT_PUBLIC_LIA_FACE_VERIFY until a proctoring vendor is provisioned.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LockdownViolation } from "./types";

export const FACE_VERIFY_ENABLED = process.env.NEXT_PUBLIC_LIA_FACE_VERIFY === "true";

const BLOCKED_KEYS = new Set(["F12", "PrintScreen"]);

/**
 * - `enforce`: blocking overlays (second display, fullscreen, focus lost) and
 *   forced fullscreen — for timed ability tests (LIA, PCA).
 * - `record`: violations are still captured and flushed as evidence, but the
 *   taker is never blocked and fullscreen is never requested (#392).
 * Per-instrument choice lives in `proctoringModes.ts`.
 */
export type ProctoringMode = "enforce" | "record";

export interface UseProctoringOptions {
  /** Default "enforce". See `ProctoringMode`. */
  mode?: ProctoringMode;
  /** Debounce window (ms) between a recorded violation and the `onFlush` callback. Default 2000. */
  flushDebounceMs?: number;
  /**
   * Called with the drained violation batch once the debounce window elapses
   * after a recorded violation, so evidence ships live instead of only on
   * pagehide/completion. Callers wire this to the same keepalive POST
   * `flushViolations.ts` builds (see `postViolations`).
   */
  onFlush?: (violations: LockdownViolation[]) => void;
}

export interface Proctoring {
  mode: ProctoringMode;
  active: boolean;
  elapsedTime: string;
  needsFullscreenPrompt: boolean;
  /** The window/tab lost focus (tab switch, alt-tab, clicked another window/display). */
  focusLost: boolean;
  /** A second/extended display is connected (Chromium `screen.isExtended`). */
  multiDisplay: boolean;
  /**
   * Fullscreen is unsupported (e.g. iOS Safari has no element fullscreen) or the
   * browser refused it (kiosk policy, automation). Recorded once as a
   * `fullscreen_unavailable` violation; the taker is NOT blocked (#391).
   */
  fullscreenUnavailable: boolean;
  enterFullscreen: () => void;
  begin: () => void;
  end: () => void;
  /** "Save and exit": flush buffered violations now, then end the session. */
  exit: () => void;
  violations: React.MutableRefObject<LockdownViolation[]>;
  drainViolations: () => LockdownViolation[];
}

/** Chromium-only: true when an extended/second display is attached. */
function isExtendedDisplay(): boolean {
  try {
    return typeof window !== "undefined" && (window.screen as Screen & { isExtended?: boolean })?.isExtended === true;
  } catch {
    return false;
  }
}

function fullscreenSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === "function"
  );
}

function formatElapsed(startMs: number): string {
  const total = Math.floor((Date.now() - startMs) / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function useProctoring(opts: UseProctoringOptions = {}): Proctoring {
  const mode: ProctoringMode = opts.mode ?? "enforce";
  const enforce = mode === "enforce";
  const [active, setActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(false);
  const [focusLost, setFocusLost] = useState(false);
  const [multiDisplay, setMultiDisplay] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const fullscreenUnavailableRef = useRef(false);
  const startRef = useRef<number>(0);
  const violations = useRef<LockdownViolation[]>([]);

  // Latest options in a ref so the stable scheduleFlush/flushNow callbacks
  // (and everything that depends on recordViolation's identity) always read
  // the current debounce/onFlush without needing them in a dependency array.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const pendingFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drainViolations = useCallback(() => {
    const drained = violations.current;
    violations.current = [];
    return drained;
  }, []);

  const flushNow = useCallback(() => {
    pendingFlushRef.current = null;
    const drained = drainViolations();
    if (drained.length) optsRef.current.onFlush?.(drained);
  }, [drainViolations]);

  // Debounced so a burst of violations (e.g. rapid tab-switches) coalesces
  // into a single flush instead of one network call per event.
  const scheduleFlush = useCallback(() => {
    if (pendingFlushRef.current) return;
    pendingFlushRef.current = setTimeout(flushNow, optsRef.current.flushDebounceMs ?? 2000);
  }, [flushNow]);

  useEffect(() => {
    return () => {
      if (pendingFlushRef.current) clearTimeout(pendingFlushRef.current);
    };
  }, []);

  const recordViolation = useCallback((type: string, details?: string) => {
    violations.current.push({ type, timestamp: new Date().toISOString(), details });
    scheduleFlush();
  }, [scheduleFlush]);

  // Fullscreen is unsupported or was refused: record it once and stop
  // enforcing it for the rest of the session, so the taker is never trapped
  // behind a "Return to fullscreen" overlay they cannot clear (#391).
  const markFullscreenUnavailable = useCallback((details?: string) => {
    setNeedsFullscreenPrompt(false);
    if (fullscreenUnavailableRef.current) return;
    fullscreenUnavailableRef.current = true;
    setFullscreenUnavailable(true);
    recordViolation("fullscreen_unavailable", details);
  }, [recordViolation]);

  // `fromUserGesture`: only a refusal of an explicit click counts as
  // "unavailable". The automatic request in begin() often runs without a user
  // gesture (after an async load), which Chromium legitimately rejects — that
  // must not switch enforcement off; the overlay's button retries with a gesture.
  const requestFullscreen = useCallback((fromUserGesture: boolean) => {
    if (fullscreenUnavailableRef.current || document.fullscreenElement) return;
    if (!fullscreenSupported()) {
      markFullscreenUnavailable("unsupported");
      return;
    }
    const onRejected = (e?: unknown) => {
      if (fromUserGesture) markFullscreenUnavailable(e instanceof Error ? e.name : "rejected");
    };
    try {
      document.documentElement.requestFullscreen().catch(onRejected);
    } catch (e) {
      onRejected(e);
    }
  }, [markFullscreenUnavailable]);

  const enterFullscreen = useCallback(() => requestFullscreen(true), [requestFullscreen]);

  const begin = useCallback(() => {
    startRef.current = Date.now();
    setActive(true);
    setFocusLost(false);
    const extended = isExtendedDisplay();
    setMultiDisplay(extended);
    if (extended) recordViolation("multi_display");
    if (enforce) requestFullscreen(false);
  }, [enforce, requestFullscreen, recordViolation]);

  const end = useCallback(() => {
    setActive(false);
    setNeedsFullscreenPrompt(false);
    setFocusLost(false);
    setMultiDisplay(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    if (pendingFlushRef.current) clearTimeout(pendingFlushRef.current);
    flushNow();
    end();
  }, [flushNow, end]);

  // Elapsed clock
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsedTime(formatElapsed(startRef.current)), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Fullscreen enforcement (enforce mode only). Never blocks once fullscreen
  // is known to be unavailable — only a browser that CAN go fullscreen is asked to.
  useEffect(() => {
    if (!active || !enforce) return;
    const onChange = () => {
      if (fullscreenUnavailableRef.current) return;
      const inFullscreen = !!document.fullscreenElement;
      setNeedsFullscreenPrompt(!inFullscreen);
      if (!inFullscreen) recordViolation("fullscreen_exit");
    };
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [active, enforce, recordViolation]);

  // Violation listeners
  useEffect(() => {
    if (!active) return;
    const recheckDisplays = () => {
      const extended = isExtendedDisplay();
      setMultiDisplay((prev) => {
        if (extended && !prev) recordViolation("multi_display");
        return extended;
      });
    };
    const onVisibility = () => {
      if (document.hidden) { setFocusLost(true); recordViolation("tab_switch"); }
      else { setFocusLost(false); recheckDisplays(); }
    };
    // Clicking into an embedded iframe (PCA's cross-origin survey) blurs this
    // window although the student never left the page; `hasFocus()` stays true
    // because focus is inside our own document tree. Ignore that blur. Focus
    // moving between the frame and other apps sends this window no further
    // blur/focus events, so a poll catches leaving from inside the frame and
    // coming back into it.
    let windowAway = false;
    const setWindowAway = (away: boolean) => {
      if (away === windowAway) return;
      windowAway = away;
      setFocusLost(away);
      if (away) recordViolation("window_blur");
      else recheckDisplays();
    };
    const focusInEmbeddedFrame = () => document.activeElement instanceof HTMLIFrameElement;
    let blurCheck: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(blurCheck);
      // activeElement only settles after the blur event; check on the next tick.
      blurCheck = setTimeout(() => {
        if (!(focusInEmbeddedFrame() && document.hasFocus())) setWindowAway(true);
      }, 0);
    };
    const onFocus = () => { windowAway = false; setFocusLost(false); recheckDisplays(); };
    const framePoll = setInterval(() => {
      if (windowAway) { if (document.hasFocus()) setWindowAway(false); }
      else if (focusInEmbeddedFrame() && !document.hasFocus()) setWindowAway(true);
    }, 1000);
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation("copy_attempt");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation("paste_attempt");
    };
    const onCut = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation("cut_attempt");
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordViolation("context_menu");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (BLOCKED_KEYS.has(e.key) || (e.key === "Escape" && document.fullscreenElement)) {
        recordViolation("blocked_key", e.key);
      }
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "p", "s", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        recordViolation("blocked_shortcut", e.key.toLowerCase());
      }
    };
    const displayPoll = setInterval(recheckDisplays, 3000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearInterval(displayPoll);
      clearInterval(framePoll);
      clearTimeout(blurCheck);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, recordViolation]);

  // Record mode never exposes a blocking flag; violations are still captured above.
  return {
    mode,
    active,
    elapsedTime,
    needsFullscreenPrompt: enforce && needsFullscreenPrompt,
    focusLost: enforce && focusLost,
    multiDisplay: enforce && multiDisplay,
    fullscreenUnavailable,
    enterFullscreen,
    begin,
    end,
    exit,
    violations,
    drainViolations,
  };
}
