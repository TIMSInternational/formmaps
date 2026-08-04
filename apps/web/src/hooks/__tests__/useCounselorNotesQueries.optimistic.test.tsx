/**
 * useCounselorNotesQueries.optimistic.test.tsx — formmaps#89.
 *
 * Notes are the second hook family converted after the gradebook. Two things here are
 * not covered by the gradebook tests and are the reason this file exists:
 *
 *  1. The notes cache is keyed with a trailing params object, so ONE student has many
 *     cache entries (page 1, page 2, filtered by type). An edit or delete must reach
 *     all of them; an INSERT must not — a new note is the newest, so it belongs at the
 *     top of page 1 and of a list filtered to its own type, and nowhere else.
 *
 *  2. Create and update do not invalidate at all. The write endpoints echo the row
 *     back, so `onSuccess` substitutes it and the refetch — the second round trip #89
 *     is about — never happens. That is only safe if the placeholder is really
 *     replaced rather than left behind or duplicated, which is what the tests below
 *     pin down.
 *
 * As in the gradebook file, every optimistic path is also exercised against a FAILING
 * server: an optimistic update that cannot roll back is worse than a spinner.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
  useCompleteFollowUp,
} from "../useCounselorNotesQueries";
import {
  createNote,
  updateNote,
  deleteNote,
  completeFollowUp,
} from "@/services/counselorNotesService";
import type { CounselorNote, CounselorNotesResponse } from "@/types/counselorNotes";

jest.mock("@/services/counselorNotesService", () => ({
  getStudentNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  completeFollowUp: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockCreate = createNote as jest.Mock;
const mockUpdate = updateNote as jest.Mock;
const mockDelete = deleteNote as jest.Mock;
const mockComplete = completeFollowUp as jest.Mock;

const STUDENT = "stu-1";
const page1Key = ["counselor-notes", "student", STUDENT, {}];
const page2Key = ["counselor-notes", "student", STUDENT, { page: 2 }];
const careerKey = ["counselor-notes", "student", STUDENT, { type: "career" }];

const note = (id: string, over: Partial<CounselorNote> = {}): CounselorNote => ({
  id,
  studentId: STUDENT,
  authorId: "counselor-1",
  authorName: "Ada Counselor",
  type: "general",
  content: `note ${id}`,
  isPrivate: false,
  followUpDate: null,
  followUpCompleted: false,
  tags: [],
  createdDate: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...over,
});

const envelope = (rows: CounselorNote[], page = 1): CounselorNotesResponse => ({
  data: rows,
  total: rows.length,
  page,
  limit: 20,
  totalPages: 1,
});

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(page1Key, envelope([note("n-1"), note("n-2")]));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const rows = (qc: QueryClient, key: unknown[] = page1Key) =>
  qc.getQueryData<CounselorNotesResponse>(key)?.data ?? [];

beforeEach(() => jest.clearAllMocks());

describe("#89 the note appears before the server answers", () => {
  it("shows a new note immediately, at the top", async () => {
    const { qc, wrapper } = harness();
    // Never settles: if the row only appeared on success, nothing would show at all.
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    // Top, not bottom: the list is ordered createdDate desc.
    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(rows(qc)[0].content).toBe("fresh");
  });

  it("bumps total so the entry count matches the list", async () => {
    const { qc, wrapper } = harness();
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() =>
      expect(qc.getQueryData<CounselorNotesResponse>(page1Key)!.total).toBe(3),
    );
  });

  it("removes a note immediately", async () => {
    const { qc, wrapper } = harness();
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteNote(), { wrapper });

    act(() => { result.current.mutate({ noteId: "n-1", studentId: STUDENT }); });

    await waitFor(() => expect(rows(qc).map((n) => n.id)).toEqual(["n-2"]));
  });

  it("shows an edit immediately", async () => {
    const { qc, wrapper } = harness();
    mockUpdate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    act(() => {
      result.current.mutate({ noteId: "n-1", studentId: STUDENT, payload: { content: "edited" } });
    });

    await waitFor(() => expect(rows(qc)[0].content).toBe("edited"));
  });

  it("ticks a follow-up immediately", async () => {
    const { qc, wrapper } = harness();
    mockComplete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCompleteFollowUp(), { wrapper });

    act(() => { result.current.mutate({ noteId: "n-1", studentId: STUDENT }); });

    await waitFor(() => expect(rows(qc)[0].followUpCompleted).toBe(true));
  });
});

describe("#89 an insert only lands where it belongs", () => {
  it("does not push a new note onto a cached page 2", async () => {
    // Page 2 holds older notes. A note added there is a row the next fetch will not
    // return — it would appear, then silently disappear.
    const { qc, wrapper } = harness();
    qc.setQueryData(page2Key, envelope([note("old-1")], 2));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(rows(qc, page2Key).map((n) => n.id)).toEqual(["old-1"]);
  });

  it("does not push a general note into a list filtered to career notes", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(careerKey, envelope([note("c-1", { type: "career" })]));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(rows(qc, careerKey)).toHaveLength(1);
  });

  it("DOES push a career note into the career-filtered list", async () => {
    // The negative control for the two above: the filter check must be a match test,
    // not a blanket "skip anything filtered".
    const { qc, wrapper } = harness();
    qc.setQueryData(careerKey, envelope([note("c-1", { type: "career" })]));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "career", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(rows(qc, careerKey)).toHaveLength(2));
    expect(rows(qc, careerKey)[0].content).toBe("fresh");
  });

  it("reaches every cached page when deleting", async () => {
    // The reverse of an insert: a deleted note could be on any page, so the removal
    // has to be attempted everywhere.
    const { qc, wrapper } = harness();
    qc.setQueryData(page2Key, envelope([note("old-1")], 2));
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteNote(), { wrapper });

    act(() => { result.current.mutate({ noteId: "old-1", studentId: STUDENT }); });

    await waitFor(() => expect(rows(qc, page2Key)).toHaveLength(0));
    expect(rows(qc)).toHaveLength(2);           // page 1 untouched
  });
});

describe("#89 rollback — the half that usually goes untested", () => {
  it("restores the exact cache when a create fails", async () => {
    const { qc, wrapper } = harness();
    const before = qc.getQueryData(page1Key);
    mockCreate.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(page1Key)).toEqual(before);
  });

  it("puts the note BACK when a delete 403s", async () => {
    // The realistic failure, not a hypothetical: the API rejects deleting another
    // counselor's note, and the UI shows a delete button on every note in the list.
    // Without rollback the note stays gone until a reload, which reads as data loss.
    const { qc, wrapper } = harness();
    mockDelete.mockRejectedValue(new Error("Not authorized"));
    const { result } = renderHook(() => useDeleteNote(), { wrapper });

    act(() => { result.current.mutate({ noteId: "n-1", studentId: STUDENT }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc).map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(qc.getQueryData<CounselorNotesResponse>(page1Key)!.total).toBe(2);
  });

  it("restores the previous content when an edit fails", async () => {
    const { qc, wrapper } = harness();
    mockUpdate.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    act(() => {
      result.current.mutate({ noteId: "n-1", studentId: STUDENT, payload: { content: "edited" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc)[0].content).toBe("note n-1");
  });

  it("un-ticks a follow-up when the request fails", async () => {
    const { qc, wrapper } = harness();
    mockComplete.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useCompleteFollowUp(), { wrapper });

    act(() => { result.current.mutate({ noteId: "n-1", studentId: STUDENT }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc)[0].followUpCompleted).toBe(false);
  });

  it("rolls back every page it touched, not just the one that changed", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(page2Key, envelope([note("old-1")], 2));
    const beforeP1 = qc.getQueryData(page1Key);
    const beforeP2 = qc.getQueryData(page2Key);
    mockDelete.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useDeleteNote(), { wrapper });

    act(() => { result.current.mutate({ noteId: "old-1", studentId: STUDENT }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(page1Key)).toEqual(beforeP1);
    expect(qc.getQueryData(page2Key)).toEqual(beforeP2);
  });
});

describe("#89 the response replaces the placeholder — no second round trip", () => {
  it("swaps the placeholder for the server row instead of appending a duplicate", async () => {
    const { qc, wrapper } = harness();
    mockCreate.mockResolvedValue(note("server-id", { content: "fresh" }));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc).map((n) => n.id)).toEqual(["server-id", "n-1", "n-2"]);
  });

  it("leaves no placeholder id in the cache", async () => {
    // A leftover `optimistic-…` id means the next delete or edit of that row would be
    // sent to an id the server has never heard of.
    const { qc, wrapper } = harness();
    mockCreate.mockResolvedValue(note("server-id"));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc).some((n) => n.id.startsWith("optimistic-"))).toBe(false);
  });

  it("does not refetch after a successful create", async () => {
    // This assertion IS the point of #89 for this hook: the POST response is the row
    // the refetch would have returned, so refetching buys the same bytes twice.
    const { qc, wrapper } = harness();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockCreate.mockResolvedValue(note("server-id"));
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    act(() => {
      result.current.mutate({ studentId: STUDENT, type: "general", content: "fresh", isPrivate: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("merges an update response rather than substituting it", async () => {
    // The PUT echoes the bare row without the `authorName` join the list endpoint
    // adds; substituting would blank the author out until the next full fetch.
    const { qc, wrapper } = harness();
    mockUpdate.mockResolvedValue({ id: "n-1", content: "edited", type: "academic" });
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    act(() => {
      result.current.mutate({ noteId: "n-1", studentId: STUDENT, payload: { content: "edited" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc)[0]).toMatchObject({
      id: "n-1",
      content: "edited",
      type: "academic",
      authorName: "Ada Counselor",
    });
  });

  it("merges the partial row that complete-followup returns", async () => {
    const { qc, wrapper } = harness();
    mockComplete.mockResolvedValue({
      id: "n-1",
      followUpCompleted: true,
      followUpCompletedAt: "2026-08-04T09:00:00.000Z",
    });
    const { result } = renderHook(() => useCompleteFollowUp(), { wrapper });

    act(() => { result.current.mutate({ noteId: "n-1", studentId: STUDENT }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc)[0]).toMatchObject({
      content: "note n-1",                                     // not clobbered
      followUpCompleted: true,
      followUpCompletedAt: "2026-08-04T09:00:00.000Z",
    });
  });
});
