/**
 * #394 — a deadline entered as 12/15/2026 must be plotted on Dec 15, not
 * Dec 14, for viewers west of UTC. Jest runs pinned to America/New_York
 * (UTC−5), where the old `new Date(deadline).getDate()` bucketing reproduces
 * the bug for a UTC-midnight value.
 */
// Real i18next (English by default) so assertions read the rendered copy.
import "@/lib/i18n";
import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const mockApiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

import ApplicationsCalendarPage from "../page";

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

it.each([
  ["date-only", "2026-12-15"],
  ["UTC midnight", "2026-12-15T00:00:00.000Z"],
])("plots a %s deadline on Dec 15 (not Dec 14)", async (_label, deadline) => {
  mockApiRequest.mockResolvedValue({
    data: [{ id: "a1", name: "Universidad de Costa Rica", column: "applying", deadline }],
  });
  const { container } = render(<ApplicationsCalendarPage />);

  await screen.findAllByText("Universidad de Costa Rica");
  const dec15 = container.querySelector('[data-day="2026-12-15"]') as HTMLElement;
  const dec14 = container.querySelector('[data-day="2026-12-14"]') as HTMLElement;
  expect(within(dec15).getByText("Universidad de Costa Rica")).toBeInTheDocument();
  expect(within(dec14).queryByText("Universidad de Costa Rica")).toBeNull();

  // Detail panel header names the same day.
  fireEvent.click(dec15);
  expect(await screen.findByText("Tuesday, December 15, 2026")).toBeInTheDocument();
});
