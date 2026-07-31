/**
 * Task 6 — error state on the application board via QueryStateBoundary.
 * When listApplications rejects, the board must show an error/retry UI
 * and must NOT render the "+ Add application" empty-column prompt.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ApplicationTracker } from "../ApplicationTracker";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockListApplications = jest.fn();

jest.mock("@/services/applicationService", () => ({
  listApplications: (...args: unknown[]) => mockListApplications(...args),
  createApplication: jest.fn(),
  updateApplication: jest.fn(),
  deleteApplication: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// motion/react — render children immediately, strip motion-only props to avoid
// "received `true` for a non-boolean attribute" React DOM warnings.
jest.mock("motion/react", () => {
  const React = require("react");
  const MOTION_PROPS = new Set([
    "layout", "layoutId", "initial", "animate", "exit", "transition",
    "variants", "whileHover", "whileTap", "whileFocus", "whileDrag",
    "whileInView", "drag", "dragConstraints", "dragElastic",
    "onAnimationStart", "onAnimationComplete", "onDragStart", "onDragEnd",
  ]);
  function stripMotionProps(props: Record<string, unknown>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!MOTION_PROPS.has(k)) clean[k] = v;
    }
    return clean;
  }
  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
        React.createElement("div", stripMotionProps(props), children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ApplicationTracker — error state", () => {
  let renderResult: ReturnType<typeof render>;

  beforeEach(async () => {
    mockListApplications.mockRejectedValue(new Error("Network error"));
    renderResult = render(<ApplicationTracker />);
    // Flush the async listApplications rejection so no post-render act() warnings.
    await renderResult.findByRole("alert");
  });

  afterEach(() => {
    renderResult.unmount();
    jest.resetAllMocks();
  });

  it("shows an error message when the load fails", () => {
    expect(
      renderResult.getByText(/something went wrong/i)
    ).toBeInTheDocument();
  });

  it("shows a retry button when the load fails", () => {
    expect(
      renderResult.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });

  it("does NOT show the '+ Add application' empty-column prompt on error", () => {
    expect(renderResult.queryByText(/\+ add application/i)).toBeNull();
  });
});
