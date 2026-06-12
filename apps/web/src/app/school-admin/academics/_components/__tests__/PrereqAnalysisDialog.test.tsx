import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrereqAnalysisDialog } from "../PrereqAnalysisDialog";
import {
  analyzePrerequisites,
  applyPrereqSuggestions,
} from "@/services/curriculumService";

jest.mock("@/services/curriculumService", () => ({
  analyzePrerequisites: jest.fn(),
  applyPrereqSuggestions: jest.fn(),
}));

// Silence toast in tests
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockAnalyze = analyzePrerequisites as jest.Mock;
const mockApply = applyPrereqSuggestions as jest.Mock;

const SUGGESTIONS = [
  {
    courseId: "c2",
    courseCode: "ALG2",
    prerequisiteCode: "ALG1",
    confidence: "high" as const,
    reason: "family",
    source: "pattern" as const,
  },
  {
    courseId: "c3",
    courseCode: "PHY",
    prerequisiteCode: "ALG2",
    confidence: "medium" as const,
    reason: "physics math",
    source: "ai" as const,
  },
];

function renderDialog(open = true, onOpenChange = jest.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PrereqAnalysisDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
}

describe("PrereqAnalysisDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue({ updated: 1 });
  });

  it("runs analysis on open and lists suggestions with confidence + source chips", async () => {
    mockAnalyze.mockResolvedValue(SUGGESTIONS);
    renderDialog();

    // Should display both rows (ALG2 appears as courseCode in row 1 and as prereqCode in row 2)
    expect((await screen.findAllByText("ALG2")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("PHY")).toBeInTheDocument();

    // Confidence chips
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();

    // Source chips
    expect(screen.getByText("Pattern")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("high-confidence rows are pre-checked; applying sends only checked rows grouped by courseId", async () => {
    mockAnalyze.mockResolvedValue(SUGGESTIONS);
    renderDialog();

    // Wait for rows (ALG2 appears in two cells so use findAllByText)
    await screen.findAllByText("ALG2");

    // ALG2 (high) should be checked, PHY (medium) should not
    const alg2Checkbox = screen.getByRole("checkbox", {
      name: /toggle ALG2 needs ALG1/i,
    }) as HTMLInputElement;
    const phyCheckbox = screen.getByRole("checkbox", {
      name: /toggle PHY needs ALG2/i,
    }) as HTMLInputElement;

    expect(alg2Checkbox.checked).toBe(true);
    expect(phyCheckbox.checked).toBe(false);

    // Should show "Apply 1 selected"
    const applyBtn = screen.getByRole("button", { name: /apply 1 selected/i });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith([
      { courseId: "c2", addPrerequisites: ["ALG1"] },
    ]);
  });

  it("'Select all' then apply groups multiple prereqs per course", async () => {
    const suggestions = [
      ...SUGGESTIONS,
      {
        courseId: "c3",
        courseCode: "PHY",
        prerequisiteCode: "TRIG",
        confidence: "medium" as const,
        reason: "trig needed",
        source: "pattern" as const,
      },
    ];
    mockAnalyze.mockResolvedValue(suggestions);
    renderDialog();

    // Wait for rows (ALG2 appears in two cells so use findAllByText)
    await screen.findAllByText("ALG2");

    // Click "Select all"
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));

    // Apply — c3 has two prereqs: ALG2 and TRIG
    const applyBtn = screen.getByRole("button", { name: /apply 3 selected/i });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    const [updates] = mockApply.mock.calls[0] as [
      { courseId: string; addPrerequisites: string[] }[],
    ];
    const c3 = updates.find((u) => u.courseId === "c3");
    expect(c3).toBeDefined();
    expect(c3!.addPrerequisites.sort()).toEqual(["ALG2", "TRIG"]);
  });

  it("shows the honest empty state when analysis returns []", async () => {
    mockAnalyze.mockResolvedValue([]);
    renderDialog();

    expect(
      await screen.findByText(/no missing prerequisites found/i),
    ).toBeInTheDocument();
    // Should not show a table
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
