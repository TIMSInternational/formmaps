/**
 * Evaluator page — emailed invite links carry `?lang=es|en`. The page must switch i18next to that language
 * BEFORE it validates the token / loads any content, so the vocational questionnaire (fetched with the
 * i18next language) and the chrome both open in the invite's language.
 */
import { render, screen, waitFor } from "@testing-library/react";
import EvaluatorPage from "../page";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

let mockParams: Record<string, string | null> = {};
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => mockParams[key] ?? null }),
}));

const mockI18n = { language: "en", changeLanguage: jest.fn() };
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: mockI18n }),
}));

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy({}, {
      get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
jest.mock("@/store/useGlobalStore", () => {
  const store = { user: { isAuthenticated: false } };
  return { useGlobalStore: () => store };
});
jest.mock("@/components/proctoring/RequireChromium", () => ({
  RequireChromium: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/proctoring/ProctoredShell", () => ({
  ProctoredShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/proctoring/flushViolations", () => ({
  installViolationFlush: () => () => {},
  flushViolations: () => {},
  postViolations: jest.fn(),
}));
jest.mock("@/app/evaluation/evaluator/_components/VocationalEvaluator", () => ({
  VocationalEvaluator: () => <div>Vocational form loaded</div>,
}));

const mockValidateToken = jest.fn();
jest.mock("@/services/evaluationService", () => ({
  validateEvaluationToken: (...args: unknown[]) => mockValidateToken(...args),
  sendEvaluatorViolations: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockI18n.language = "en";
  mockI18n.changeLanguage.mockImplementation(async (lng: string) => { mockI18n.language = lng; });
  mockValidateToken.mockResolvedValue({ isValid: true, instrument: "vocational" });
});

it("switches to ?lang=es before validating the token", async () => {
  mockParams = { token: "tok", lang: "es" };
  const order: string[] = [];
  mockI18n.changeLanguage.mockImplementation(async (lng: string) => { order.push(`lang:${lng}`); mockI18n.language = lng; });
  mockValidateToken.mockImplementation(async () => { order.push("validate"); return { isValid: true, instrument: "vocational" }; });

  render(<EvaluatorPage />);
  await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
  expect(order).toEqual(["lang:es", "validate"]);
});

it("does not change language when the link already matches the UI", async () => {
  mockParams = { token: "tok", lang: "en" };
  render(<EvaluatorPage />);
  await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
  expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
});

it("ignores a missing or unknown lang", async () => {
  mockParams = { token: "tok", lang: "fr" };
  render(<EvaluatorPage />);
  await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
  expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  expect(mockValidateToken).toHaveBeenCalledWith("tok");
});

it("still loads when changeLanguage fails", async () => {
  mockParams = { token: "tok", lang: "es" };
  mockI18n.changeLanguage.mockRejectedValue(new Error("boom"));
  render(<EvaluatorPage />);
  await waitFor(() => expect(screen.getByText("Vocational form loaded")).toBeInTheDocument());
});
