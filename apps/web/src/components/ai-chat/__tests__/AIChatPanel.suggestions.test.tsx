/**
 * formmaps-platform#393 — a student with no career matches yet (the server's
 * completion gate is not allDone) must see onboarding "Try asking" chips, not
 * results questions like "Why was my #1 career ranked highest?" that have no
 * answer for them.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/lib/i18n";
import { Roles } from "@/lib/permissions";
import { AIChatSidePanel } from "../AIChatPanel";

const getOwnAssessmentCompletion = jest.fn();
jest.mock("@/services/assessmentCompletionService", () => ({
  getOwnAssessmentCompletion: () => getOwnAssessmentCompletion(),
}));
jest.mock("@/services/aiChatService", () => ({ askAi: jest.fn() }));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "student-1", name: "Ana Pérez" } }),
}));
const role = { current: Roles.STUDENT as string };
jest.mock("@/hooks/usePermission", () => ({
  usePermission: () => ({ role: role.current }),
}));
jest.mock("../ChatContext", () => ({
  useChat: () => ({
    currentThread: null,
    currentThreadId: null,
    addMessage: jest.fn(),
    createThread: jest.fn(),
  }),
}));
jest.mock("react-markdown", () => ({ __esModule: true, default: () => null }));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/ui/animated-ai-input", () => ({ AnimatedAIInput: () => null }));
jest.mock("@/components/ui/shining-text", () => ({ ShiningText: () => null }));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AIChatSidePanel />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom has no layout APIs; the panel auto-scrolls on mount.
  Element.prototype.scrollTo = jest.fn();
});

beforeEach(async () => {
  getOwnAssessmentCompletion.mockReset();
  role.current = Roles.STUDENT;
  await i18n.changeLanguage("en");
});

it("a student without career matches gets onboarding prompts, not results questions", async () => {
  getOwnAssessmentCompletion.mockResolvedValue({ allDone: false });
  renderPanel();
  expect(await screen.findByText("Which assessment should I start with?")).toBeInTheDocument();
  expect(screen.queryByText("Why was my #1 career ranked highest?")).not.toBeInTheDocument();
});

it("keeps onboarding prompts when the completion endpoint is unreachable", async () => {
  getOwnAssessmentCompletion.mockResolvedValue(null);
  renderPanel();
  expect(await screen.findByText("What does each assessment measure?")).toBeInTheDocument();
});

it("a student with every assessment done gets the results questions", async () => {
  getOwnAssessmentCompletion.mockResolvedValue({ allDone: true });
  renderPanel();
  expect(await screen.findByText("Why was my #1 career ranked highest?")).toBeInTheDocument();
  expect(screen.queryByText("Which assessment should I start with?")).not.toBeInTheDocument();
});

it("non-students never call the student completion endpoint", async () => {
  role.current = Roles.COUNSELOR;
  renderPanel();
  expect(await screen.findByText("Help me prepare for my next student session")).toBeInTheDocument();
  expect(getOwnAssessmentCompletion).not.toHaveBeenCalled();
});
