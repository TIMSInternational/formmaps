import { renderHook, act } from "@testing-library/react";
import { useProctoring } from "../useProctoring";
import { useLockdown } from "@/app/dashboard/assessments/lia/_tims/useLockdown";

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
});
