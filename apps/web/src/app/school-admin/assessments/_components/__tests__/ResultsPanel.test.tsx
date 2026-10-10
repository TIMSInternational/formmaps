/**
 * Assessment Hub → Results: the search box used to be typed into and never sent (the API was always called without
 * `search`), and the "assessment type" select filtered nothing (neither backend has that filter). Now the search
 * reaches the API after a pause, back on page 1, and the dead select is gone.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResultsPanel } from "../ResultsPanel";
import { getStudentResults } from "@/services/schoolAdminService";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("en");
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => ({ t: inst.getFixedT(null, ns ?? "common"), i18n: inst }),
  };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/schoolAdminService", () => ({
  getStudentResults: jest.fn(),
  exportResults: jest.fn(),
}));
jest.mock("../StudentReportModal", () => ({ StudentReportModal: () => null }));
jest.mock("@/components/school-admin/GradeImportForm", () => ({ __esModule: true, default: () => null }));

const results = getStudentResults as jest.MockedFunction<typeof getStudentResults>;

beforeEach(() => {
  jest.useFakeTimers();
  results.mockReset();
  results.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 } as never);
});
afterEach(() => jest.useRealTimers());

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ResultsPanel /></QueryClientProvider>);
}

it("sends the search to the API after a pause (once, trimmed)", async () => {
  renderPanel();
  await act(async () => { await Promise.resolve(); });
  expect(results).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 10, search: undefined }));

  const box = screen.getByPlaceholderText(/search/i);
  fireEvent.change(box, { target: { value: "an" } });
  fireEvent.change(box, { target: { value: " ana " } });
  const callsBefore = results.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(350); });
  const searched = results.mock.calls.slice(callsBefore).map((c) => c[0]?.search);
  expect(searched).toEqual(["ana"]);
});

it("has no assessment-type filter (no backend supports one)", () => {
  renderPanel();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(results.mock.calls.every((c) => !("assessmentType" in (c[0] ?? {})))).toBe(true);
});

it("a failed load says so, with Retry, instead of 'No results found' (audit F)", async () => {
  results.mockReset();
  results.mockRejectedValueOnce(new Error("502"));
  results.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 } as never);
  renderPanel();
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(await screen.findByTestId("results-load-error")).toHaveTextContent("Couldn't load results");
  expect(screen.queryByText("No results found")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(await screen.findByText("No results found")).toBeInTheDocument();
});
