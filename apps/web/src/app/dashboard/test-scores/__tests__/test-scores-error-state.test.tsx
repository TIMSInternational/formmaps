/**
 * Slice 4, Task 4 — Test Scores page: distinct error state via QueryStateBoundary.
 *
 * When listTestScores / getSuperScore reject → a "couldn't load" message renders
 * and "No test scores yet" does NOT.
 * When they resolve with empty data → empty state renders and the error does NOT.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({}),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// motion/react — render children immediately, strip motion-only props.
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

// Mock the service layer so we can control resolve/reject per test.
jest.mock("@/services/testScoreService", () => ({
  listTestScores: jest.fn(),
  getSuperScore: jest.fn(),
  getCollegeFit: jest.fn(),
  addTestScore: jest.fn(),
  updateTestScore: jest.fn(),
  deleteTestScore: jest.fn(),
}));

import {
  listTestScores,
  getSuperScore,
  getCollegeFit,
} from "@/services/testScoreService";
import TestScoresPage from "../page";

const mockListTestScores = listTestScores as jest.MockedFunction<typeof listTestScores>;
const mockGetSuperScore = getSuperScore as jest.MockedFunction<typeof getSuperScore>;
const mockGetCollegeFit = getCollegeFit as jest.MockedFunction<typeof getCollegeFit>;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TestScoresPage — error state", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows a 'couldn't load' message when service calls reject", async () => {
    mockListTestScores.mockRejectedValue(new Error("network error"));
    mockGetSuperScore.mockRejectedValue(new Error("network error"));
    mockGetCollegeFit.mockRejectedValue(new Error("network error"));

    render(<TestScoresPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/couldn.?t load/i)).toBeInTheDocument();
  });

  it("does NOT show 'No test scores yet' when service calls reject", async () => {
    mockListTestScores.mockRejectedValue(new Error("network error"));
    mockGetSuperScore.mockRejectedValue(new Error("network error"));
    mockGetCollegeFit.mockRejectedValue(new Error("network error"));

    render(<TestScoresPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText(/no test scores yet/i)).toBeNull();
  });

  it("shows the empty state ('No test scores yet') when service resolves with empty data", async () => {
    mockListTestScores.mockResolvedValue([]);
    mockGetSuperScore.mockResolvedValue({ sat: null, act: null });
    mockGetCollegeFit.mockResolvedValue({ superscore: null, colleges: [] });

    render(<TestScoresPage />);

    await waitFor(() => {
      expect(screen.getByText(/no test scores yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does NOT show the error UI when service resolves with empty data", async () => {
    mockListTestScores.mockResolvedValue([]);
    mockGetSuperScore.mockResolvedValue({ sat: null, act: null });
    mockGetCollegeFit.mockResolvedValue({ superscore: null, colleges: [] });

    render(<TestScoresPage />);

    await waitFor(() => {
      expect(screen.getByText(/no test scores yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/couldn.?t load/i)).toBeNull();
  });
});
