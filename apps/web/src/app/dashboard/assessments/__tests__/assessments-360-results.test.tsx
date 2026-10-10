/**
 * audit 2026-10-09 C13 — the 360 card's "View results" opens the student's own
 * vocational 360 report, not the invite-management page; before results exist
 * the card still goes to evaluator management.
 */
import { render, screen, waitFor } from "@testing-library/react";
import AssessmentsPage from "@/app/dashboard/assessments/page";

let mockEvaluationStatus: string | undefined;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => (typeof d === "string" ? d : k), i18n: { language: "en" } }),
}));
jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      { get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) },
    ),
  };
});
jest.mock("@/store/useGlobalStore", () => {
  const store = { user: { id: "u1", name: "Test", email: "t@t.dev" }, language: "english" };
  return { useGlobalStore: () => store };
});
jest.mock("@/hooks/usePCAData", () => ({ usePCAData: () => ({ hasPCA: false, isCompleted: false }) }));
jest.mock("@/hooks/useEvaluationData", () => ({ useEvaluationData: () => ({ isLoading: false }) }));
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useDashboardAssessmentSummary: () => ({
    data: { assessments: mockEvaluationStatus ? [{ type: "evaluation", status: mockEvaluationStatus }] : [] },
    isLoading: false,
  }),
  useEvaluationGroups: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/contexts/AssessmentCacheContext", () => ({
  useAssessmentCache: () => ({ invalidateSpecificAssessment: jest.fn() }),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/services/milService", () => ({ retryPendingSubmissions: () => Promise.resolve() }));
jest.mock("@/services/evaluationService", () => ({ getSelfEvaluationUrl: jest.fn() }));
jest.mock("@/services/personalityService", () => ({
  personalityApi: { getAccess: jest.fn().mockResolvedValue({ has_access: true, has_completed: false }) },
}));

function card360Link() {
  return screen.getByText("dashboard.evaluationTitle").closest("a");
}

describe("AssessmentsPage — 360 card (C13)", () => {
  it("completed 360: View results opens the student's own vocational 360 report", async () => {
    mockEvaluationStatus = "completed";
    render(<AssessmentsPage />);
    await waitFor(() => expect(screen.getByText("dashboard.evaluationTitle")).toBeInTheDocument());
    expect(card360Link()).toHaveAttribute("href", "/dashboard/assessments/vocational");
  });

  it("360 not completed: the card still goes to evaluator management", async () => {
    mockEvaluationStatus = "in_progress";
    render(<AssessmentsPage />);
    await waitFor(() => expect(screen.getByText("dashboard.evaluationTitle")).toBeInTheDocument());
    expect(card360Link()).toHaveAttribute("href", "/dashboard/assessments/evaluation");
  });
});
