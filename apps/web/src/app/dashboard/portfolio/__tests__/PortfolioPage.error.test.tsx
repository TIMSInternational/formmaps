/**
 * Slice 5, Task 8 — Portfolio page: distinct error state via QueryStateBoundary.
 *
 * When usePortfolioItems returns isError:true → a "couldn't load" message renders
 * and "Build Your Portfolio" does NOT.
 * When it resolves with empty data → empty state renders and the error does NOT.
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

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
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

// Mock the hooks so we control isLoading/isError/data per test.
const mockUsePortfolioItems = jest.fn();
const mockUsePortfolioSummary = jest.fn();
const mockUseCreatePortfolioItem = jest.fn();
const mockUseUpdatePortfolioItem = jest.fn();
const mockUseDeletePortfolioItem = jest.fn();

jest.mock("@/hooks/usePortfolioQueries", () => ({
  usePortfolioItems: () => mockUsePortfolioItems(),
  usePortfolioSummary: () => mockUsePortfolioSummary(),
  useCreatePortfolioItem: () => mockUseCreatePortfolioItem(),
  useUpdatePortfolioItem: () => mockUseUpdatePortfolioItem(),
  useDeletePortfolioItem: () => mockUseDeletePortfolioItem(),
}));

// ── component import (after mocks) ───────────────────────────────────────────

import PortfolioPage from "../page";

// ── shared defaults ───────────────────────────────────────────────────────────

const noopMutation = { mutate: jest.fn(), isPending: false };

function setupMutationDefaults() {
  mockUseCreatePortfolioItem.mockReturnValue(noopMutation);
  mockUseUpdatePortfolioItem.mockReturnValue(noopMutation);
  mockUseDeletePortfolioItem.mockReturnValue(noopMutation);
  mockUsePortfolioSummary.mockReturnValue({ data: undefined });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("PortfolioPage — error state", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows a 'couldn't load' message when usePortfolioItems returns isError:true", async () => {
    setupMutationDefaults();
    mockUsePortfolioItems.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/couldn.?t load/i)).toBeInTheDocument();
  });

  it("does NOT show 'Build Your Portfolio' when usePortfolioItems returns isError:true", async () => {
    setupMutationDefaults();
    mockUsePortfolioItems.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText(/build your portfolio/i)).toBeNull();
  });

  it("shows 'Build Your Portfolio' empty state when usePortfolioItems resolves with empty data", async () => {
    setupMutationDefaults();
    mockUsePortfolioItems.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByText(/build your portfolio/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does NOT show the error UI when usePortfolioItems resolves with empty data", async () => {
    setupMutationDefaults();
    mockUsePortfolioItems.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByText(/build your portfolio/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/couldn.?t load/i)).toBeNull();
  });
});
