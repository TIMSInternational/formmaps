/**
 * Task 7 — distinct error states on the application detail page.
 * When the app-load fetch rejects, the page must show an error/retry UI
 * and must NOT render the "Application not found." empty state.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: "app-123" }),
}));

const mockApiRequest = jest.fn();

jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
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

// ── component import (after mocks) ───────────────────────────────────────────

import ApplicationDetailPage from "../page";

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ApplicationDetailPage — error state", () => {
  let renderResult: ReturnType<typeof render>;

  beforeEach(async () => {
    mockApiRequest.mockRejectedValue(new Error("Network error"));
    renderResult = render(<ApplicationDetailPage />);
    // Flush the async apiRequest rejection so no post-render act() warnings.
    await renderResult.findByRole("alert");
  });

  afterEach(() => {
    renderResult.unmount();
    jest.resetAllMocks();
  });

  it("shows an error message when the app load fails", () => {
    expect(
      renderResult.getByText(/something went wrong/i)
    ).toBeInTheDocument();
  });

  it("shows a retry button when the app load fails", () => {
    expect(
      renderResult.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });

  it("does NOT show 'Application not found.' on a fetch error", () => {
    expect(renderResult.queryByText(/application not found/i)).toBeNull();
  });
});
