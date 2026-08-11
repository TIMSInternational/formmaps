/**
 * useSchoolProfileQueries.optimistic.test.tsx — formmaps#89.
 *
 * The school-admin hooks are the fourth family converted. Three things here are not
 * covered by the gradebook / notes / course-plan suites and are why this file exists:
 *
 *  1. Two of the seven writes are DELIBERATELY not optimistic — the logo upload (the
 *     URL is assigned by S3) and the bulk invite (the server decides which of N
 *     invites succeed). A skip is only a decision if something pins it down, so both
 *     are asserted to leave the cache alone while in flight.
 *
 *  2. The profile PUT rebuilds the address jsonb from five fields and CLEARS the ones
 *     the payload omits, and it never writes a key the payload left undefined. The
 *     optimistic patch has to mirror both, or it shows a row the server did not store.
 *
 *  3. A role change can move a user OUT of a role-filtered list. Patching the row in
 *     place there would leave a Counselor sitting in a list filtered to Staff.
 *
 * Every cache entry below is seeded by RUNNING THE REAL QUERY HOOK, not by writing it
 * in: that is the only way the test proves the mutation patches the same key the app
 * reads from. Every optimistic path is also exercised against a FAILING server — an
 * optimistic update that cannot roll back is worse than a spinner.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  schoolProfileKeys,
  useSchoolProfile,
  useSchoolUsers,
  useCounselorStudents,
  useAllCounselorAssignments,
  useUpdateSchoolProfile,
  useUploadSchoolLogo,
  useInviteStaff,
  useBulkInviteStaff,
  useUpdateUserRole,
  useAssignStudents,
  useUnassignStudents,
} from "../useSchoolProfileQueries";
import {
  getSchoolProfile,
  updateSchoolProfile,
  uploadSchoolLogo,
  getSchoolUsers,
  inviteStaff,
  bulkInviteStaff,
  updateUserRole,
  assignStudents,
  unassignStudents,
  getCounselorStudents,
  getAllCounselorAssignments,
} from "@/services/schoolProfileService";
import type {
  CounselorStudent,
  CounselorStudentsResponse,
  SchoolProfile,
  SchoolUser,
  SchoolUsersResponse,
} from "@/types/assessmentConfig";

jest.mock("@/services/schoolProfileService", () => ({
  getSchoolProfile: jest.fn(),
  updateSchoolProfile: jest.fn(),
  uploadSchoolLogo: jest.fn(),
  getSchoolUsers: jest.fn(),
  inviteStaff: jest.fn(),
  bulkInviteStaff: jest.fn(),
  updateUserRole: jest.fn(),
  assignStudents: jest.fn(),
  unassignStudents: jest.fn(),
  getCounselorStudents: jest.fn(),
  getAllCounselorAssignments: jest.fn(),
  getMyCounselorStudents: jest.fn(),
  getMyCounselorStudentDetail: jest.fn(),
}));

const mockGetProfile = getSchoolProfile as jest.Mock;
const mockUpdateProfile = updateSchoolProfile as jest.Mock;
const mockUploadLogo = uploadSchoolLogo as jest.Mock;
const mockGetUsers = getSchoolUsers as jest.Mock;
const mockInvite = inviteStaff as jest.Mock;
const mockBulkInvite = bulkInviteStaff as jest.Mock;
const mockUpdateRole = updateUserRole as jest.Mock;
const mockAssign = assignStudents as jest.Mock;
const mockUnassign = unassignStudents as jest.Mock;
const mockGetCaseload = getCounselorStudents as jest.Mock;
const mockGetAssignments = getAllCounselorAssignments as jest.Mock;

const COUNSELOR = "counselor-1";

// ── fixtures ────────────────────────────────────────────────────────────────────

const profile = (over: Partial<SchoolProfile> = {}): SchoolProfile => ({
  id: "school-1",
  name: "Willow High",
  logo: null,
  logoUrl: null,
  address: {
    street: "1 Old Road",
    city: "Springfield",
    state: "OR",
    country: "US",
    postalCode: "97477",
  },
  phone: "555-0100",
  email: "office@willow.test",
  website: "https://willow.test",
  timezone: "America/Los_Angeles",
  maxStudents: 500,
  currentStudents: 312,
  contractStart: "2026-01-01",
  contractEnd: "2026-12-31",
  status: "active",
  ...over,
});

/** A row shaped like GET /school-admin/users really sends it (roleName, not role). */
const user = (id: string, over: Partial<SchoolUser> & { roleName?: string } = {}) =>
  ({
    id,
    name: `User ${id}`,
    email: `${id}@willow.test`,
    role: "counselor",
    roleName: "counselor",
    status: "active",
    joinedAt: "2026-07-01T10:00:00.000Z",
    lastActive: "2026-08-01T10:00:00.000Z",
    ...over,
  }) as SchoolUser;

