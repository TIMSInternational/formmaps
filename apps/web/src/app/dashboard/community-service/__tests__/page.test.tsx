/**
 * Task 8 — Community Service page: error boundary, real per-school requirement,
 * pending edit/delete, rejection note.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({}),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@/lib/dateUtils", () => ({
  formatDateOnly: (d: string) => d,
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

// Mock the hooks file so we control isLoading/isError/data per test.
const mockUseMyCommunityService = jest.fn();
const mockUseLogCommunityService = jest.fn();
const mockUseUpdateCommunityService = jest.fn();
const mockUseDeleteCommunityService = jest.fn();

jest.mock("@/hooks/useCommunityServiceQueries", () => ({
  useMyCommunityService: () => mockUseMyCommunityService(),
  useLogCommunityService: () => mockUseLogCommunityService(),
  useUpdateCommunityService: () => mockUseUpdateCommunityService(),
  useDeleteCommunityService: () => mockUseDeleteCommunityService(),
}));

// ── component import (after mocks) ───────────────────────────────────────────

import CommunityServicePage from "../page";

// ── shared defaults ───────────────────────────────────────────────────────────

const noopMutation = { mutate: jest.fn(), isPending: false };

function setupDefaults() {
  mockUseLogCommunityService.mockReturnValue(noopMutation);
  mockUseUpdateCommunityService.mockReturnValue(noopMutation);
  mockUseDeleteCommunityService.mockReturnValue(noopMutation);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("CommunityServicePage", () => {
  afterEach(() => jest.resetAllMocks());

  describe("error state", () => {
    it("shows the error boundary alert when the query fails", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it("shows a retry button on error", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("does NOT show the empty-state on a fetch error", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      await screen.findByRole("alert");
      expect(screen.queryByText(/no service hours logged yet/i)).toBeNull();
    });
  });

  describe("real per-school requirement", () => {
    it("shows remaining hours as 50 when required=60 and logged=10", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 60,
          totalHoursLogged: 10,
          totalHoursVerified: 10,
          entries: [],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      // Remaining = max(0, required - verified) = 60 - 10 = 50
      expect(await screen.findByText("50")).toBeInTheDocument();
    });

    it("does NOT show the literal 40 as required hours when totalHoursRequired is 60", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 60,
          totalHoursLogged: 5,
          totalHoursVerified: 5,
          entries: [],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      // remaining = 60 - 5 = 55; if the code still used ?? 40, remaining = max(0, 40-5) = 35
      expect(await screen.findByText("55")).toBeInTheDocument();
    });

    it("defaults to 0 required (no NaN) when totalHoursRequired is absent", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursLogged: 0,
          totalHoursVerified: 0,
          entries: [],
        } as never,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      // progress % with denominator 0 must not be NaN — page should render without throwing
      expect(screen.queryByText("NaN%")).toBeNull();
    });
  });

  describe("goal display (Task 10)", () => {
    it("visibly shows the hours goal when totalHoursRequired is nonzero", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 10,
          totalHoursVerified: 10,
          entries: [],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      const goal = await screen.findByTestId("community-service-goal");
      expect(goal.textContent).toEqual(expect.stringContaining("40"));
      expect(goal.textContent).toEqual(expect.stringContaining("hrs"));
    });

    it("shows a distinct no-goal message instead of a bare 0% when totalHoursRequired is 0", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 0,
          totalHoursLogged: 0,
          totalHoursVerified: 0,
          entries: [],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      const goal = await screen.findByTestId("community-service-goal");
      expect(goal.textContent).toEqual(expect.stringContaining("noGoalSet"));
      expect(screen.queryByText("0%")).toBeNull();
    });
  });

  describe("rejection note", () => {
    it("renders the rejection note for a rejected entry", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 3,
          totalHoursVerified: 0,
          entries: [
            {
              id: "e1",
              organization: "Red Cross",
              description: "Helped",
              hours: 3,
              date: "2026-01-10",
              status: "rejected",
              note: "Insufficient documentation",
              createdAt: "2026-01-10T00:00:00Z",
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      expect(await screen.findByText(/insufficient documentation/i)).toBeInTheDocument();
    });

    it("does NOT render a rejection note element for a verified entry", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 5,
          totalHoursVerified: 5,
          entries: [
            {
              id: "e2",
              organization: "Food Bank",
              description: "Sorted food",
              hours: 5,
              date: "2026-02-01",
              status: "verified",
              note: undefined,
              createdAt: "2026-02-01T00:00:00Z",
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      await screen.findByText("Food Bank");
      expect(screen.queryByText(/reason:/i)).toBeNull();
    });
  });

  describe("pending entry actions", () => {
    it("shows Edit and Delete buttons for pending entries", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 4,
          totalHoursVerified: 0,
          entries: [
            {
              id: "e3",
              organization: "Animal Shelter",
              description: "Cared for animals",
              hours: 4,
              date: "2026-03-01",
              status: "pending",
              createdAt: "2026-03-01T00:00:00Z",
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      await screen.findByText("Animal Shelter");
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    it("does NOT show Edit/Delete buttons for verified entries", async () => {
      setupDefaults();
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 5,
          totalHoursVerified: 5,
          entries: [
            {
              id: "e4",
              organization: "Library",
              description: "Helped patrons",
              hours: 5,
              date: "2026-04-01",
              status: "verified",
              createdAt: "2026-04-01T00:00:00Z",
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<CommunityServicePage />);
      await screen.findByText("Library");
      expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    });
  });

  describe("delete path", () => {
    const pendingEntry = {
      id: "e5",
      organization: "Park Cleanup",
      description: "Cleaned the park",
      hours: 2,
      date: "2026-05-01",
      status: "pending" as const,
      createdAt: "2026-05-01T00:00:00Z",
    };

    function setupWithPendingEntry(deleteMutate: jest.Mock) {
      mockUseMyCommunityService.mockReturnValue({
        data: {
          totalHoursRequired: 40,
          totalHoursLogged: 2,
          totalHoursVerified: 0,
          entries: [pendingEntry],
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      mockUseLogCommunityService.mockReturnValue(noopMutation);
      mockUseUpdateCommunityService.mockReturnValue(noopMutation);
      mockUseDeleteCommunityService.mockReturnValue({
        mutate: deleteMutate,
        isPending: false,
      });
    }

    it("calls delete mutate with the entry id when confirm returns true", async () => {
      const deleteMutate = jest.fn();
      setupWithPendingEntry(deleteMutate);
      jest.spyOn(window, "confirm").mockReturnValue(true);

      render(<CommunityServicePage />);
      await screen.findByText("Park Cleanup");
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      expect(deleteMutate).toHaveBeenCalledTimes(1);
      expect(deleteMutate).toHaveBeenCalledWith(
        "e5",
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });

    it("does NOT call delete mutate when confirm returns false", async () => {
      const deleteMutate = jest.fn();
      setupWithPendingEntry(deleteMutate);
      jest.spyOn(window, "confirm").mockReturnValue(false);

      render(<CommunityServicePage />);
      await screen.findByText("Park Cleanup");
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      expect(deleteMutate).not.toHaveBeenCalled();
    });
  });
});
