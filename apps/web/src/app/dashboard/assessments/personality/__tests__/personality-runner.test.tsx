/**
 * Personality runner — renders one item and advances on an A/B choice.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PersonalityAssessmentPage from "@/app/dashboard/assessments/personality/page";
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
    user: { id: "u1", accessToken: "tok" },
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
jest.mock("@/components/proctoring/useProctoring", () => ({
  useProctoring: () => ({
    active: false,
    elapsedTime: "00:00:00",
    needsFullscreenPrompt: false,
    focusLost: false,
    multiDisplay: false,
    enterFullscreen: jest.fn(),
    begin: jest.fn(),
    end: jest.fn(),
    violations: { current: [] },
    drainViolations: () => [],
  }),
}));
jest.mock("@/components/proctoring/flushViolations", () => ({
  installViolationFlush: () => () => {},
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
const mockAnswer = personalityApi.answer as jest.Mock;

describe("PersonalityAssessmentPage runner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ has_access: true, has_completed: false });
    mockStart.mockResolvedValue({
      session_id: "sess-1",
      status: "in_progress",
      variant: "estudiantil",
      language: "en",
      answered_item_numbers: [],
      items: [
        { n: 1, dimension: "EI", prompt: "First prompt", optionA: "One A", optionB: "One B" },
        { n: 2, dimension: "SN", prompt: "Second prompt", optionA: "Two A", optionB: "Two B" },
      ],
    });
    mockAnswer.mockResolvedValue({ session_id: "sess-1", answered_count: 1, total_items: 2, complete: false });
  });

  it("renders the first item, then advances to the next on an A/B choice", async () => {
    render(<PersonalityAssessmentPage />);

    // First item served.
    await waitFor(() => expect(screen.getByText("First prompt")).toBeInTheDocument());
    expect(screen.getByText("One A")).toBeInTheDocument();
    expect(screen.getByText("One B")).toBeInTheDocument();

    // Choose option A → persists and advances.
    fireEvent.click(screen.getByText("One A"));

    await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith("sess-1", 1, "A"));
    await waitFor(() => expect(screen.getByText("Second prompt")).toBeInTheDocument());
  });
});
