/**
 * useCalendarQueries.optimistic.test.tsx — formmaps#89.
 *
 * The distinguishing features of this hook family are ORDER and FAN-OUT.
 *
 * Order, because all three caches are plain arrays the reader returns pre-sorted
 * (years by startDate DESC, periods by startDate ASC, holidays by date ASC) and there
 * is no envelope to hide an insert in — a row appended to the end sits in the wrong
 * place until the reconcile lands and then jumps.
 *
 * Fan-out, because deleting an academic year silently changes the other two panels:
 * holidays cascade with it (FK ON DELETE CASCADE) and the assessment-periods read is
 * gated on the school still having a CURRENT year. Invalidating only the year list —
 * what the hook did before #89 — leaves both showing rows that are already gone, which
 * is the failure mode these tests exist to pin down.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCreateAcademicYear,
  useUpdateAcademicYear,
  useDeleteAcademicYear,
  useCreateAssessmentPeriod,
  useUpdateAssessmentPeriod,
  useDeleteAssessmentPeriod,
  useCreateHolidays,
  useDeleteHoliday,
  calendarKeys,
} from "../useCalendarQueries";
import {
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  createAssessmentPeriod,
  updateAssessmentPeriod,
  deleteAssessmentPeriod,
  createHolidays,
  deleteHoliday,
} from "@/services/calendarService";
import type { AcademicYear, AssessmentPeriod, Holiday } from "@/types/calendar";

jest.mock("@/services/calendarService", () => ({
  ...jest.requireActual("@/services/calendarService"),
  getAcademicYears: jest.fn(),
  createAcademicYear: jest.fn(),
  updateAcademicYear: jest.fn(),
  deleteAcademicYear: jest.fn(),
  getAssessmentPeriods: jest.fn(),
  createAssessmentPeriod: jest.fn(),
  updateAssessmentPeriod: jest.fn(),
  deleteAssessmentPeriod: jest.fn(),
  getHolidays: jest.fn(),
  createHolidays: jest.fn(),
  deleteHoliday: jest.fn(),
}));

const mockCreateYear = createAcademicYear as jest.Mock;
const mockUpdateYear = updateAcademicYear as jest.Mock;
const mockDeleteYear = deleteAcademicYear as jest.Mock;
const mockCreatePeriod = createAssessmentPeriod as jest.Mock;
const mockUpdatePeriod = updateAssessmentPeriod as jest.Mock;
const mockDeletePeriod = deleteAssessmentPeriod as jest.Mock;
const mockCreateHolidays = createHolidays as jest.Mock;
const mockDeleteHoliday = deleteHoliday as jest.Mock;

/** A request that never settles — isolates the optimistic phase from the reconcile. */
const inFlight = () => new Promise(() => {});

const year = (over: Partial<AcademicYear> & { id: string }): AcademicYear => ({
  name: "2025-2026",
  startDate: "2025-08-01T00:00:00.000Z",
  endDate: "2026-06-15T00:00:00.000Z",
  isCurrent: false,
  terms: [],
  ...over,
});

const period = (over: Partial<AssessmentPeriod> & { id: string }): AssessmentPeriod => ({
  name: "Autumn MIL",
  termId: "term-1",
  startDate: "2025-10-01T00:00:00.000Z",
  endDate: "2025-10-14T00:00:00.000Z",
  assessmentTypes: ["MIL"],
  ...over,
});

const holiday = (over: Partial<Holiday> & { id: string }): Holiday => ({
  name: "Winter Break",
  date: "2025-12-24T00:00:00.000Z",
  type: "school",
  ...over,
});

