/**
 * useCommunityServiceQueries.optimistic.test.tsx — formmaps#89.
 *
 * The distinguishing feature of this hook family is that the DERIVED TOTALS move with
 * the entry, rather than being left stale the way the gradebook's GPA is. That is only
 * legitimate because these totals are already computed on the client and the endpoint
 * returns every entry unpaginated — so most of this file is about the totals staying
 * exactly right, including the two easy ways to get them wrong:
 *
 *   - rejected hours stay in `logged` but leave `pending` (a naive
 *     `pending = logged - verified` folds them back in, which is the bug `toSummary`
 *     carries a comment about)
 *   - the write endpoints echo `hours` back as a Decimal STRING, so a total adjusted
 *     with the un-normalised row becomes string concatenation: 5 + "3" = "53"
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLogCommunityService,
  useUpdateCommunityService,
  useDeleteCommunityService,
  useVerifyCommunityServiceEntry,
  communityServiceKeys,
} from "../useCommunityServiceQueries";
import {
  logCommunityService,
  updateCommunityService,
  deleteCommunityService,
  verifyCommunityServiceEntry,
} from "@/services/communityServiceService";
import type { CommunityServiceEntry, CommunityServiceSummary } from "@/types/communityService";

jest.mock("@/services/communityServiceService", () => ({
  ...jest.requireActual("@/services/communityServiceService"),
  getMyCommunityService: jest.fn(),
  getStudentCommunityService: jest.fn(),
  logCommunityService: jest.fn(),
  updateCommunityService: jest.fn(),
  deleteCommunityService: jest.fn(),
  verifyCommunityServiceEntry: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockLog = logCommunityService as jest.Mock;
const mockUpdate = updateCommunityService as jest.Mock;
const mockDelete = deleteCommunityService as jest.Mock;
const mockVerify = verifyCommunityServiceEntry as jest.Mock;

const entry = (over: Partial<CommunityServiceEntry> & { id: string }): CommunityServiceEntry => ({
  organization: "Food Bank",
  description: "Sorting donations",
  hours: 4,
  date: "2026-05-01",
  status: "pending",
  createdAt: "2026-05-01T00:00:00.000Z",
  ...over,
});

/** A summary whose totals are consistent with its entries, as the API always returns. */
const summary = (entries: CommunityServiceEntry[], required = 40): CommunityServiceSummary => ({
  totalHoursRequired: required,
  totalHoursLogged: entries.reduce((s, e) => s + e.hours, 0),
  totalHoursVerified: entries.filter((e) => e.status === "verified").reduce((s, e) => s + e.hours, 0),
  totalHoursPending: entries.filter((e) => e.status === "pending").reduce((s, e) => s + e.hours, 0),
  entries,
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

const mine = (qc: QueryClient) =>
  qc.getQueryData<CommunityServiceSummary>(communityServiceKeys.mine())!;

const PAYLOAD = { organization: "Shelter", description: "Serving meals", hours: 3, date: "2026-06-01" };

beforeEach(() => jest.clearAllMocks());

describe("#89 the entry and the progress bar move together", () => {
  const seedMine = (qc: QueryClient) =>
    qc.setQueryData(
      communityServiceKeys.mine(),
      summary([
        entry({ id: "e-1", hours: 4, date: "2026-05-01", status: "pending" }),
        entry({ id: "e-2", hours: 6, date: "2026-04-01", status: "verified" }),
      ]),
    );

  it("shows a logged entry immediately", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockLog.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(mine(qc).entries).toHaveLength(3));
    expect(mine(qc).entries[0]).toMatchObject({ organization: "Shelter", status: "pending" });
  });

  it("keeps the list in date-descending order rather than appending", async () => {
    // The list comes back ordered by `date desc`. Appending would show the row in a
    // position it then jumps out of on the next fetch.
    const { qc, wrapper } = harness(seedMine);
    mockLog.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate({ ...PAYLOAD, date: "2026-04-15" }); });

    await waitFor(() => expect(mine(qc).entries).toHaveLength(3));
    expect(mine(qc).entries.map((e) => e.date)).toEqual(["2026-05-01", "2026-04-15", "2026-04-01"]);
  });

  it("moves logged and pending, and leaves verified alone", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockLog.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(mine(qc).totalHoursLogged).toBe(13));   // 10 + 3
    expect(mine(qc).totalHoursPending).toBe(7);                        // 4 + 3
    expect(mine(qc).totalHoursVerified).toBe(6);                       // untouched
  });

  it("adjusts the totals by the DIFFERENCE when hours are edited", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockUpdate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateCommunityService(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { hours: 9 } }); });

    await waitFor(() => expect(mine(qc).totalHoursLogged).toBe(15));   // 10 - 4 + 9
    expect(mine(qc).totalHoursPending).toBe(9);
    expect(mine(qc).totalHoursVerified).toBe(6);
  });

  it("takes the hours back out when an entry is deleted", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteCommunityService(), { wrapper });

    act(() => { result.current.mutate("e-1"); });

    await waitFor(() => expect(mine(qc).entries.map((e) => e.id)).toEqual(["e-2"]));
    expect(mine(qc).totalHoursLogged).toBe(6);
    expect(mine(qc).totalHoursPending).toBe(0);
    expect(mine(qc).totalHoursVerified).toBe(6);
  });

  it("does not invent a summary when nothing is cached", async () => {
    const { qc, wrapper } = harness(() => {});
    mockLog.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(communityServiceKeys.mine())).toBeUndefined();
  });
});

