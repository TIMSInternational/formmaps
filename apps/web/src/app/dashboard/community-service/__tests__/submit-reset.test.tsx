/**
 * #408 — after "Submit Hours" succeeds the form must reset AND collapse, and
 * the log header count must be plural-aware ("1 entry" / "2 entries").
 *
 * Uses the REAL react-query hooks (only the network service is mocked) so the
 * success path is exercised exactly as in production.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Real app i18next instance (all namespaces, en by default).
import i18n from "@/lib/i18n";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({}),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockGetMine = jest.fn();
const mockLog = jest.fn();
jest.mock("@/services/communityServiceService", () => ({
  normalizeEntry: jest.requireActual("@/services/communityServiceService").normalizeEntry,
  getMyCommunityService: () => mockGetMine(),
  logCommunityService: (p: unknown) => mockLog(p),
  updateCommunityService: jest.fn(),
  deleteCommunityService: jest.fn(),
  getStudentCommunityService: jest.fn(),
  verifyCommunityServiceEntry: jest.fn(),
}));

import CommunityServicePage from "../page";

const entry = (id: string) => ({
  id,
  organization: `Org ${id}`,
  description: "",
  hours: 4,
  date: "2026-10-01",
  status: "pending" as const,
  createdAt: "2026-10-01T00:00:00Z",
});

function summary(n: number) {
  return {
    totalHoursRequired: 40,
    totalHoursLogged: 4 * n,
    totalHoursVerified: 0,
    totalHoursPending: 4 * n,
    entries: Array.from({ length: n }, (_, i) => entry(`e${i + 1}`)),
  };
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en");
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CommunityServicePage />
    </QueryClientProvider>,
  );
}

describe("Community service — submit resets + collapses the form (#408)", () => {
  it("closes the form and clears its values after a successful submit", async () => {
    mockGetMine.mockResolvedValueOnce(summary(0)).mockResolvedValue(summary(1));
    mockLog.mockResolvedValue(entry("e1"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^log hours$/i }));

    fireEvent.change(screen.getByPlaceholderText("e.g. Red Cross"), { target: { value: "Cruz Roja" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 4"), { target: { value: "4" } });
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-10-01" } });

    fireEvent.click(screen.getByRole("button", { name: /submit hours/i }));

    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByPlaceholderText("e.g. Red Cross")).toBeNull());

    // Re-opening shows a blank form, not the previous values.
    fireEvent.click(screen.getByRole("button", { name: /^log hours$/i }));
    expect((screen.getByPlaceholderText("e.g. Red Cross") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("e.g. 4") as HTMLInputElement).value).toBe("");
  });

  it("keeps the form open with its values when the submit fails", async () => {
    mockGetMine.mockResolvedValue(summary(0));
    mockLog.mockRejectedValue(new Error("boom"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^log hours$/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Red Cross"), { target: { value: "Cruz Roja" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 4"), { target: { value: "4" } });
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: /submit hours/i }));

    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    expect((screen.getByPlaceholderText("e.g. Red Cross") as HTMLInputElement).value).toBe("Cruz Roja");
  });
});

describe("Community service — plural-aware entry count (#408)", () => {
  it.each([
    ["en", 1, "1 entry"],
    ["en", 2, "2 entries"],
    ["es", 1, "1 registro"],
    ["es", 3, "3 registros"],
  ])("%s with %i entries reads %p", async (lng, n, expected) => {
    await i18n.changeLanguage(lng);
    mockGetMine.mockResolvedValue(summary(n));
    renderPage();
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});
