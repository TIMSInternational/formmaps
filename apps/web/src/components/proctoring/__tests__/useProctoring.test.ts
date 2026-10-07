import { renderHook, act } from "@testing-library/react";
import { useProctoring } from "../useProctoring";
import { useLockdown } from "@/app/dashboard/assessments/lia/_tims/useLockdown";
import type { LockdownViolation } from "../types";

function setHidden(v: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  try {
    delete (window.screen as Screen & { isExtended?: boolean }).isExtended;
  } catch {
    /* ignore */
  }
});

describe("useProctoring", () => {
  it("is the same implementation the LIA re-export exposes (promotion identity)", () => {
    expect(useLockdown).toBe(useProctoring);
  });

  it("blocks on tab switch (focusLost) and clears on return, recording the violation", () => {
    const { result } = renderHook(() => useProctoring());
    act(() => result.current.begin());
    act(() => setHidden(true));
    expect(result.current.focusLost).toBe(true);
    act(() => setHidden(false));
    expect(result.current.focusLost).toBe(false);
    expect(result.current.violations.current.some((v) => v.type === "tab_switch")).toBe(true);
  });

  it("flags a second/extended monitor on begin via screen.isExtended", () => {
    Object.defineProperty(window.screen, "isExtended", { configurable: true, get: () => true });
    const { result } = renderHook(() => useProctoring());
    act(() => result.current.begin());
    expect(result.current.multiDisplay).toBe(true);
    expect(result.current.violations.current.some((v) => v.type === "multi_display")).toBe(true);
  });

  it("drains the violation buffer, emptying it", () => {
    const { result } = renderHook(() => useProctoring());
    act(() => result.current.begin());
    act(() => setHidden(true));
    let drained: ReturnType<typeof result.current.drainViolations> = [];
    act(() => {
      drained = result.current.drainViolations();
    });
    expect(drained.some((v) => v.type === "tab_switch")).toBe(true);
    expect(result.current.violations.current).toHaveLength(0);
  });

  describe("window blur vs an embedded iframe (PCA survey)", () => {
    let iframe: HTMLIFrameElement;
    beforeEach(() => {
      jest.useFakeTimers();
      iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
    });
    afterEach(() => {
      iframe.remove();
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    const blurs = (v: LockdownViolation[]) => v.filter((x) => x.type === "window_blur").length;

    it("does NOT warn or record when a click moves focus into an iframe on the page", () => {
      const { result } = renderHook(() => useProctoring());
      act(() => result.current.begin());
      jest.spyOn(document, "activeElement", "get").mockReturnValue(iframe);
      jest.spyOn(document, "hasFocus").mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(3000);
      });
      expect(result.current.focusLost).toBe(false);
      expect(blurs(result.current.violations.current)).toBe(0);
    });

    it("still warns and records when the window really loses focus", () => {
      const { result } = renderHook(() => useProctoring());
      act(() => result.current.begin());
      jest.spyOn(document, "hasFocus").mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(1);
      });
      expect(result.current.focusLost).toBe(true);
      expect(blurs(result.current.violations.current)).toBe(1);
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(result.current.focusLost).toBe(false);
    });

    it("clears a blur warning when the student comes back straight into the iframe (no window focus event)", () => {
      const { result } = renderHook(() => useProctoring());
      act(() => result.current.begin());
      const hasFocus = jest.spyOn(document, "hasFocus").mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("blur")); // alt-tab away from the page itself
        jest.advanceTimersByTime(1);
      });
      expect(result.current.focusLost).toBe(true);

      jest.spyOn(document, "activeElement", "get").mockReturnValue(iframe);
      hasFocus.mockReturnValue(true); // back, clicking straight into the survey
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.focusLost).toBe(false);
    });

    it("catches leaving from INSIDE the iframe (no second blur fires) and clears on return", () => {
      const flushed: LockdownViolation[] = [];
      const { result } = renderHook(() => useProctoring({ onFlush: (v) => flushed.push(...v) }));
      const all = () => [...flushed, ...result.current.violations.current];
      act(() => result.current.begin());
      jest.spyOn(document, "activeElement", "get").mockReturnValue(iframe);
      const hasFocus = jest.spyOn(document, "hasFocus").mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.focusLost).toBe(false);

      hasFocus.mockReturnValue(false); // alt-tab away while answering in the survey
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.focusLost).toBe(true);
      expect(blurs(all())).toBe(1);

      act(() => {
        jest.advanceTimersByTime(3000); // still away: no duplicate violations
      });
      expect(blurs(all())).toBe(1);

      hasFocus.mockReturnValue(true); // back, focus restored into the survey
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.focusLost).toBe(false);
    });
  });

  describe("debounced per-event flush", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("fires onFlush with the buffered violations within the debounce window and drains the buffer", () => {
      const onFlush = jest.fn();
      const { result } = renderHook(() => useProctoring({ onFlush }));
      act(() => result.current.begin());
      act(() => setHidden(true)); // records a "tab_switch" violation

      expect(onFlush).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(2001);
      });

      expect(onFlush).toHaveBeenCalledTimes(1);
      const flushed = onFlush.mock.calls[0][0] as LockdownViolation[];
      expect(flushed.some((v) => v.type === "tab_switch")).toBe(true);
      expect(result.current.violations.current).toHaveLength(0);
    });

    it("coalesces two rapid violations into ONE flush call", () => {
      const onFlush = jest.fn();
      const { result } = renderHook(() => useProctoring({ onFlush }));
      act(() => result.current.begin());
      act(() => setHidden(true)); // violation #1: tab_switch
      act(() => {
        document.dispatchEvent(new Event("contextmenu")); // violation #2: context_menu
      });

      act(() => {
        jest.advanceTimersByTime(2001);
      });

      expect(onFlush).toHaveBeenCalledTimes(1);
      const flushed = onFlush.mock.calls[0][0] as LockdownViolation[];
      expect(flushed.length).toBeGreaterThanOrEqual(2);
    });

    it("honors a custom flushDebounceMs", () => {
      const onFlush = jest.fn();
      const { result } = renderHook(() => useProctoring({ onFlush, flushDebounceMs: 500 }));
      act(() => result.current.begin());
      act(() => setHidden(true));

      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(onFlush).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(2);
      });
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });
});