describe("#89 the response replaces the placeholder", () => {
  const seedMine = (qc: QueryClient) =>
    qc.setQueryData(communityServiceKeys.mine(), summary([entry({ id: "e-1", hours: 4 })]));

  it("swaps in the server row without duplicating it", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockLog.mockResolvedValue(entry({ id: "server-1", hours: 3, date: "2026-06-01" }));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mine(qc).entries.map((e) => e.id)).toEqual(["server-1", "e-1"]);
  });

  it("coerces the Decimal STRING the API sends for hours", async () => {
    // Prisma serialises Decimal as a string. Left alone, the next total adjustment is
    // `5 + "3"` — string concatenation, and the progress bar reads "53".
    const { qc, wrapper } = harness(seedMine);
    mockLog.mockResolvedValue({ ...entry({ id: "server-1", date: "2026-06-01" }), hours: "3.5" });
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate({ ...PAYLOAD, hours: 3.5 }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = mine(qc).entries.find((e) => e.id === "server-1")!;
    expect(stored.hours).toBe(3.5);
    expect(typeof stored.hours).toBe("number");
  });

  it("does not refetch after a successful log", async () => {
    const { qc, wrapper } = harness(seedMine);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockLog.mockResolvedValue(entry({ id: "server-1", hours: 3, date: "2026-06-01" }));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("#89 rollback", () => {
  const seedMine = (qc: QueryClient) =>
    qc.setQueryData(
      communityServiceKeys.mine(),
      summary([entry({ id: "e-1", hours: 4, status: "pending" })]),
    );

  it("restores entries AND totals when a log fails", async () => {
    const { qc, wrapper } = harness(seedMine);
    const before = qc.getQueryData(communityServiceKeys.mine());
    mockLog.mockRejectedValue(new Error("No school"));
    const { result } = renderHook(() => useLogCommunityService(), { wrapper });

    act(() => { result.current.mutate(PAYLOAD); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(communityServiceKeys.mine())).toEqual(before);
  });

  it("puts a deleted entry back when the server refuses", async () => {
    // The server 404s a delete of anything already verified — reachable when an admin
    // verifies the entry while the student is deleting it.
    const { qc, wrapper } = harness(seedMine);
    const before = qc.getQueryData(communityServiceKeys.mine());
    mockDelete.mockRejectedValue(new Error("Not found"));
    const { result } = renderHook(() => useDeleteCommunityService(), { wrapper });

    act(() => { result.current.mutate("e-1"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(communityServiceKeys.mine())).toEqual(before);
  });

  it("restores the previous hours when an edit fails", async () => {
    const { qc, wrapper } = harness(seedMine);
    mockUpdate.mockRejectedValue(new Error("Not found"));
    const { result } = renderHook(() => useUpdateCommunityService(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { hours: 99 } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mine(qc).entries[0].hours).toBe(4);
    expect(mine(qc).totalHoursLogged).toBe(4);
  });
});

describe("#89 admin verification", () => {
  const STUDENT = "stu-1";
  const studentKey = communityServiceKeys.student(STUDENT);
  const seedStudent = (qc: QueryClient) =>
    qc.setQueryData(
      studentKey,
      summary([
        entry({ id: "e-1", hours: 4, status: "pending" }),
        entry({ id: "e-2", hours: 6, status: "verified", date: "2026-04-01" }),
      ]),
    );
  const cached = (qc: QueryClient) => qc.getQueryData<CommunityServiceSummary>(studentKey)!;

  it("moves hours from pending to verified", async () => {
    const { qc, wrapper } = harness(seedStudent);
    mockVerify.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useVerifyCommunityServiceEntry(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { status: "verified" } }); });

    await waitFor(() => expect(cached(qc).totalHoursVerified).toBe(10));
    expect(cached(qc).totalHoursPending).toBe(0);
    expect(cached(qc).totalHoursLogged).toBe(10);                // unchanged
  });

  it("a rejection leaves the hours in logged but takes them out of pending", async () => {
    // `toSummary` counts rejected hours in `logged` and in neither of the others;
    // deriving pending as logged - verified would wrongly fold them back into pending.
    const { qc, wrapper } = harness(seedStudent);
    mockVerify.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useVerifyCommunityServiceEntry(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { status: "rejected", note: "No proof" } }); });

    await waitFor(() => expect(cached(qc).entries[0].status).toBe("rejected"));
    expect(cached(qc).totalHoursPending).toBe(0);
    expect(cached(qc).totalHoursVerified).toBe(6);
    expect(cached(qc).totalHoursLogged).toBe(10);
  });

  it("leaves another student's cached entries untouched", async () => {
    const otherKey = communityServiceKeys.student("stu-2");
    const { qc, wrapper } = harness((c) => {
      seedStudent(c);
      c.setQueryData(otherKey, summary([entry({ id: "other-1", hours: 2, status: "pending" })]));
    });
    mockVerify.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useVerifyCommunityServiceEntry(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { status: "verified" } }); });

    await waitFor(() => expect(cached(qc).totalHoursVerified).toBe(10));
    expect(qc.getQueryData<CommunityServiceSummary>(otherKey)).toEqual(
      summary([entry({ id: "other-1", hours: 2, status: "pending" })]),
    );
  });

  it("refetches the student's own view, which is served by a different endpoint", async () => {
    const { qc, wrapper } = harness(seedStudent);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockVerify.mockResolvedValue(entry({ id: "e-1", hours: 4, status: "verified" }));
    const { result } = renderHook(() => useVerifyCommunityServiceEntry(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { status: "verified" } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: communityServiceKeys.mine() });
  });

  it("rolls the verification back when it fails", async () => {
    const { qc, wrapper } = harness(seedStudent);
    const before = qc.getQueryData(studentKey);
    mockVerify.mockRejectedValue(new Error("Entry not found"));
    const { result } = renderHook(() => useVerifyCommunityServiceEntry(), { wrapper });

    act(() => { result.current.mutate({ entryId: "e-1", payload: { status: "verified" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(studentKey)).toEqual(before);
  });
});
