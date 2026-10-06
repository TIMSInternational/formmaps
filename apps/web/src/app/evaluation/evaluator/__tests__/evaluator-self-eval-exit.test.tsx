/**
 * Finishing the 360 self-evaluation (the vocational questionnaire) must leave secure mode — fullscreen,
 * the Secure Mode bar, the violation listeners — and take a signed-in person back to the app on its own.
 * A signed-out evaluator (emailed link) gets the thank-you and is never routed into the app.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import EvaluatorPage from "../page";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? "tok-self" : null) }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k),
    i18n: { language: "en", changeLanguage: jest.fn() },
  }),
}));
jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy({}, { get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
jest.mock("@/components/illustration/Illustration", () => ({ Illustration: () => null }));

let mockUser: { isAuthenticated: boolean; role: string | null } = { isAuthenticated: true, role: "student" };
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ user: mockUser }) }));

const proctoring = {
  active: true, elapsedTime: "00:00:00", needsFullscreenPrompt: false, focusLost: false, multiDisplay: false,
  enterFullscreen: jest.fn(), begin: jest.fn(), end: jest.fn(), violations: { current: [] }, drainViolations: () => [],
};
jest.mock("@/components/proctoring/useProctoring", () => ({ useProctoring: () => proctoring }));
jest.mock("@/components/proctoring/RequireChromium", () => ({ RequireChromium: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/proctoring/ProctoredShell", () => ({
  ProctoredShell: ({ children }: { children: React.ReactNode }) => <div data-testid="secure-mode">{children}</div>,
}));
jest.mock("@/components/proctoring/flushViolations", () => ({ installViolationFlush: () => () => {}, flushViolations: () => {}, postViolations: jest.fn() }));
jest.mock("@/app/evaluation/evaluator/_components/VocationalEvaluator", () => ({
  VocationalEvaluator: ({ onCompleted }: { onCompleted?: () => void }) => <button onClick={onCompleted}>submit self-evaluation</button>,
}));
jest.mock("@/services/evaluationService", () => ({
  validateEvaluationToken: jest.fn(async () => ({ isValid: true, instrument: "vocational" })),
  sendEvaluatorViolations: jest.fn(),
  VALIDATE_TOKEN_REASONS: { used: "used", expired: "expired" },
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUser = { isAuthenticated: true, role: "student" };
});
afterEach(() => jest.useRealTimers());

async function finish() {
  render(<EvaluatorPage />);
  const submit = await screen.findByText("submit self-evaluation");
  expect(screen.getByTestId("secure-mode")).toBeInTheDocument();
  expect(proctoring.begin).toHaveBeenCalled();
  expect(proctoring.end).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(submit); });
}

it("signed-in student: leaves secure mode, says so, and is back in the app 3s later", async () => {
  await finish();
  expect(proctoring.end).toHaveBeenCalled();                  // fullscreen + listeners off
  expect(screen.queryByTestId("secure-mode")).toBeNull();      // Secure Mode chrome gone
  expect(screen.getByText("evaluation.evaluator.thankYou")).toBeInTheDocument();
  expect(screen.getByText(/evaluation\.evaluator\.returningIn \{"seconds":3\}/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "evaluation.evaluator.returnDashboard" })).toHaveAttribute("href", "/dashboard/assessments/evaluation");

  const tick = () => act(async () => { jest.advanceTimersByTime(1000); });
  await tick();
  await tick();
  expect(screen.getByText(/returningIn \{"seconds":1\}/)).toBeInTheDocument();
  expect(mockReplace).not.toHaveBeenCalled();
  await tick();
  expect(mockReplace).toHaveBeenCalledWith("/dashboard/assessments/evaluation");
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

it("signed-out evaluator (emailed link): leaves secure mode, thank-you only, never routed into the app", async () => {
  mockUser = { isAuthenticated: false, role: null };
  await finish();
  expect(proctoring.end).toHaveBeenCalled();
  expect(screen.queryByTestId("secure-mode")).toBeNull();
  expect(screen.getByText("evaluation.evaluator.thankYou")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(mockReplace).not.toHaveBeenCalled();
});
