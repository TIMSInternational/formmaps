/**
 * LIA page — live per-event violation flush wiring. `useLockdown`'s debounced
 * `onFlush` capability (proctoring layer, tested in isolation in
 * `useProctoring.test.ts`) must actually reach `postViolations` against the
 * LIA session endpoint once a session exists, using the exact URL/token the
 * pagehide backstop already uses, and must no-op (never throw) before a
 * session id exists.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import LIAAssessmentPage from "../page";

const api = {
  checkAccess: jest.fn(),
  start: jest.fn(),
};

jest.mock("@/services/liaService", () => {
  const actual = jest.requireActual("@/services/liaService");
  const mocked = { ...actual };
  Object.defineProperty(mocked, "liaAssessmentApi", { get: () => api, configurable: true });
  return mocked;
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

jest.mock("@/store/useGlobalStore", () => {
  const store = {
    setAssessmentActive: jest.fn(),
    user: { id: "u1", email: "student@formmaps.dev", accessToken: "tok-123" },
  };
  const useGlobalStore = () => store;
  (useGlobalStore as unknown as { getState: () => typeof store }).getState = () => store;
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
  postViolations: (...args: unknown[]) => mockPostViolations(...args),
}));

const API_BASE = "";

describe("LIA page — live per-event violation flush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.checkAccess.mockResolvedValue({ has_access: true, has_completed: false });
    api.start.mockResolvedValue({
      session_id: "lia-sess-1",
      current_subtest: "pattern_recognition",
      practice_questions: [],
    });
    // Report the runner as already fullscreen so activating lockdown doesn't
    // ALSO auto-record a "fullscreen_exit" violation (jsdom has no real
    // fullscreen API) — that would schedule its own debounce timer before this
    // test switches to fake timers, contaminating the assertion below.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  });

  it("does not call postViolations before a session exists (overview phase), and does not throw", async () => {
    render(<LIAAssessmentPage />);
    await waitFor(() => expect(screen.getByText("Start Assessment")).toBeInTheDocument());

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

  it("flushes ONE live violation batch to the LIA session endpoint within the debounce window once a session exists", async () => {
    render(<LIAAssessmentPage />);
    await waitFor(() => expect(screen.getByText("Start Assessment")).toBeInTheDocument());

    // Begin the session — activates lockdown AND sets sessionId together.
    await act(async () => {
      screen.getByText("Start Assessment").click();
    });
    // Wait for the actual phase transition (general-instructions), not just
    // the API call — lockdown only goes `active` once this render lands.
    await waitFor(() => expect(screen.getByText("General Instructions")).toBeInTheDocument());

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
    expect(url).toBe(`${API_BASE}/api/v1/lia/session/lia-sess-1/violations`);
    expect(violations.some((v: { type: string }) => v.type === "context_menu")).toBe(true);
    expect(opts.token).toBe("tok-123");
  });

  it("requeues a failed live flush into the proctoring buffer so the SAME violation is resent on the next flush (no evidence loss)", async () => {
    render(<LIAAssessmentPage />);
    await waitFor(() => expect(screen.getByText("Start Assessment")).toBeInTheDocument());

    // Begin the session — activates lockdown AND sets sessionId together.
    await act(async () => {
      screen.getByText("Start Assessment").click();
    });
    await waitFor(() => expect(screen.getByText("General Instructions")).toBeInTheDocument());

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
