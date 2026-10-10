import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Tabs } from "@/components/ui/tabs";
import { ChildResultsTab } from "../ChildResultsTab";
import { getChildReportBlob } from "@/services/parentPortalService";
import type { ChildResults } from "@/types/parentPortal";

jest.mock("@/services/parentPortalService", () => ({ getChildReportBlob: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));
jest.mock("react-i18next", () => {
  const parent = require("@/lib/i18n/locales/en/parent.json");
  const get = (k: string) =>
    k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), parent);
  return {
    useTranslation: () => ({
      t: (k: string, o?: Record<string, string>) =>
        String(get(k) ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => o?.[n] ?? ""),
      i18n: { language: "en" },
    }),
    initReactI18next: { type: "3rdParty", init: () => {} },
  };
});

const RESULTS: ChildResults = {
  student: { id: "stu-1", name: "Kid", gradeLevel: "11", schoolName: "Country Day" },
  generatedAt: "2026-10-10T00:00:00Z",
  assessments: [
    { key: "lia", title: "LIA assessment", status: "completed", completedAt: "2026-09-01T12:00:00Z", summary: [{ label: "Global percentile", value: "72" }] },
    { key: "personality", title: "Personality", status: "not_started", completedAt: null, summary: [] },
  ],
  report: { available: true },
};

function renderTab(props: Partial<React.ComponentProps<typeof ChildResultsTab>> = {}) {
  return render(
    <Tabs defaultValue="results">
      <ChildResultsTab studentId="stu-1" lang="en" results={RESULTS} isLoading={false} error={null} {...props} />
    </Tabs>,
  );
}

describe("ChildResultsTab (audit E1)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows every assessment with its status and score summary", () => {
    renderTab();
    expect(screen.getByText("LIA assessment")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Global percentile")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Personality")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("downloads the career report for this child in the page language", async () => {
    (getChildReportBlob as jest.Mock).mockResolvedValue(new Blob(["%PDF"]));
    URL.createObjectURL = jest.fn(() => "blob:x");
    URL.revokeObjectURL = jest.fn();
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /download report/i }));
    await waitFor(() => expect(getChildReportBlob).toHaveBeenCalledWith("stu-1", "en"));
  });

  it("disables the download until the report is ready", () => {
    renderTab({ results: { ...RESULTS, report: { available: false } } });
    expect(screen.getByRole("button", { name: /download report/i })).toBeDisabled();
    expect(screen.getByText(/once your child has completed/i)).toBeInTheDocument();
  });

  it("explains a paywall 402 instead of showing empty results", () => {
    renderTab({ results: undefined, error: Object.assign(new Error("x"), { status: 402 }) });
    expect(screen.getByTestId("child-results-locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download report/i })).not.toBeInTheDocument();
  });
});