function harness(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const years = (qc: QueryClient) => qc.getQueryData<AcademicYear[]>(calendarKeys.academicYears())!;
const periods = (qc: QueryClient) =>
  qc.getQueryData<AssessmentPeriod[]>(calendarKeys.assessmentPeriods())!;
const holidays = (qc: QueryClient) => qc.getQueryData<Holiday[]>(calendarKeys.holidays())!;

const YEAR_PAYLOAD = {
  name: "2026-2027",
  startDate: "2026-08-01",
  endDate: "2027-06-15",
  terms: [
    { name: "Semester 1", startDate: "2026-08-01", endDate: "2026-12-20" },
    { name: "Semester 2", startDate: "2027-01-10", endDate: "2027-06-15" },
  ],
};

const PERIOD_PAYLOAD = {
  name: "Spring PCA",
  termId: "term-2",
  startDate: "2026-03-01",
  endDate: "2026-03-14",
  assessmentTypes: ["PCA" as const],
};

beforeEach(() => jest.clearAllMocks());

describe("#89 academic years", () => {
  const seedYears = (qc: QueryClient) =>
    qc.setQueryData(calendarKeys.academicYears(), [
      year({ id: "y-2", name: "2025-2026", startDate: "2025-08-01T00:00:00.000Z", isCurrent: true }),
      year({ id: "y-1", name: "2024-2025", startDate: "2024-08-01T00:00:00.000Z" }),
    ]);

  it("shows a new year immediately, sorted by startDate DESC like the reader", async () => {
    const { qc, wrapper } = harness(seedYears);
    mockCreateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(years(qc)).toHaveLength(3));
    // Newest first — an append would have left it third.
    expect(years(qc).map((y) => y.name)).toEqual(["2026-2027", "2025-2026", "2024-2025"]);
  });

  it("lands the new year as not-current, which is the column default", async () => {
    // The INSERT omits isCurrent, so `false` is known rather than guessed — and marking
    // it current would move the teal "active" border onto the wrong card.
    const { qc, wrapper } = harness(seedYears);
    mockCreateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(years(qc)).toHaveLength(3));
    expect(years(qc)[0].isCurrent).toBe(false);
    expect(years(qc).find((y) => y.id === "y-2")!.isCurrent).toBe(true);
  });

  it("gives every term a placeholder id and the writer's sortOrder", async () => {
    // Term ids are server-assigned and never echoed back. The placeholder keeps React's
    // keys unique and keeps the assessment-period <Select> from offering a real-looking
    // value the API would 404 on.
    const { qc, wrapper } = harness(seedYears);
    mockCreateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(years(qc)).toHaveLength(3));
    const terms = years(qc)[0].terms;
    expect(terms.map((t) => t.name)).toEqual(["Semester 1", "Semester 2"]);
    expect(terms.map((t) => t.sortOrder)).toEqual([0, 1]);
    expect(new Set(terms.map((t) => t.id)).size).toBe(2);
    expect(terms.every((t) => t.id.startsWith("optimistic-"))).toBe(true);
  });

  it("restores the exact previous list when a create fails", async () => {
    const { qc, wrapper } = harness(seedYears);
    const before = qc.getQueryData(calendarKeys.academicYears());
    mockCreateYear.mockRejectedValue(new Error("No school"));
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.academicYears())).toEqual(before);
  });

  it("refetches only the year list after a create", async () => {
    // A new year is not current, so the periods gate does not move, and holidays are
    // attached to a year only by their own write.
    const { qc, wrapper } = harness(seedYears);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockCreateYear.mockResolvedValue({ id: "y-3", name: "2026-2027" });
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.academicYears() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: calendarKeys.holidays() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: calendarKeys.assessmentPeriods() });
  });

  it("shows an edit immediately and re-sorts on the new startDate", async () => {
    const { qc, wrapper } = harness(seedYears);
    mockUpdateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => {
      result.current.mutate({ id: "y-1", payload: { name: "2027-2028", startDate: "2027-08-01" } });
    });

    await waitFor(() => expect(years(qc)[0].id).toBe("y-1"));
    expect(years(qc)[0]).toMatchObject({ name: "2027-2028", startDate: "2027-08-01" });
  });

  it("keeps the fields an edit leaves out, the way the endpoint coalesces them", async () => {
    const { qc, wrapper } = harness(seedYears);
    mockUpdateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => { result.current.mutate({ id: "y-2", payload: { name: "Renamed" } }); });

    await waitFor(() => expect(years(qc).find((y) => y.id === "y-2")!.name).toBe("Renamed"));
    const edited = years(qc).find((y) => y.id === "y-2")!;
    expect(edited.startDate).toBe("2025-08-01T00:00:00.000Z");
    expect(edited.endDate).toBe("2026-06-15T00:00:00.000Z");
    expect(edited.isCurrent).toBe(true);
  });

  it("replaces the whole term set when the payload carries terms", async () => {
    // A body carrying `terms` makes the writer DELETE every academic_terms row for the
    // year and re-INSERT the set (CalendarWriter.cs: DELETE FROM "academic_terms" WHERE
    // "academicYearId" = @id, then INSERT). So the surviving ids are new server ids that
    // nothing echoes back — keeping the OLD ids would leave the assessment-period
    // <Select> offering values that no longer exist.
    const { qc, wrapper } = harness((client) =>
      client.setQueryData(calendarKeys.academicYears(), [
        year({
          id: "y-2",
          startDate: "2025-08-01T00:00:00.000Z",
          terms: [
            { id: "t-old-1", name: "Old S1", startDate: "2025-08-01", endDate: "2025-12-20", sortOrder: 0 },
            { id: "t-old-2", name: "Old S2", startDate: "2026-01-10", endDate: "2026-06-15", sortOrder: 1 },
            { id: "t-old-3", name: "Old S3", startDate: "2026-06-16", endDate: "2026-07-15", sortOrder: 2 },
          ],
        }),
      ]),
    );
    mockUpdateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => {
      result.current.mutate({
        id: "y-2",
        payload: {
          terms: [
            { name: "New S1", startDate: "2025-08-01", endDate: "2025-12-20" },
            { name: "New S2", startDate: "2026-01-10", endDate: "2026-06-15" },
          ],
        },
      });
    });

    await waitFor(() => expect(years(qc)[0].terms).toHaveLength(2));
    const terms = years(qc)[0].terms;
    expect(terms.map((t) => t.name)).toEqual(["New S1", "New S2"]);
    // sortOrder is the array index the writer inserts by, which is also the reader's
    // ORDER BY "sortOrder" ASC — so the sub-rows render in the order they were entered.
    expect(terms.map((t) => t.sortOrder)).toEqual([0, 1]);
    // Every id is a fresh placeholder: no old id survives, and none collide.
    expect(terms.every((t) => t.id.startsWith("optimistic-"))).toBe(true);
    expect(new Set(terms.map((t) => t.id)).size).toBe(2);
  });

  it("keeps the existing terms, ids and all, when the payload leaves them out", async () => {
    // No `terms` key means the writer never touches academic_terms, so re-issuing
    // placeholder ids here would break the period <Select> on a rename.
    const seeded = [
      { id: "t-1", name: "S1", startDate: "2025-08-01", endDate: "2025-12-20", sortOrder: 0 },
      { id: "t-2", name: "S2", startDate: "2026-01-10", endDate: "2026-06-15", sortOrder: 1 },
    ];
    const { qc, wrapper } = harness((client) =>
      client.setQueryData(calendarKeys.academicYears(), [year({ id: "y-2", terms: seeded })]),
    );
    mockUpdateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => { result.current.mutate({ id: "y-2", payload: { name: "Renamed" } }); });

    await waitFor(() => expect(years(qc)[0].name).toBe("Renamed"));
    expect(years(qc)[0].terms).toEqual(seeded);
  });

  it("restores the previous year when an edit fails", async () => {
    const { qc, wrapper } = harness(seedYears);
    const before = qc.getQueryData(calendarKeys.academicYears());
    mockUpdateYear.mockRejectedValue(new Error("Academic year not found"));
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => { result.current.mutate({ id: "y-2", payload: { name: "Renamed" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.academicYears())).toEqual(before);
  });

  it("refetches the year list after an edit", async () => {
    const { qc, wrapper } = harness(seedYears);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockUpdateYear.mockResolvedValue({ id: "y-2" });
    const { result } = renderHook(() => useUpdateAcademicYear(), { wrapper });

    act(() => { result.current.mutate({ id: "y-2", payload: { name: "Renamed" } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.academicYears() });
  });

  it("removes a deleted year immediately", async () => {
    const { qc, wrapper } = harness(seedYears);
    mockDeleteYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useDeleteAcademicYear(), { wrapper });

    act(() => { result.current.mutate("y-2"); });

    await waitFor(() => expect(years(qc).map((y) => y.id)).toEqual(["y-1"]));
  });

  it("puts the year back when the server refuses the delete", async () => {
    const { qc, wrapper } = harness(seedYears);
    const before = qc.getQueryData(calendarKeys.academicYears());
    mockDeleteYear.mockRejectedValue(new Error("Not found"));
    const { result } = renderHook(() => useDeleteAcademicYear(), { wrapper });

    act(() => { result.current.mutate("y-2"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.academicYears())).toEqual(before);
  });

  it("also refetches holidays and assessment periods, which the delete reaches", async () => {
    // Holidays cascade with the year; the periods list is gated on a current year
    // existing. Neither is derivable from what this cache holds.
    const { qc, wrapper } = harness(seedYears);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockDeleteYear.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteAcademicYear(), { wrapper });

    act(() => { result.current.mutate("y-2"); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.academicYears() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.holidays() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.assessmentPeriods() });
  });
});

describe("#89 assessment periods", () => {
  const seedPeriods = (qc: QueryClient) =>
    qc.setQueryData(calendarKeys.assessmentPeriods(), [
      period({ id: "p-1", name: "Autumn MIL", startDate: "2025-10-01T00:00:00.000Z" }),
      period({ id: "p-2", name: "Summer 360", startDate: "2026-05-01T00:00:00.000Z" }),
    ]);

  it("shows a new period immediately, sorted by startDate ASC like the reader", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    mockCreatePeriod.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate(PERIOD_PAYLOAD); });

    await waitFor(() => expect(periods(qc)).toHaveLength(3));
    // 2026-03-01 belongs between the two seeded rows, not after them.
    expect(periods(qc).map((p) => p.name)).toEqual(["Autumn MIL", "Spring PCA", "Summer 360"]);
    expect(periods(qc)[1]).toMatchObject({ termId: "term-2", assessmentTypes: ["PCA"] });
    expect(periods(qc)[1].id.startsWith("optimistic-")).toBe(true);
  });

  it("falls back to the server's default name when none was given", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    mockCreatePeriod.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate({ ...PERIOD_PAYLOAD, name: "" }); });

    await waitFor(() => expect(periods(qc)).toHaveLength(3));
    expect(periods(qc)[1].name).toBe("Assessment Window");
  });

  it("restores the previous list when a create fails", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const before = qc.getQueryData(calendarKeys.assessmentPeriods());
    mockCreatePeriod.mockRejectedValue(
      new Error("No term available. Create an academic year with terms first."),
    );
    const { result } = renderHook(() => useCreateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate(PERIOD_PAYLOAD); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.assessmentPeriods())).toEqual(before);
  });

  it("refetches only the period list after a create", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockCreatePeriod.mockResolvedValue({ id: "p-3", name: "Spring PCA" });
    const { result } = renderHook(() => useCreateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate(PERIOD_PAYLOAD); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.assessmentPeriods() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: calendarKeys.academicYears() });
  });

  it("shows an edited period immediately and re-sorts it", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    mockUpdatePeriod.mockReturnValue(inFlight());
    const { result } = renderHook(() => useUpdateAssessmentPeriod(), { wrapper });

    act(() => {
      result.current.mutate({
        id: "p-1",
        payload: { name: "Late MIL", startDate: "2026-09-01", assessmentTypes: ["360"] },
      });
    });

    await waitFor(() => expect(periods(qc)[1].id).toBe("p-1"));
    expect(periods(qc)[1]).toMatchObject({
      name: "Late MIL",
      startDate: "2026-09-01",
      assessmentTypes: ["360"],
      // Untouched by the payload, so coalesced from the cached row.
      termId: "term-1",
      endDate: "2025-10-14T00:00:00.000Z",
    });
  });

  it("restores the previous period when an edit fails", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const before = qc.getQueryData(calendarKeys.assessmentPeriods());
    mockUpdatePeriod.mockRejectedValue(new Error("Assessment period not found"));
    const { result } = renderHook(() => useUpdateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate({ id: "p-1", payload: { name: "Late MIL" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.assessmentPeriods())).toEqual(before);
  });

  it("refetches the period list after an edit", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockUpdatePeriod.mockResolvedValue({ id: "p-1" });
    const { result } = renderHook(() => useUpdateAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate({ id: "p-1", payload: { name: "Late MIL" } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.assessmentPeriods() });
  });

  it("removes a deleted period immediately", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    mockDeletePeriod.mockReturnValue(inFlight());
    const { result } = renderHook(() => useDeleteAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate("p-1"); });

    await waitFor(() => expect(periods(qc).map((p) => p.id)).toEqual(["p-2"]));
  });

  it("puts the period back when the server refuses the delete", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const before = qc.getQueryData(calendarKeys.assessmentPeriods());
    mockDeletePeriod.mockRejectedValue(new Error("Not found"));
    const { result } = renderHook(() => useDeleteAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate("p-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.assessmentPeriods())).toEqual(before);
  });

  it("refetches the period list after a delete", async () => {
    const { qc, wrapper } = harness(seedPeriods);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockDeletePeriod.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteAssessmentPeriod(), { wrapper });

    act(() => { result.current.mutate("p-1"); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.assessmentPeriods() });
  });
});

