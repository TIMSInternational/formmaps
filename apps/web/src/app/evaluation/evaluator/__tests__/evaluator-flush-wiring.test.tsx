/**
 * Evaluator page (token-scoped 360/vocational runner) — live per-event
 * violation flush wiring. `useProctoring`'s debounced `onFlush` capability
 * (tested in isolation in `useProctoring.test.ts`) must actually reach
 * `postViolations` against the token-scoped violations endpoint once the
 * token is known, using the exact URL the pagehide backstop already uses,
 * and must no-op (never throw) before a token exists.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import EvaluatorPage from "../page";

let mockToken: string | null = "tok-abc";

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? mockToken : null) }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "en" },
  }),
}));

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get: () => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
          React.createElement("div", {}, children),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock("@/store/useGlobalStore", () => {
  const store = { user: { isAuthenticated: false } };
  const useGlobalStore = () => store;
  return { useGlobalStore };
});

jest.mock("@/components/proctoring/RequireChromium", () => ({
  RequireChromium: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/proctoring/ProctoredShell", () => ({
  ProctoredShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockPostViolations = jest.fn();
jest.mock("@/components/proctoring/flushViolations", () => ({
  installViolationFlush: () => () => {},
  flushViolations: () => {},
  postViolations: (...args: unknown[]) => mockPostViolations(...args),
}));

jest.mock("@/app/evaluation/evaluator/_components/VocationalEvaluator", () => ({
  VocationalEvaluator: () => <div>Vocational form loaded</div>,
}));

const mockValidateToken = jest.fn();
jest.mock("@/services/evaluationService", () => ({
  validateEvaluationToken: (...args: unknown[]) => mockValidateToken(...args),
  sendEvaluatorViolations: jest.fn(),
}));

const API_BASE = "";

describe("Evaluator page — live per-event violation flush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken = "tok-abc";
    mockValidateToken.mockResolvedValue({ isValid: true, instrument: "vocational" });
    // Report the runner as already fullscreen so activating lockdown doesn't
    // ALSO auto-record a "fullscreen_exit" violation (jsdom has no real
    // fullscreen API) — that would schedule its own debounce timer before
    // this test switches to fake timers, contaminating the assertion below.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  });

  it("does not call postViolations before a token exists, and does not throw", async () => {
    mockToken = null;
    render(<EvaluatorPage />);
    await waitFor(() => expect(screen.getByText(/errNoToken/)).toBeInTheDocument());

    jest.useFakeTimers();
    expect(() => {
      act(() => {
        document.dispatchEvent(new Event("contextmenu", { cancelable: true }));
      });
      act(() => {
        jest.advanceTimersByTime(2100);
      });
    }).not.toThrow();

    expect(mockPostViolations).not.toHaveBeenCalled();
  });

  it("flushes ONE live violation batch to the token-scoped violations endpoint within the debounce window once the token is known", async () => {
    render(<EvaluatorPage />);
    await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
    // Flush the beginProctoring() re-render cascade that fires from inside
    // the "begin once interactive" effect — the same one-render lag as the
    // personality runner (a plain macrotask tick is required for jsdom +
    // React's Scheduler to actually flush this pending update).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    jest.useFakeTimers();
    act(() => {
      document.dispatchEvent(new Event("contextmenu", { cancelable: true }));
    });
    expect(mockPostViolations).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(mockPostViolations).toHaveBeenCalledTimes(1);
    const [url, violations, opts] = mockPostViolations.mock.calls[0];
    expect(url).toBe(`${API_BASE}/evaluation/vocational/tok-abc/violations`);
    expect(violations.some((v: { type: string }) => v.type === "context_menu")).toBe(true);
    expect(opts.token).toBeUndefined();
  });

  it("requeues a failed live flush into the proctoring buffer so the SAME violation is resent on the next flush (no evidence loss)", async () => {
    render(<EvaluatorPage />);
    await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
    // Flush the beginProctoring() re-render cascade that fires from inside
    // the "begin once interactive" effect — the same one-render lag as the
    // personality runner (a plain macrotask tick is required for jsdom +
    // React's Scheduler to actually flush this pending update).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    jest.useFakeTimers();
    // Simulate a failed send: real `postViolations` invokes the `requeue`
    // option it was given with the drained batch on a non-ok response or
    // network failure — mirror that here instead of actually sending.
    mockPostViolations.mockImplementation(
      (_url: string, violations: unknown[], opts: { requeue?: (v: unknown[]) => void }) => {
        opts.requeue?.(violations);
      },
    );

    act(() => {
      document.dispatchEvent(new Event("contextmenu", { cancelable: true }));
    });
    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(mockPostViolations).toHaveBeenCalledTimes(1);
    const firstBatch = mockPostViolations.mock.calls[0][1] as { type: string }[];
    expect(firstBatch.some((v) => v.type === "context_menu")).toBe(true);

    // A second violation schedules another debounced flush — the requeued
    // violation from the failed send above must still be in the buffer and
    // get resent, proving the requeue→resend loop (no evidence loss).
    act(() => {
      document.dispatchEvent(new Event("contextmenu", { cancelable: true }));
    });
    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(mockPostViolations).toHaveBeenCalledTimes(2);
    const secondBatch = mockPostViolations.mock.calls[1][1] as { type: string }[];
    expect(secondBatch).toEqual(expect.arrayContaining(firstBatch));
  });
});
