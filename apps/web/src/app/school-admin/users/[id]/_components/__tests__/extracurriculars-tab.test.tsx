import { render, screen, fireEvent } from "@testing-library/react";
import { ExtracurricularsTab } from "../extracurriculars-tab";
import type { CommunityServiceSummary, CommunityServiceEntry } from "@/types/communityService";
import type { UseMutationResult } from "@tanstack/react-query";
import type { CommunityServiceVerifyPayload } from "@/types/communityService";

// Stub lucide-react icons so they don't break in jsdom
jest.mock("lucide-react", () => ({
  Calendar: () => null,
  CheckCircle2: () => null,
  Clock: () => null,
  Heart: () => null,
  XCircle: () => null,
}));

// Stub @radix-ui/react-progress (pulled in by Progress component)
jest.mock("@radix-ui/react-progress", () => ({
  Root: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className} {...props}>{children}</div>
  ),
  Indicator: ({ className, style }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className} style={style} />
  ),
}));

// Stub shared-ui to avoid side-effects from PCAChartImage / CSS vars
jest.mock("../shared-ui", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

// Stub date-fns format (date parsing is irrelevant for these tests)
jest.mock("date-fns", () => ({
  format: (_date: Date, _fmt: string) => "Jan 1, 2025",
}));

type MutateArgs = { entryId: string; payload: CommunityServiceVerifyPayload };

function buildMutation(mutateFn = jest.fn()): UseMutationResult<CommunityServiceEntry, Error, MutateArgs> {
  return {
    mutate: mutateFn,
    mutateAsync: jest.fn(),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    reset: jest.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    status: "idle",
    submittedAt: 0,
    context: undefined,
  } as unknown as UseMutationResult<CommunityServiceEntry, Error, MutateArgs>;
}

const baseEntry: CommunityServiceEntry = {
  id: "entry-1",
  organization: "Local Shelter",
  description: "Helped with food distribution",
  hours: 10,
  date: "2025-01-01",
  status: "pending",
  createdAt: "2025-01-01T00:00:00Z",
};

function buildSummary(overrides: Partial<CommunityServiceSummary> = {}): CommunityServiceSummary {
  return {
    totalHoursRequired: 60,
    totalHoursLogged: 10,
    totalHoursVerified: 5,
    entries: [baseEntry],
    ...overrides,
  };
}

describe("ExtracurricularsTab — requirement fallback", () => {
  it("renders '/ 60 hrs' when totalHoursRequired is 60", () => {
    render(<ExtracurricularsTab csData={buildSummary({ totalHoursRequired: 60 })} verifyEntry={buildMutation()} />);
    // Both the large display and the Goal label should show 60
    const sixtyInstances = screen.getAllByText(/60 hrs/);
    expect(sixtyInstances.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render '/ 40 hrs' when totalHoursRequired is 60", () => {
    render(<ExtracurricularsTab csData={buildSummary({ totalHoursRequired: 60 })} verifyEntry={buildMutation()} />);
    expect(screen.queryByText(/40 hrs/)).not.toBeInTheDocument();
  });

  it("renders '/ 0 hrs' (not 40) when csData is undefined, and emits no NaN console.error", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<ExtracurricularsTab csData={undefined} verifyEntry={buildMutation()} />);
    // Should NOT show 40 anywhere
    expect(screen.queryByText(/40 hrs/)).not.toBeInTheDocument();
    // Should positively show "/ 0 hrs"
    expect(screen.getByText(/\/ 0 hrs/)).toBeInTheDocument();
    // No NaN prop warning should have been emitted
    const nanCalls = errorSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === "string" && a.includes("NaN"))
    );
    expect(nanCalls).toHaveLength(0);
    errorSpy.mockRestore();
  });
});

describe("ExtracurricularsTab — rejected note rendering", () => {
  it("renders the rejection note text for a rejected entry with a note", () => {
    const rejectedEntry: CommunityServiceEntry = {
      ...baseEntry,
      status: "rejected",
      note: "Hours not verified by supervisor",
    };
    const csData = buildSummary({ entries: [rejectedEntry] });
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation()} />);
    expect(screen.getByText(/Reason: Hours not verified by supervisor/)).toBeInTheDocument();
  });

  it("does NOT render rejection note text for a rejected entry without a note", () => {
    const rejectedEntry: CommunityServiceEntry = {
      ...baseEntry,
      status: "rejected",
    };
    const csData = buildSummary({ entries: [rejectedEntry] });
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation()} />);
    expect(screen.queryByText(/^Reason:/)).not.toBeInTheDocument();
  });

  it("does NOT render rejection note text for a pending entry even if it has a note", () => {
    const pendingEntry: CommunityServiceEntry = {
      ...baseEntry,
      status: "pending",
      note: "Some stale note",
    };
    const csData = buildSummary({ entries: [pendingEntry] });
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation()} />);
    expect(screen.queryByText(/^Reason:/)).not.toBeInTheDocument();
  });
});

describe("ExtracurricularsTab — Reject button collects note via window.prompt", () => {
  it("calls verifyEntry.mutate with status rejected and the prompted note", () => {
    const mutateFn = jest.fn();
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("Missing documentation");

    const csData = buildSummary(); // entry is pending → shows Reject button
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation(mutateFn)} />);

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    expect(promptSpy).toHaveBeenCalled();
    expect(mutateFn).toHaveBeenCalledWith({
      entryId: "entry-1",
      payload: { status: "rejected", note: "Missing documentation" },
    });

    promptSpy.mockRestore();
  });

  it("does NOT call mutate if the user cancels the prompt (returns null)", () => {
    const mutateFn = jest.fn();
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue(null);

    const csData = buildSummary();
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation(mutateFn)} />);

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    expect(promptSpy).toHaveBeenCalled();
    expect(mutateFn).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it("calls verifyEntry.mutate with status verified when Approve is clicked (unchanged)", () => {
    const mutateFn = jest.fn();
    const csData = buildSummary();
    render(<ExtracurricularsTab csData={csData} verifyEntry={buildMutation(mutateFn)} />);

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(mutateFn).toHaveBeenCalledWith({
      entryId: "entry-1",
      payload: { status: "verified" },
    });
  });
});
