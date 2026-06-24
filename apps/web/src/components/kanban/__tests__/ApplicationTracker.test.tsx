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

// motion/react — render children immediately, no animation
jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", props, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ApplicationTracker — matchScore badge", () => {
  it("renders the application card name", async () => {
    render(<ApplicationTracker />);
    expect(await screen.findByText("MIT")).toBeInTheDocument();
  });

  it("does NOT render a % match badge even when matchScore is set", async () => {
    render(<ApplicationTracker />);
    // Wait for the card to load
    await screen.findByText("MIT");
    expect(screen.queryByText(/% match/i)).toBeNull();
  });
});
