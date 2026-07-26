/**
 * Personality page — live per-event violation flush wiring. `useProctoring`'s
 * debounced `onFlush` capability (tested in isolation in
 * `useProctoring.test.ts`) must actually reach `postViolations` against the
 * personality session endpoint once a session exists, using the exact
 * URL/token the pagehide backstop already uses, and must no-op (never throw)
 * before a session id exists.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import PersonalityAssessmentPage from "../page";
import { personalityApi } from "@/services/personalityService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts && typeof opts === "object" ? `${k} ${JSON.stringify(opts)}` : k,
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
  };
});

jest.mock("@/store/useGlobalStore", () => {
  const store = {
    language: "english",
    setAssessmentActive: jest.fn(),
    user: { id: "u1", accessToken: "tok-456" },
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

jest.mock("@/services/personalityService", () => ({
  personalityApi: {
    getAccess: jest.fn(),
    start: jest.fn(),
    answer: jest.fn(),
    complete: jest.fn(),
  },
}));

const mockAccess = personalityApi.getAccess as jest.Mock;
const mockStart = personalityApi.start as jest.Mock;

const API_BASE = "";

describe("Personality page — live per-event violation flush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ has_access: true, has_completed: false });
    mockStart.mockResolvedValue({
      session_id: "pers-sess-1",
      status: "in_progress",
      variant: "estudiantil",
      language: "en",
      answered_item_numbers: [],
      items: [
        { n: 1, dimension: "EI", prompt: "First prompt", optionA: "One A", optionB: "One B" },
      ],
    });
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

  it("does not call postViolations before a session exists (loading phase), and does not throw", async () => {
    mockAccess.mockImplementation(() => new Promise(() => {})); // never resolves — stays in "loading"
    render(<PersonalityAssessmentPage />);

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

  it("flushes ONE live violation batch to the personality session endpoint within the debounce window once a session exists", async () => {
    render(<PersonalityAssessmentPage />);
    await waitFor(() => expect(screen.getByText("First prompt")).toBeInTheDocument());
    // Flush the setActive(true) re-render cascade that "begin proctoring"
    // triggers from inside its own effect — waitFor resolves as soon as the
    // item renders, one render before that cascade's listeners actually attach.
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
    expect(url).toBe(`${API_BASE}/api/v1/personality/session/pers-sess-1/violations`);
    expect(violations.some((v: { type: string }) => v.type === "context_menu")).toBe(true);
    expect(opts.token).toBe("tok-456");
  });

  it("requeues a failed live flush into the proctoring buffer so the SAME violation is resent on the next flush (no evidence loss)", async () => {
    render(<PersonalityAssessmentPage />);
    await waitFor(() => expect(screen.getByText("First prompt")).toBeInTheDocument());
    // Flush the setActive(true) re-render cascade that "begin proctoring"
    // triggers from inside its own effect — waitFor resolves as soon as the
    // item renders, one render before that cascade's listeners actually attach.
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
