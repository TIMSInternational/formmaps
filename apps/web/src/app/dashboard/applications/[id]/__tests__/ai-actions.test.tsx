/**
 * formmaps#390 / #402 — AI actions on the application detail page.
 *  - "Generate Checklist" and "AI Review" are non-idempotent Bedrock calls: apiRequest's
 *    default 5xx retry fired 3 POSTs for 2 clicks. They must go out with retries: 0, and
 *    a second click while one is pending must not send another request.
 *  - AI Review feedback is Markdown and must render as formatted elements, not literal text.
 */
// Real i18next (English) so assertions read the rendered copy, not raw keys.
import "@/lib/i18n";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: "app-123" }),
}));

const mockApiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const mockToastError = jest.fn();
jest.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), warning: jest.fn() } }));

jest.mock("motion/react", () => {
  const React = require("react");
  const MOTION_PROPS = new Set([
    "layout", "layoutId", "initial", "animate", "exit", "transition", "variants",
    "whileHover", "whileTap", "whileFocus", "whileDrag", "whileInView",
    "onAnimationStart", "onAnimationComplete",
  ]);
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k)));
  return {
    motion: {
      div: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
        React.createElement("div", strip(props), children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

import ApplicationDetailPage from "../page";

const APP = { id: "app-123", name: "Stanford University", status: "applying" };
const ESSAY = {
  id: "essay-1", title: "Personal statement", prompt: "Tell us", wordLimit: 500,
  status: "drafting", currentDraft: "My draft has a few words.",
};
const FEEDBACK = "# Essay Feedback\n\n## Strengths\n\n- **Clear narrative arc** with a vivid opening";

type Opts = { method?: string; retries?: number };
let resolveGenerate: (v: unknown) => void = () => {};

function route(url: string, opts?: Opts) {
  const method = opts?.method ?? "GET";
  if (url.endsWith("/checklist/generate")) return new Promise((r) => { resolveGenerate = r; });
  if (url.endsWith("/ai-review")) return Promise.resolve({ data: { feedback: FEEDBACK } });
  if (url.endsWith("/checklist") && method === "GET") return Promise.resolve({ data: [] });
  if (url.endsWith("/essays") && method === "GET") return Promise.resolve({ data: [ESSAY] });
  return Promise.resolve({ data: APP });
}

beforeEach(() => {
  mockApiRequest.mockImplementation((url: string, opts?: Opts) => route(url, opts));
});
afterEach(() => { jest.resetAllMocks(); });

const callsTo = (suffix: string) =>
  mockApiRequest.mock.calls.filter(([url]) => typeof url === "string" && url.endsWith(suffix));

describe("Generate Checklist", () => {
  it("sends exactly one POST with retries disabled, and disables the button while pending", async () => {
    render(<ApplicationDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /checklist/i }));
    const btn = await screen.findByRole("button", { name: /generate checklist/i });

    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    expect(callsTo("/checklist/generate")).toHaveLength(1);
    expect(callsTo("/checklist/generate")[0][1]).toMatchObject({ method: "POST", retries: 0 });

    resolveGenerate({ data: [] });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});

describe("AI Review", () => {
  async function openEssay() {
    render(<ApplicationDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /essays/i }));
    fireEvent.click(await screen.findByText("Personal statement"));
  }

  it("does not auto-retry the AI review POST", async () => {
    await openEssay();
    fireEvent.click(screen.getByRole("button", { name: /ai review/i }));
    await waitFor(() => expect(callsTo("/ai-review")).toHaveLength(1));
    expect(callsTo("/ai-review")[0][1]).toMatchObject({ method: "POST", retries: 0 });
  });

  it("renders the feedback as Markdown, not literal syntax", async () => {
    await openEssay();
    fireEvent.click(screen.getByRole("button", { name: /ai review/i }));
    expect(await screen.findByRole("heading", { name: "Strengths" })).toBeInTheDocument();
    expect(screen.getByText("Clear narrative arc").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Clear narrative arc\*\*/)).toBeNull();
    expect(screen.queryByText(/## Strengths/)).toBeNull();
  });

  it("draft textarea starts at 8 rows and grows with its content", async () => {
    await openEssay();
    const textarea = screen.getByPlaceholderText(/start writing your essay/i) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("rows", "8");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 640 });
    fireEvent.change(textarea, { target: { value: "line\n".repeat(40) } });
    await waitFor(() => expect(textarea.style.height).toBe("640px"));
  });
});

describe("AI failures (upstream 502)", () => {
  const upstream502 = () => Promise.reject(Object.assign(new Error("Server error"), { status: 502 }));

  it("Generate Checklist shows a friendly, actionable message — not the generic server error", async () => {
    mockApiRequest.mockImplementation((url: string, opts?: Opts) =>
      url.endsWith("/checklist/generate") ? upstream502() : route(url, opts));
    render(<ApplicationDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /checklist/i }));
    const btn = await screen.findByRole("button", { name: /generate checklist/i });
    fireEvent.click(btn);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(/couldn.t generate a checklist right now/i);
    expect(callsTo("/checklist/generate")[0][1]).toMatchObject({ retries: 0, showErrorToast: false });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("AI Review shows a friendly message on an upstream failure", async () => {
    mockApiRequest.mockImplementation((url: string, opts?: Opts) =>
      url.endsWith("/ai-review") ? upstream502() : route(url, opts));
    render(<ApplicationDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /essays/i }));
    fireEvent.click(await screen.findByText("Personal statement"));
    fireEvent.click(screen.getByRole("button", { name: /ai review/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(/couldn.t review this essay right now/i);
  });
});