const userPage = (rows: SchoolUser[], page = 1): SchoolUsersResponse => ({
  data: rows,
  total: rows.length,
  page,
  limit: 10,
  totalPages: 1,
});

const student = (id: string): CounselorStudent => ({
  id,
  name: `Student ${id}`,
  email: `${id}@willow.test`,
  gradeLevel: 11,
  status: "active",
  assessmentStatus: {} as CounselorStudent["assessmentStatus"],
  creditProgress: { earned: 12, required: 24, percentage: 50 },
  gpa: 3.4,
  alertCount: 0,
  careerPath: "Engineering",
  lastActive: "2026-08-01T10:00:00.000Z",
});

const caseload = (rows: CounselorStudent[]): CounselorStudentsResponse => ({
  data: rows,
  total: rows.length,
  page: 1,
  limit: 1000,
  totalPages: 1,
});

// ── harness ─────────────────────────────────────────────────────────────────────

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

type Wrapper = ReturnType<typeof harness>["wrapper"];

/**
 * Seed a cache entry the way the app does — by running the real query hook — instead
 * of writing it in. `setQueryData(key, undefined)` registers no query at all, so a
 * suite built that way passes with the code under test never running; and seeding by
 * hand cannot catch a mutation that patches a key nothing reads from.
 */
async function seedProfile(wrapper: Wrapper, value = profile()) {
  mockGetProfile.mockResolvedValue(value);
  const { result } = renderHook(() => useSchoolProfile(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
}

async function seedUsers(
  wrapper: Wrapper,
  params: Parameters<typeof useSchoolUsers>[0],
  value: SchoolUsersResponse,
) {
  mockGetUsers.mockResolvedValue(value);
  const { result } = renderHook(() => useSchoolUsers(params), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
}

async function seedCaseload(wrapper: Wrapper, value: CounselorStudentsResponse) {
  mockGetCaseload.mockResolvedValue(value);
  const { result } = renderHook(() => useCounselorStudents(COUNSELOR, { limit: 1000 }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
}

async function seedAssignments(wrapper: Wrapper, value: { studentId: string; counselorId: string }[]) {
  mockGetAssignments.mockResolvedValue(value);
  const { result } = renderHook(() => useAllCounselorAssignments(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
}

/**
 * Neuter invalidation for the duration of a test. The seeded queries are ACTIVE (a
 * real hook is observing them), so a real invalidate would refetch the same mock
 * response and restore the cache all by itself — which would make every rollback
 * assertion below pass whether or not the rollback exists.
 */
const stubInvalidate = (qc: QueryClient) =>
  jest.spyOn(qc, "invalidateQueries").mockImplementation(() => Promise.resolve());

const usersKey = (params?: object) => schoolProfileKeys.userList(params);
const rows = (qc: QueryClient, params?: object) =>
  qc.getQueryData<SchoolUsersResponse>(usersKey(params))?.data ?? [];
const cached = (qc: QueryClient) => qc.getQueryData<SchoolProfile>(schoolProfileKeys.profile());

beforeEach(() => jest.clearAllMocks());

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 school profile — the form saves before the server answers", () => {
  it("shows the edited scalars immediately", async () => {
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    // Never settles: if the change only appeared on success, nothing would show.
    mockUpdateProfile.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => {
      result.current.mutate({ name: "Willow Academy", phone: "555-0199" });
    });

    await waitFor(() => expect(cached(qc)!.name).toBe("Willow Academy"));
    expect(cached(qc)!.phone).toBe("555-0199");
  });

  it("clears the address fields the payload omits, as the server does", async () => {
    // The PUT rebuilds the jsonb from exactly five fields, so a partial address wipes
    // the rest. Merging over the cached address would show the old street beside the
    // new city until a refetch disagreed.
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    mockUpdateProfile.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => {
      result.current.mutate({ address: { city: "Shelbyville" } });
    });

    await waitFor(() => expect(cached(qc)!.address.city).toBe("Shelbyville"));
    expect(cached(qc)!.address.street).toBe("");
    expect(cached(qc)!.address.postalCode).toBe("");
  });

  it("leaves the address alone when the payload has none", async () => {
    // The negative control for the test above: "replace" must not mean "clear".
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    mockUpdateProfile.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => { result.current.mutate({ name: "Willow Academy" }); });

    await waitFor(() => expect(cached(qc)!.name).toBe("Willow Academy"));
    expect(cached(qc)!.address.street).toBe("1 Old Road");
  });

  it("does not blank a field the caller passed as undefined", async () => {
    // ProfilePanel sends `name: form.name || undefined`. JSON.stringify drops the key,
    // so the server never writes it — and neither may the optimistic patch.
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    mockUpdateProfile.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => {
      result.current.mutate({ name: undefined, phone: "555-0199" });
    });

    await waitFor(() => expect(cached(qc)!.phone).toBe("555-0199"));
    expect(cached(qc)!.name).toBe("Willow High");
  });

  it("restores the exact profile when the save fails", async () => {
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    stubInvalidate(qc);
    const before = cached(qc);
    mockUpdateProfile.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => {
      result.current.mutate({ name: "Willow Academy", address: { city: "Shelbyville" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(qc)).toEqual(before);
  });

  it("merges the server row on success and never refetches", async () => {
    // The PUT echoes the whole schools row, so this response IS what a refetch would
    // have returned — refetching would buy the same bytes twice. Merged, not
    // substituted, so a field only the read carries survives.
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockUpdateProfile.mockResolvedValue({ name: "Willow Academy", phone: "555-0200" });
    const { result } = renderHook(() => useUpdateSchoolProfile(), { wrapper });

    act(() => { result.current.mutate({ name: "Willow Academy" }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cached(qc)).toMatchObject({
      name: "Willow Academy",
      phone: "555-0200",
      currentStudents: 312, // only the read carries it — not clobbered
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 logo upload — the deliberate skip", () => {
  it("shows NO logo while the upload is in flight", async () => {
    // S3 assigns the URL. A `blob:` preview written into the cache would be a
    // fabricated value under the name of a server field.
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    mockUploadLogo.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUploadSchoolLogo(), { wrapper });

    act(() => { result.current.mutate(new File(["x"], "logo.png")); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(cached(qc)!.logoUrl).toBeNull();
  });

  it("writes the real URL from the response without refetching the row", async () => {
    const { qc, wrapper } = harness();
    await seedProfile(wrapper);
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockUploadLogo.mockResolvedValue({ logoUrl: "https://cdn.test/logo-abc.png" });
    const { result } = renderHook(() => useUploadSchoolLogo(), { wrapper });

    act(() => { result.current.mutate(new File(["x"], "logo.png")); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cached(qc)!.logoUrl).toBe("https://cdn.test/logo-abc.png");
    expect(cached(qc)!.name).toBe("Willow High"); // the rest of the row untouched
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 staff invite — the row appears where the refetch will put it", () => {
  const invite = { name: "Ada Lovelace", email: "ada@willow.test", roleName: "counselor" } as const;

  it("shows the invited staff member immediately, at the top", async () => {
    // The list is ordered `createdDate DESC, id ASC`, so the newest user is row 1.
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1"), user("u-2")]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    expect(rows(qc)[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@willow.test",
      roleName: "counselor",
      status: "pending",
    });
  });

  it("bumps total so the Total Users card matches the table", async () => {
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1"), user("u-2")]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() =>
      expect(qc.getQueryData<SchoolUsersResponse>(usersKey(undefined))!.total).toBe(3),
    );
  });

  it("does not push the new user onto a cached page 2", async () => {
    const { qc, wrapper } = harness();
    const p2 = { page: 2, limit: 10 };
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    await seedUsers(wrapper, p2, userPage([user("old-1")], 2));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc)).toHaveLength(2));
    expect(rows(qc, p2).map((u) => u.id)).toEqual(["old-1"]);
  });

  it("does not push a counselor into a list filtered to staff", async () => {
    const { qc, wrapper } = harness();
    const staffOnly = { role: "staff", limit: 10 };
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    await seedUsers(wrapper, staffOnly, userPage([user("s-1", { roleName: "staff" })]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc)).toHaveLength(2));
    expect(rows(qc, staffOnly)).toHaveLength(1);
  });

  it("DOES push a counselor into the counselor-filtered list", async () => {
    // The negative control for the test above: the filter check has to be a match
    // test, not a blanket "skip anything filtered".
    const { qc, wrapper } = harness();
    const counselorsOnly = { role: "counselor", limit: 100 };
    await seedUsers(wrapper, counselorsOnly, userPage([user("u-1")]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc, counselorsOnly)).toHaveLength(2));
    expect(rows(qc, counselorsOnly)[0].name).toBe("Ada Lovelace");
  });

  it("honours the search box the same way the endpoint does", async () => {
    // `name ILIKE '%s%' OR email ILIKE '%s%'`, case-insensitive.
    const { qc, wrapper } = harness();
    const hit = { search: "ADA", page: 1, limit: 10 };
    const miss = { search: "zebra", page: 1, limit: 10 };
    await seedUsers(wrapper, hit, userPage([]));
    await seedUsers(wrapper, miss, userPage([]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc, hit)).toHaveLength(1));
    expect(rows(qc, miss)).toHaveLength(0);
  });

  it("still inserts into a list keyed with a status filter — the server ignores it", async () => {
    // GET /users accepts page/limit/role/search only. A `status` in the key is a
    // frontend fiction, so that entry is an unfiltered list and must get the row.
    const { qc, wrapper } = harness();
    const withStatus = { status: "active", page: 1, limit: 10 };
    await seedUsers(wrapper, withStatus, userPage([user("u-1")]));
    mockInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(rows(qc, withStatus)).toHaveLength(2));
  });

  it("takes the row back out when the invite fails", async () => {
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1"), user("u-2")]));
    stubInvalidate(qc);
    const before = qc.getQueryData(usersKey(undefined));
    mockInvite.mockRejectedValue(new Error("Email already registered"));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(usersKey(undefined))).toEqual(before);
  });

  it("reconciles the placeholder by invalidating the user list", async () => {
    // The response envelope is not one this client can pin down, and the row's id,
    // gradeLevel and isActive-derived status are server-owned. One refetch settles all.
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    const invalidate = stubInvalidate(qc);
    mockInvite.mockResolvedValue(user("server-id"));
    const { result } = renderHook(() => useInviteStaff(), { wrapper });

    act(() => { result.current.mutate({ ...invite }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: schoolProfileKeys.users() });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 bulk invite — the other deliberate skip", () => {
  it("adds nothing to the list while N invites are in flight", async () => {
    // Partial failure is this endpoint's normal outcome. Inserting all N and deleting
    // the failures a beat later shows users that never existed.
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    mockBulkInvite.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBulkInviteStaff(), { wrapper });

    act(() => {
      result.current.mutate({
        users: [
          { name: "A", email: "a@willow.test", roleName: "counselor" },
          { name: "B", email: "b@willow.test", roleName: "staff" },
        ],
      });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(rows(qc)).toHaveLength(1);
  });

  it("invalidates the user list once the server has reported", async () => {
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    const invalidate = stubInvalidate(qc);
    mockBulkInvite.mockResolvedValue({ success: true, invited: 1, failed: 1, results: [] });
    const { result } = renderHook(() => useBulkInviteStaff(), { wrapper });

    act(() => {
      result.current.mutate({ users: [{ name: "A", email: "a@willow.test", roleName: "staff" }] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: schoolProfileKeys.users() });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 role change — the third deliberate skip, because the endpoint is missing", () => {
  /**
   * These four assertions look backwards for a #89 suite: they demand that NOTHING
   * changes optimistically. That is the point.
   *
   * CORRECTED 2026-08-10 (formmaps#114): the premise above was wrong. The route DOES
   * exist on legacy — api/src/routes/school.ts:92, in the deployed 289776b4 — and a .NET
   * twin now exists too. The original comment claimed neither backend served it; whoever
   * wrote it read the legacy router and missed the line.
   *
   * The skip still stands, for a DIFFERENT and smaller reason: this hook has no UI caller,
   * so there is no interaction to make feel instant, and a role change can move a user out
   * of a role-filtered list — a naive in-place patch would strand a Counselor row in a list
   * filtered to Staff. These assertions therefore keep pinning "nothing moves optimistically".
   *
   * When a caller appears, delete this describe and restore the optimistic suite:
   * patch the row in an unfiltered list, REMOVE it from a list filtered to the role it
   * just left (total included), keep it when the ILIKE filter still matches, and roll
   * back on failure.
   */
  it("does not touch an unfiltered list while the request is in flight", async () => {
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1"), user("u-2")]));
    // Never settles, so anything in the cache below is an optimistic write.
    mockUpdateRole.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    act(() => { result.current.mutate({ userId: "u-1", roleName: "staff" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    // Both spellings, because the table reads `roleName || role` — neither may move.
    expect(rows(qc)[0].role).toBe("counselor");
    expect((rows(qc)[0] as SchoolUser & { roleName?: string }).roleName).toBe("counselor");
    expect(rows(qc)[1].role).toBe("counselor");
  });

  it("does not drop the user out of a list filtered to the role they would be leaving", async () => {
    const { qc, wrapper } = harness();
    const counselorsOnly = { role: "counselor", limit: 100 };
    await seedUsers(wrapper, counselorsOnly, userPage([user("u-1"), user("u-2")]));
    mockUpdateRole.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    act(() => { result.current.mutate({ userId: "u-1", roleName: "staff" }); });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(rows(qc, counselorsOnly).map((u) => u.id)).toEqual(["u-1", "u-2"]);
    // The count above the table stays put too.
    expect(qc.getQueryData<SchoolUsersResponse>(usersKey(counselorsOnly))!.total).toBe(2);
  });

  it("leaves the cache byte-identical when the request fails, having never patched it", async () => {
    // The 404 this endpoint really returns. With no onMutate there is nothing to roll
    // back, so the cache must be untouched at every point — not merely restored.
    const { qc, wrapper } = harness();
    const counselorsOnly = { role: "counselor", limit: 100 };
    await seedUsers(wrapper, counselorsOnly, userPage([user("u-1"), user("u-2")]));
    stubInvalidate(qc);
    const before = qc.getQueryData(usersKey(counselorsOnly));
    mockUpdateRole.mockRejectedValue(new Error("404 Not Found"));
    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    act(() => { result.current.mutate({ userId: "u-1", roleName: "staff" }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(usersKey(counselorsOnly))).toEqual(before);
    // Identity, not just equality: an optimistic patch followed by a rollback would
    // restore an equal object, and `toEqual` alone cannot tell the two apart.
    expect(qc.getQueryData(usersKey(counselorsOnly))).toBe(before);
  });

  it("invalidates the user list, which is where the derived counts live", async () => {
    const { qc, wrapper } = harness();
    await seedUsers(wrapper, undefined, userPage([user("u-1")]));
    const invalidate = stubInvalidate(qc);
    mockUpdateRole.mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    act(() => { result.current.mutate({ userId: "u-1", roleName: "staff" }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: schoolProfileKeys.users() });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 assigning students — the pairs, and only the pairs", () => {
  it("records the new assignment pairs immediately", async () => {
    const { qc, wrapper } = harness();
    await seedAssignments(wrapper, [{ studentId: "s-9", counselorId: "counselor-2" }]);
    mockAssign.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAssignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1", "s-2"] } });
    });

    await waitFor(() =>
      expect(qc.getQueryData<{ studentId: string }[]>(schoolProfileKeys.allAssignments())).toHaveLength(3),
    );
  });

  it("does not record the same pair twice", async () => {
    const { qc, wrapper } = harness();
    await seedAssignments(wrapper, [{ studentId: "s-1", counselorId: COUNSELOR }]);
    mockAssign.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAssignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1", "s-2"] } });
    });

    await waitFor(() =>
      expect(qc.getQueryData<{ studentId: string }[]>(schoolProfileKeys.allAssignments())).toHaveLength(2),
    );
  });

  it("does NOT invent caseload rows for the students it just assigned", async () => {
    // The caseload row carries a name, an email and a grade level this mutation only
    // has ids for, and the endpoint orders by the assignment row's own id — so even
    // the position of a synthesised row would be a guess.
    const { qc, wrapper } = harness();
    await seedCaseload(wrapper, caseload([student("s-0")]));
    await seedAssignments(wrapper, []);
    mockAssign.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAssignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    const list = qc.getQueryData<CounselorStudentsResponse>(
      schoolProfileKeys.counselorStudents(COUNSELOR, { limit: 1000 }),
    )!;
    expect(list.data.map((s) => s.id)).toEqual(["s-0"]);
    expect(list.total).toBe(1);
  });

  it("un-records the pairs when the assignment fails", async () => {
    const { qc, wrapper } = harness();
    await seedAssignments(wrapper, [{ studentId: "s-9", counselorId: "counselor-2" }]);
    stubInvalidate(qc);
    const before = qc.getQueryData(schoolProfileKeys.allAssignments());
    mockAssign.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useAssignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(schoolProfileKeys.allAssignments())).toEqual(before);
  });

  it("invalidates the whole school-profile tree, inactive queries included", async () => {
    // The losing counselor's caseload is usually an unmounted query by the time the
    // write lands, which is what `refetchType: "all"` is for.
    const { qc, wrapper } = harness();
    await seedAssignments(wrapper, []);
    const invalidate = stubInvalidate(qc);
    mockAssign.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAssignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: schoolProfileKeys.all,
      refetchType: "all",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("#89 unassigning students — a removal invents nothing", () => {
  const caseloadKey = schoolProfileKeys.counselorStudents(COUNSELOR, { limit: 1000 });
  const list = (qc: QueryClient) => qc.getQueryData<CounselorStudentsResponse>(caseloadKey)!;

  it("drops the student out of the caseload immediately, count and all", async () => {
    const { qc, wrapper } = harness();
    await seedCaseload(wrapper, caseload([student("s-1"), student("s-2")]));
    await seedAssignments(wrapper, [
      { studentId: "s-1", counselorId: COUNSELOR },
      { studentId: "s-2", counselorId: COUNSELOR },
    ]);
    mockUnassign.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUnassignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(list(qc).data.map((s) => s.id)).toEqual(["s-2"]));
    expect(list(qc).total).toBe(1);
    expect(
      qc.getQueryData<{ studentId: string }[]>(schoolProfileKeys.allAssignments()),
    ).toEqual([{ studentId: "s-2", counselorId: COUNSELOR }]);
  });

  it("leaves another counselor's pair alone", async () => {
    const { qc, wrapper } = harness();
    await seedCaseload(wrapper, caseload([student("s-1")]));
    await seedAssignments(wrapper, [
      { studentId: "s-1", counselorId: COUNSELOR },
      { studentId: "s-1", counselorId: "counselor-2" },
    ]);
    mockUnassign.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUnassignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() =>
      expect(
        qc.getQueryData<{ counselorId: string }[]>(schoolProfileKeys.allAssignments()),
      ).toEqual([{ studentId: "s-1", counselorId: "counselor-2" }]),
    );
  });

  it("puts the student BACK in both caches when the request fails", async () => {
    // The realistic failure, and the one that reads as data loss: the student vanishes
    // from the caseload and stays vanished until a reload.
    const { qc, wrapper } = harness();
    await seedCaseload(wrapper, caseload([student("s-1"), student("s-2")]));
    await seedAssignments(wrapper, [{ studentId: "s-1", counselorId: COUNSELOR }]);
    stubInvalidate(qc);
    const beforeCaseload = qc.getQueryData(caseloadKey);
    const beforeAssignments = qc.getQueryData(schoolProfileKeys.allAssignments());
    mockUnassign.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUnassignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(caseloadKey)).toEqual(beforeCaseload);
    expect(qc.getQueryData(schoolProfileKeys.allAssignments())).toEqual(beforeAssignments);
  });

  it("invalidates the whole school-profile tree, inactive queries included", async () => {
    const { qc, wrapper } = harness();
    await seedCaseload(wrapper, caseload([student("s-1")]));
    const invalidate = stubInvalidate(qc);
    mockUnassign.mockResolvedValue(undefined);
    const { result } = renderHook(() => useUnassignStudents(), { wrapper });

    act(() => {
      result.current.mutate({ counselorId: COUNSELOR, payload: { studentIds: ["s-1"] } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: schoolProfileKeys.all,
      refetchType: "all",
    });
  });
});
