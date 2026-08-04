/**
 * useGradebookQueries.optimistic.test.tsx — formmaps#89.
 *
 * Gradebook writes used to cost TWO sequential round trips before the table changed:
 * the mutation, then an invalidate-driven refetch of the whole gradebook. 151 of the
 * app's 153 mutations were shaped that way.
 *
 * The rollback path is the half that gets written and never verified, so it is the
 * centrepiece here: every optimistic mutation is tested with a FAILING server, and
 * the cache must return exactly to its previous value. An optimistic update that
 * cannot roll back is strictly worse than a spinner, because the user is left looking
 * at a change that did not happen.
 *
 * Also pins the deliberate NON-optimistic part: GPA is computed server-side from the
 * school's GpaConfiguration (custom letter->point maps, weighted-level bonuses), so
 * guessing it on the client would be wrong for any school on a non-default scale. It
 * must stay untouched until the refetch reconciles it.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateGrade, useUpdateGrade, useDeleteGrade } from "../useGradebookQueries";
import { createGrade, updateGrade, deleteGrade } from "@/services/gradebookService";
import type { StudentGradebook } from "@/services/gradebookService";

jest.mock("@/services/gradebookService", () => ({
  getStudentGradebook: jest.fn(),
  createGrade: jest.fn(),
  updateGrade: jest.fn(),
  deleteGrade: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockCreate = createGrade as jest.Mock;
const mockUpdate = updateGrade as jest.Mock;
const mockDelete = deleteGrade as jest.Mock;

const STUDENT = "stu-1";
const KEY = ["gradebook", STUDENT];

const seed = (): StudentGradebook => ({
  byYear: {
    "2025-2026": [
      { id: "g-1", courseId: "c-1", courseCode: "MATH", grade: "B", credits: 3, courseLevel: "honors", semester: "Fall", academicYear: "2025-2026", status: "completed" },
      { id: "g-2", courseId: "c-2", courseCode: "ENG", grade: "A", credits: 3, courseLevel: null, semester: "Fall", academicYear: "2025-2026", status: "completed" },
    ],
  },
  gpaUnweighted: 3.5,
  gpaWeighted: 3.75,
  totalCredits: 6,
});

function harness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(KEY, seed());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}
const cached = (qc: QueryClient) => qc.getQueryData<StudentGradebook>(KEY)!;
const rows = (qc: QueryClient) => cached(qc).byYear["2025-2026"] ?? [];

beforeEach(() => jest.clearAllMocks());

describe("#89 the UI updates before the server answers", () => {
  it("a new grade appears immediately, without waiting for the response", async () => {
    const { qc, wrapper } = harness();
    // A request that never settles: if the row only appeared on success, nothing
    // would show here at all.
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ grade: "A", courseId: "c-3", credits: 4, academicYear: "2025-2026" }); });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(rows(qc)[2]).toMatchObject({ grade: "A", courseId: "c-3" });
  });

  it("an edit shows immediately", async () => {
    const { qc, wrapper } = harness();
    mockUpdate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ gradeId: "g-1", input: { grade: "A+" } }); });

    await waitFor(() => expect(rows(qc).find((r) => r.id === "g-1")?.grade).toBe("A+"));
  });

  it("a delete removes the row immediately", async () => {
    const { qc, wrapper } = harness();
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate("g-1"); });

    await waitFor(() => expect(rows(qc).map((r) => r.id)).toEqual(["g-2"]));
  });

  it("buckets a new grade under Unknown when it has no academic year", async () => {
    // Mirrors how the backend groups (GradebookReader: null/empty year -> "Unknown"),
    // so the optimistic row lands in the same section the refetch will put it in.
    const { qc, wrapper } = harness();
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ grade: "C", courseId: "c-9" }); });

    await waitFor(() => expect(cached(qc).byYear["Unknown"]).toHaveLength(1));
  });
});

describe("#89 rollback — the half that usually goes untested", () => {
  it("restores the exact previous cache when a create fails", async () => {
    const { qc, wrapper } = harness();
    const before = cached(qc);
    mockCreate.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useCreateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ grade: "A", courseId: "c-3", academicYear: "2025-2026" }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(qc)).toEqual(before);
  });

  it("restores the previous grade when an update fails", async () => {
    const { qc, wrapper } = harness();
    mockUpdate.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ gradeId: "g-1", input: { grade: "F" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc).find((r) => r.id === "g-1")?.grade).toBe("B");   // not "F"
  });

  it("puts the row BACK when a delete fails", async () => {
    // The nastiest one to get wrong: the user sees a row vanish, the delete fails, and
    // without rollback it stays gone until a manual reload — which reads as data loss.
    const { qc, wrapper } = harness();
    mockDelete.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useDeleteGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate("g-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc).map((r) => r.id)).toEqual(["g-1", "g-2"]);
  });
});

describe("#89 server-computed values are NOT guessed", () => {
  it("leaves GPA and totalCredits untouched during an optimistic create", async () => {
    // A school with a custom GpaConfiguration would get a confidently wrong number.
    // Stale-for-200ms beats wrong.
    const { qc, wrapper } = harness();
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ grade: "A", courseId: "c-3", credits: 4, academicYear: "2025-2026" }); });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(cached(qc).gpaUnweighted).toBe(3.5);
    expect(cached(qc).gpaWeighted).toBe(3.75);
    expect(cached(qc).totalCredits).toBe(6);
  });

  it("does not invent a gradebook when nothing is cached yet", async () => {
    // Writing a synthetic gradebook into an empty cache would flash a table
    // containing only the row just added, then have it jump on refetch.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateGrade(STUDENT), { wrapper });

    act(() => { result.current.mutate({ grade: "A", courseId: "c-3" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(KEY)).toBeUndefined();
  });
});
