/**
 * PCA must never mix languages: the TIMS survey is created in the language the page's own
 * instructions are rendered in (i18next), even when the persisted store disagrees, and the
 * language picker switches the whole app rather than only the survey.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PCAAssessmentPage from "@/app/dashboard/assessments/pca/page";
import { addPCAEvaluation } from "@/services/pcaService";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

let mockUiLanguage = "en";
const mockSetAppLanguage = jest.fn(() => Promise.resolve());

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: mockUiLanguage, resolvedLanguage: mockUiLanguage } }),
}));
jest.mock("@/lib/i18n/useSetLanguage", () => ({ useSetLanguage: () => mockSetAppLanguage }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("motion/react", () => {
  const React = require("react");
  return { motion: new Proxy({}, { get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) }) };
});
jest.mock("@/store/useGlobalStore", () => {
  // The persisted preference deliberately DISAGREES with the UI in every test below.
  const store = { language: "spanish", setAssessmentActive: jest.fn(), user: { id: "u1", name: "Ana Diaz", email: "ana@x.dev" } };
  const useGlobalStore = () => store;
  (useGlobalStore as unknown as { getState: () => typeof store }).getState = () => store;
  return { useGlobalStore };
});
jest.mock("@/hooks/usePCAData", () => ({
  usePCAData: () => ({ pcaData: null, loading: false, error: null, refreshPCAData: jest.fn(), hasPCA: false, isCompleted: false }),
}));
jest.mock("@/services/pcaService", () => ({ addPCAEvaluation: jest.fn() }));
jest.mock("../../_components/PCAResultsPanel", () => () => null);

const mockAdd = addPCAEvaluation as jest.Mock;

beforeEach(() => {
  mockAdd.mockReset().mockResolvedValue({ success: false, message: "stop here" });
  mockSetAppLanguage.mockClear();
});

it("creates the survey in English when the UI is English, though the store says Spanish", async () => {
  mockUiLanguage = "en";
  render(<PCAAssessmentPage />);
  fireEvent.click(screen.getByText("dashboard.startPCA"));
  await waitFor(() => expect(mockAdd).toHaveBeenCalled());
  expect(mockAdd.mock.calls[0][2]).toBe("english");
});

it("creates the survey in Spanish when the UI is Spanish (es-CO)", async () => {
  mockUiLanguage = "es-CO";
  render(<PCAAssessmentPage />);
  fireEvent.click(screen.getByText("dashboard.startPCA"));
  await waitFor(() => expect(mockAdd).toHaveBeenCalled());
  expect(mockAdd.mock.calls[0][2]).toBe("spanish");
});

it("the picker shows the UI language as selected and switches the whole app", () => {
  mockUiLanguage = "en";
  render(<PCAAssessmentPage />);
  const english = screen.getByText("language.english").closest("button")!;
  const spanish = screen.getByText("language.spanish").closest("button")!;
  expect(english).toHaveAttribute("aria-pressed", "true");
  expect(spanish).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(spanish);
  expect(mockSetAppLanguage).toHaveBeenCalledWith("es");
});