describe("useProctoring — fullscreen unavailable (#391)", () => {
  const docEl = document.documentElement as HTMLElement & { requestFullscreen?: unknown };
  afterEach(() => {
    delete (docEl as { requestFullscreen?: unknown }).requestFullscreen;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => undefined });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  });

  it("does NOT block when the browser has no element fullscreen (iOS Safari) and records fullscreen_unavailable once", () => {
    const { result } = renderHook(() => useProctoring());
    act(() => result.current.begin());
    expect(result.current.needsFullscreenPrompt).toBe(false);
    expect(result.current.fullscreenUnavailable).toBe(true);
    act(() => result.current.enterFullscreen());
    const hits = result.current.violations.current.filter((v) => v.type === "fullscreen_unavailable");
    expect(hits).toHaveLength(1);
    expect(result.current.violations.current.some((v) => v.type === "fullscreen_exit")).toBe(false);
  });

  it("does NOT block when a user-initiated requestFullscreen rejects (kiosk policy / automation) and records the violation", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    docEl.requestFullscreen = jest.fn(() => Promise.reject(new Error("denied")));
    const { result } = renderHook(() => useProctoring());
    await act(async () => {
      result.current.begin();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The automatic, gesture-less request in begin() being refused is normal in
    // Chromium — it must NOT disable enforcement on its own.
    expect(result.current.needsFullscreenPrompt).toBe(true);
    expect(result.current.fullscreenUnavailable).toBe(false);
    // The overlay's button (a real user gesture) is refused too → unavailable.
    await act(async () => {
      result.current.enterFullscreen();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.needsFullscreenPrompt).toBe(false);
    expect(result.current.fullscreenUnavailable).toBe(true);
    expect(result.current.violations.current.filter((v) => v.type === "fullscreen_unavailable")).toHaveLength(1);
  });

  it("still blocks (enforce) when fullscreen is supported but the taker is not in fullscreen", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    docEl.requestFullscreen = jest.fn(() => Promise.resolve());
    const { result } = renderHook(() => useProctoring());
    await act(async () => {
      result.current.begin();
      await Promise.resolve();
    });
    expect(docEl.requestFullscreen).toHaveBeenCalled();
    expect(result.current.needsFullscreenPrompt).toBe(true);
    expect(result.current.fullscreenUnavailable).toBe(false);
  });
});

describe("useProctoring — save and exit (#391)", () => {
  it("exit() flushes buffered violations immediately and ends the session", () => {
    const onFlush = jest.fn();
    const { result } = renderHook(() => useProctoring({ onFlush }));
    act(() => result.current.begin());
    act(() => setHidden(true));
    act(() => result.current.exit());
    expect(onFlush).toHaveBeenCalled();
    const flushed = onFlush.mock.calls.flatMap((c) => c[0] as LockdownViolation[]);
    expect(flushed.some((v) => v.type === "tab_switch")).toBe(true);
    expect(result.current.active).toBe(false);
    expect(result.current.focusLost).toBe(false);
  });
});

describe("useProctoring — record mode (#392)", () => {
  it("captures violations but never raises a blocking flag nor requests fullscreen", () => {
    const docEl = document.documentElement as HTMLElement & { requestFullscreen?: unknown };
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    docEl.requestFullscreen = jest.fn(() => Promise.resolve());
    Object.defineProperty(window.screen, "isExtended", { configurable: true, get: () => true });
    const { result } = renderHook(() => useProctoring({ mode: "record" }));
    act(() => result.current.begin());
    act(() => setHidden(true));
    expect(result.current.mode).toBe("record");
    expect(result.current.multiDisplay).toBe(false);
    expect(result.current.focusLost).toBe(false);
    expect(result.current.needsFullscreenPrompt).toBe(false);
    expect(docEl.requestFullscreen).not.toHaveBeenCalled();
    const types = result.current.violations.current.map((v) => v.type);
    expect(types).toEqual(expect.arrayContaining(["multi_display", "tab_switch"]));
    expect(types).not.toContain("fullscreen_exit");
    delete (docEl as { requestFullscreen?: unknown }).requestFullscreen;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => undefined });
  });

  it("defaults to enforce", () => {
    const { result } = renderHook(() => useProctoring());
    expect(result.current.mode).toBe("enforce");
  });
});
