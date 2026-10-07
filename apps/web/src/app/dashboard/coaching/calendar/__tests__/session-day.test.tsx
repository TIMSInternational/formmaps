/**
 * Coach calendar — sessions are real moments and must land on the viewer's
 * LOCAL day (the grid's days). The old `toISOString().slice(0, 10)` bucketed
 * by the UTC day, so an evening session west of UTC showed on the next day.
 * Jest runs pinned to America/New_York (UTC−5) by jest.global-setup.js.
 */
// Real i18next (English by default) so assertions read the rendered copy.
import "@/lib/i18n";
import React from "react";
import { render, screen, within } from "@testing-library/react";

jest.mock("motion/react", () => {
  const React = require("react");
  const strip = ({ initial, animate, exit, transition, layout, ...rest }: Record<string, unknown>) => rest;
  return {
    motion: { div: ({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", strip(p), children) },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockGetCoachSessions = jest.fn();
jest.mock("@/services/coachService", () => ({
  getCoachSessions: (...args: unknown[]) => mockGetCoachSessions(...args),
}));

import CoachCalendarPage from "../page";

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date(2026, 11, 1, 12, 0, 0),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate",
      "clearImmediate", "queueMicrotask", "nextTick", "requestAnimationFrame",
      "cancelAnimationFrame", "performance", "hrtime",
    ],
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

it("plots a 10 PM local session on its local day, not the next UTC day", async () => {
  mockGetCoachSessions.mockResolvedValue({
    data: {
      sessions: [
        // 22:00 in New York on Dec 15 = 03:00 UTC on Dec 16.
        { id: "s1", status: "confirmed", startTime: "2026-12-16T03:00:00.000Z", studentName: "Ana Pérez" },
      ],
    },
  });
  const { container } = render(<CoachCalendarPage />);

  await screen.findByText(/Ana/);
  const dec15 = container.querySelector('[data-day="2026-12-15"]') as HTMLElement;
  const dec16 = container.querySelector('[data-day="2026-12-16"]') as HTMLElement;
  expect(within(dec15).getByText(/Ana/)).toBeInTheDocument();
  expect(within(dec16).queryByText(/Ana/)).toBeNull();
});
