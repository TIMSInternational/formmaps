/**
 * Task 5 — matchScore badge must NOT render.
 * matchScore is always empty until the admission engine is wired in sub-project B.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ApplicationTracker } from "../ApplicationTracker";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/services/applicationService", () => ({
  listApplications: jest.fn().mockResolvedValue([
    {
      id: "a1",
      name: "MIT",
      type: "university",
      matchScore: 92,
      column: "researching",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ]),
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

describe("ApplicationTracker — matchScore badge", () => {
  let renderResult: ReturnType<typeof render>;

  beforeEach(async () => {
    renderResult = render(<ApplicationTracker />);
    // Flush the async listApplications load so no post-render act() warnings.
    await renderResult.findByText("MIT");
  });

  afterEach(() => {
    renderResult.unmount();
  });

  it("renders the application card name", () => {
    expect(renderResult.getByText("MIT")).toBeInTheDocument();
  });

  it("does NOT render a % match badge even when matchScore is set", () => {
    expect(renderResult.queryByText(/% match/i)).toBeNull();
  });
});
