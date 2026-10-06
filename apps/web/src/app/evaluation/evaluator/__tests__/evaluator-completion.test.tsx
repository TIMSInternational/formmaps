/**
 * The classic 360 questionnaire: a successful submit shows the thank-you screen AND refreshes every
 * screen that shows completion (dashboard, assessments list), so the student's 360 card flips to
 * done without a reload. A failed submit refreshes nothing.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import EvaluatorPage from "../page";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

let mockParams: Record<string, string | null> = {};
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => mockParams[key] ?? null }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
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

jest.mock("@/app/evaluation/evaluator/_components/QuestionCard", () => ({
  QuestionCard: ({ question, onResponseChange }: { question: { id: string }; onResponseChange: (id: string, f: string, v: number) => void }) => (
    <button onClick={() => onResponseChange(question.id, "rating", 4)}>rate {question.id}</button>
  ),
}));
jest.mock("@/app/evaluation/evaluator/_components/EvaluatorNavigation", () => ({
  EvaluatorNavigation: ({ onSubmit }: { onSubmit: () => void }) => <button onClick={onSubmit}>submit evaluation</button>,
}));
const mockValidateToken = jest.fn();
jest.mock("@/services/evaluationService", () => ({
  validateEvaluationToken: (...args: unknown[]) => mockValidateToken(...args),
  sendEvaluatorViolations: jest.fn(),
  VALIDATE_TOKEN_REASONS: { used: "used", expired: "expired" },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { token: "tok-360" };
  mockValidateToken.mockResolvedValue({ isValid: true, instrument: "360" });
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/360evolutor/")) {
      return { ok: true, json: async () => ({ data: {
        evaluatorName: "Self", evaluatorEmail: "s@x.dev", isEvaluationCompleted: false, invitationToken: "tok-360",
        questions: [{ id: "q1", questionNumber: 1, questionEnglishText: "How organised are you?", category: "c" }],
      } }) };
    }
    if (String(url).includes("/submit-feedback") && init?.method === "POST") return submitResponse();
    return { ok: true, json: async () => ({}) };
  });
});
let submitResponse: () => { ok: boolean; json: () => Promise<unknown> } = () => ({ ok: true, json: async () => ({ success: true }) });

it("a successful submit shows the thank-you screen and refreshes completion readers", async () => {
  render(<EvaluatorPage />);
  fireEvent.click(await screen.findByText("rate q1"));
  fireEvent.click(screen.getByText("submit evaluation"));
  expect(await screen.findByText("evaluation.evaluator.thankYou")).toBeInTheDocument();
  expect(mockAssessmentCompleted).toHaveBeenCalledTimes(1);
});

it("a failed submit refreshes nothing", async () => {
  submitResponse = () => ({ ok: false, json: async () => ({ message: "boom" }) });
  render(<EvaluatorPage />);
  fireEvent.click(await screen.findByText("rate q1"));
  fireEvent.click(screen.getByText("submit evaluation"));
  expect(await screen.findByText("boom")).toBeInTheDocument();
  expect(mockAssessmentCompleted).not.toHaveBeenCalled();
});
