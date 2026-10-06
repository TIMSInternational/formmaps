/**
 * PCA finishes inside TIMS's survey, so the page cannot see it happen. While the survey is open it
 * re-checks status; once TIMS reports it complete the page leaves secure mode, says "completed" and
 * refreshes every screen that shows completion — no reload. "Back" refreshes them too.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import PCAAssessmentPage from "@/app/dashboard/assessments/pca/page";
import { addPCAEvaluation } from "@/services/pcaService";
import { toast } from "sonner";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

const pca = { isCompleted: false, refresh: jest.fn(() => Promise.resolve()) };
jest.mock("@/hooks/usePCAData", () => ({
  usePCAData: () => ({ pcaData: { pcaCod: "1" }, loading: false, error: null, refreshPCAData: pca.refresh, hasPCA: true, isCompleted: pca.isCompleted }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en", resolvedLanguage: "en" } }) }));
jest.mock("@/lib/i18n/useSetLanguage", () => ({ useSetLanguage: () => jest.fn() }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("motion/react", () => {
  const React = require("react");
  return { motion: new Proxy({}, { get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) }) };
});
jest.mock("@/store/useGlobalStore", () => {
  const store = { language: "english", setAssessmentActive: jest.fn(), user: { id: "u1", name: "Ana Diaz", email: "ana@x.dev" } };
  const useGlobalStore = () => store;
  (useGlobalStore as unknown as { getState: () => typeof store }).getState = () => store;
  return { useGlobalStore };
});
jest.mock("@/components/proctoring/RequireChromium", () => ({ RequireChromium: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/proctoring/ProctoredShell", () => ({ ProctoredShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/services/pcaService", () => ({ addPCAEvaluation: jest.fn() }));
jest.mock("../../_components/PCAResultsPanel", () => () => null);

const SURVEY = "https://survey.timshr.com/s/1";
const survey = () => document.querySelector(`iframe[src="${SURVEY}"]`);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  pca.isCompleted = false;
  (addPCAEvaluation as jest.Mock).mockResolvedValue({ success: true, assessmentUrl: SURVEY });
});
afterEach(() => jest.useRealTimers());

async function openSurvey() {
  const view = render(<PCAAssessmentPage />);
  await act(async () => { fireEvent.click(screen.getByText("dashboard.resumePCA")); });
  expect(survey()).not.toBeNull();
  return view;
}

it("re-checks status while the survey is open, and stops once it closes", async () => {
  await openSurvey();
  expect(pca.refresh).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(pca.refresh).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(pca.refresh).toHaveBeenCalledTimes(3);

  await act(async () => { fireEvent.click(screen.getByText("dashboard.backToConfiguration")); });
  expect(mockAssessmentCompleted).toHaveBeenCalledTimes(1); // Back refreshes every reader
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(pca.refresh).toHaveBeenCalledTimes(3);
});

it("when TIMS reports it complete: leaves secure mode, says completed, refreshes every reader", async () => {
  const { rerender } = await openSurvey();
  pca.isCompleted = true; // the next status check came back completed
  await act(async () => { rerender(<PCAAssessmentPage />); });

  expect(survey()).toBeNull();
  expect(toast.success).toHaveBeenCalledWith("dashboard.assessmentCompleted");
  expect(mockAssessmentCompleted).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("dashboard.assessmentCompleted").length).toBeGreaterThan(0); // the badge
});
