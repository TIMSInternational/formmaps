/**
 * Assessments catalog — shows the personality card alongside PCA/LIA/360.
 */
import { render, screen, waitFor } from "@testing-library/react";
import AssessmentsPage from "@/app/dashboard/assessments/page";
import { personalityApi } from "@/services/personalityService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k, i18n: { language: "en" } }),
}));

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
      },
    ),
  };
});

jest.mock("@/store/useGlobalStore", () => {
  const store = { user: { id: "u1", name: "Test", email: "t@t.dev" }, language: "english" };
  const useGlobalStore = () => store;
  return { useGlobalStore };
});

jest.mock("@/hooks/usePCAData", () => ({ usePCAData: () => ({ hasPCA: false, isCompleted: false }) }));
jest.mock("@/hooks/useEvaluationData", () => ({ useEvaluationData: () => ({ isLoading: false }) }));
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useDashboardAssessmentSummary: () => ({ data: { assessments: [] }, isLoading: false }),
  useEvaluationGroups: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/contexts/AssessmentCacheContext", () => ({
  useAssessmentCache: () => ({ invalidateSpecificAssessment: jest.fn() }),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/services/milService", () => ({ retryPendingSubmissions: () => Promise.resolve() }));
jest.mock("@/services/evaluationService", () => ({ getSelfEvaluationUrl: jest.fn() }));
jest.mock("@/services/personalityService", () => ({
  personalityApi: { getAccess: jest.fn() },
}));

const mockAccess = personalityApi.getAccess as jest.Mock;

describe("AssessmentsPage catalog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ has_access: true, has_completed: false });
  });

  it("renders the personality assessment card", async () => {
    render(<AssessmentsPage />);
    await waitFor(() =>
      expect(screen.getByText("dashboard.personalityTitle")).toBeInTheDocument(),
    );
    expect(screen.getByText("dashboard.personalityDescription")).toBeInTheDocument();
    // Card links to the personality runner.
    const link = screen.getByText("dashboard.personalityTitle").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/assessments/personality");
  });
});