describe("#89 holidays", () => {
  const seedHolidays = (qc: QueryClient) =>
    qc.setQueryData(calendarKeys.holidays(), [
      holiday({ id: "h-1", name: "Fall Break", date: "2025-10-20T00:00:00.000Z" }),
      holiday({ id: "h-2", name: "Winter Break", date: "2025-12-24T00:00:00.000Z" }),
    ]);

  it("shows a whole posted batch immediately, sorted by date ASC", async () => {
    // One write posts an array, so the insert is a batch — and the list is ordered by
    // date, not by the order the entries were typed.
    const { qc, wrapper } = harness(seedHolidays);
    mockCreateHolidays.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({
        holidays: [
          { name: "Founders Day", date: "2026-02-02", type: "school" },
          { name: "Labour Day", date: "2025-11-03", type: "national" },
        ],
      });
    });

    await waitFor(() => expect(holidays(qc)).toHaveLength(4));
    expect(holidays(qc).map((h) => h.name)).toEqual([
      "Fall Break",
      "Labour Day",
      "Winter Break",
      "Founders Day",
    ]);
    expect(holidays(qc)[1]).toMatchObject({ type: "national", date: "2025-11-03" });
  });

  it("trims and caps the name the way the writer normalises it", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    mockCreateHolidays.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({
        holidays: [{ name: `  ${"x".repeat(120)}  `, date: "2026-02-02", type: "custom" }],
      });
    });

    await waitFor(() => expect(holidays(qc)).toHaveLength(3));
    expect(holidays(qc)[2].name).toBe("x".repeat(100));
  });

  it("drops the entries the writer would drop rather than showing a phantom row", async () => {
    // normalizeHolidayInput discards an empty name and an unparseable date, and the
    // endpoint still answers 200 with a count — so a row shown for a discarded entry
    // would look saved until the refetch silently took it away.
    const { qc, wrapper } = harness(seedHolidays);
    mockCreateHolidays.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({
        holidays: [
          { name: "   ", date: "2026-02-02", type: "school" },
          { name: "Bad Date", date: "not-a-date", type: "school" },
          { name: "Founders Day", date: "2026-02-02", type: "school" },
        ],
      });
    });

    await waitFor(() => expect(holidays(qc)).toHaveLength(3));
    expect(holidays(qc).map((h) => h.name)).toEqual(["Fall Break", "Winter Break", "Founders Day"]);
  });

  it("leaves the list untouched, reference and order, when every entry is dropped", async () => {
    // When normalisation discards ALL of them there is nothing to show, and the hook
    // declines the entry rather than rewriting it. Declining matters twice: React Query
    // compares by reference, so handing back a new array re-renders the holiday panel for
    // no change at all — and the rewrite would be a re-SORT, which would silently reorder
    // a cached list the reader had handed back in some other order.
    const unsorted = [
      holiday({ id: "h-2", name: "Winter Break", date: "2025-12-24T00:00:00.000Z" }),
      holiday({ id: "h-1", name: "Fall Break", date: "2025-10-20T00:00:00.000Z" }),
    ];
    const { qc, wrapper } = harness((client) =>
      client.setQueryData(calendarKeys.holidays(), unsorted),
    );
    const before = holidays(qc);
    mockCreateHolidays.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({
        holidays: [
          { name: "   ", date: "2026-02-02", type: "school" },
          { name: "Bad Date", date: "not-a-date", type: "school" },
        ],
      });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(holidays(qc)).toBe(before);
    expect(holidays(qc).map((h) => h.id)).toEqual(["h-2", "h-1"]);
  });

  it("restores the previous list when the batch fails", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    const before = qc.getQueryData(calendarKeys.holidays());
    mockCreateHolidays.mockRejectedValue(new Error("No academic year. Create one first."));
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({ holidays: [{ name: "Founders Day", date: "2026-02-02", type: "school" }] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.holidays())).toEqual(before);
  });

  it("refetches only the holiday list after a batch", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockCreateHolidays.mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({ holidays: [{ name: "Founders Day", date: "2026-02-02", type: "school" }] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.holidays() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: calendarKeys.academicYears() });
  });

  it("removes a deleted holiday immediately", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    mockDeleteHoliday.mockReturnValue(inFlight());
    const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

    act(() => { result.current.mutate("h-1"); });

    await waitFor(() => expect(holidays(qc).map((h) => h.id)).toEqual(["h-2"]));
  });

  it("puts the holiday back when the server refuses the delete", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    const before = qc.getQueryData(calendarKeys.holidays());
    mockDeleteHoliday.mockRejectedValue(new Error("Not found"));
    const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

    act(() => { result.current.mutate("h-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(calendarKeys.holidays())).toEqual(before);
  });

  it("refetches the holiday list after a delete", async () => {
    const { qc, wrapper } = harness(seedHolidays);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockDeleteHoliday.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

    act(() => { result.current.mutate("h-1"); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: calendarKeys.holidays() });
  });
});

