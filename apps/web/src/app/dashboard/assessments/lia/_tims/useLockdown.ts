"use client";

/**
 * Lockdown-lite — the tims-suite exam-integrity layer without the NexaVerify
 * vendor: fullscreen enforcement, violation capture (tab switch, blur,
 * copy/paste/cut, context menu, blocked keys), and an elapsed-time clock.
 * Face verification is stubbed behind NEXT_PUBLIC_LIA_FACE_VERIFY until a
 * proctoring vendor is provisioned.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LockdownViolation } from "@/services/liaService";

export const FACE_VERIFY_ENABLED = process.env.NEXT_PUBLIC_LIA_FACE_VERIFY === "true";

const BLOCKED_KEYS = new Set(["F12", "PrintScreen"]);

export interface Lockdown {
  active: boolean;
  elapsedTime: string;
  needsFullscreenPrompt: boolean;
  enterFullscreen: () => void;
  begin: () => void;
  end: () => void;
  violations: React.MutableRefObject<LockdownViolation[]>;
  drainViolations: () => LockdownViolation[];
}

function formatElapsed(startMs: number): string {
  const total = Math.floor((Date.now() - startMs) / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function useLockdown(): Lockdown {
  const [active, setActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(false);
  const startRef = useRef<number>(0);
  const violations = useRef<LockdownViolation[]>([]);

  const recordViolation = useCallback((type: string, details?: string) => {
    violations.current.push({ type, timestamp: new Date().toISOString(), details });
  }, []);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const begin = useCallback(() => {
    startRef.current = Date.now();
    setActive(true);
    enterFullscreen();
  }, [enterFullscreen]);

  const end = useCallback(() => {
    setActive(false);
    setNeedsFullscreenPrompt(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Elapsed clock
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsedTime(formatElapsed(startRef.current)), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Fullscreen enforcement
  useEffect(() => {
    if (!active) return;
    const onChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setNeedsFullscreenPrompt(!inFullscreen);
      if (!inFullscreen) recordViolation("fullscreen_exit");
    };
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [active, recordViolation]);

  // Violation listeners
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.hidden) recordViolation("tab_switch");
    };
    const onBlur = () => recordViolation("window_blur");
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
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, recordViolation]);

  const drainViolations = useCallback(() => {
    const drained = violations.current;
    violations.current = [];
    return drained;
  }, []);

  return { active, elapsedTime, needsFullscreenPrompt, enterFullscreen, begin, end, violations, drainViolations };
}