describe("#89 nothing is invented", () => {
  it("writes no list when none is cached", async () => {
    const { qc, wrapper } = harness(() => {});
    mockCreateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(calendarKeys.academicYears())).toBeUndefined();
  });

  it("declines a cache entry that is not the array the reader returns", async () => {
    // `unwrap()` in calendarService falls back to the whole response body, so an error
    // envelope can land here — and spreading it would throw inside the updater.
    const { qc, wrapper } = harness((client) =>
      client.setQueryData(calendarKeys.holidays(), { success: false, message: "No school" }),
    );
    mockCreateHolidays.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateHolidays(), { wrapper });

    act(() => {
      result.current.mutate({ holidays: [{ name: "Founders Day", date: "2026-02-02", type: "school" }] });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(calendarKeys.holidays())).toEqual({ success: false, message: "No school" });
  });

  it("leaves the other two calendar caches alone during a year create", async () => {
    const { qc, wrapper } = harness((client) => {
      client.setQueryData(calendarKeys.academicYears(), [year({ id: "y-1" })]);
      client.setQueryData(calendarKeys.assessmentPeriods(), [period({ id: "p-1" })]);
      client.setQueryData(calendarKeys.holidays(), [holiday({ id: "h-1" })]);
    });
    mockCreateYear.mockReturnValue(inFlight());
    const { result } = renderHook(() => useCreateAcademicYear(), { wrapper });

    act(() => { result.current.mutate(YEAR_PAYLOAD); });

    await waitFor(() => expect(years(qc)).toHaveLength(2));
    expect(periods(qc)).toEqual([period({ id: "p-1" })]);
    expect(holidays(qc)).toEqual([holiday({ id: "h-1" })]);
  });
});
