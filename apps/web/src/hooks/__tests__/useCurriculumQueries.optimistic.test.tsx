/**
 * useCurriculumQueries.optimistic.test.tsx — formmaps#89.
 *
 * The curriculum hooks differ from the gradebook and notes families in three ways, and
 * those three are what this file is for:
 *
 *  1. The same rows are cached under TWO key roots — the school-admin catalog
 *     (`curriculum/school-courses/list`) and the student-facing one
 *     (`curriculum/available-courses`). Every course write has to reach both, and the
 *     pre-#89 hooks invalidated only the first.
 *
 *  2. The catalog is ordered by code ASC across pages and has a block of framework
 *     rows appended, un-paginated, after the school-course rows. An insert therefore
 *     has a POSITION and a page it belongs on, and getting either wrong shows a row
 *     that jumps or vanishes on the next fetch.
 *
 *  3. Seven of the twelve mutations are deliberately NOT optimistic. The one that is
 *     easiest to "helpfully" convert later — useUpdateFrameworkCourse, whose list read
 *     never reflects the override — is pinned below so that conversion fails loudly.
 *
 * Where a test is about an invalidation KEY it asserts through a really-rendered query:
 * the reading hook is mounted, and the assertion is that its queryFn ran a second time.
 * A spy on invalidateQueries would pass just as happily with the wrong key.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  curriculumKeys,
  useCreateSchoolCourse,
  useDeleteSchoolCourse,
  useSchoolCourses,
  useCoursePathways,
  useFrameworks,
  usePrerequisiteChain,
  useUpdateFrameworkCourse,
  useUpdateFrameworks,
  useUpdatePrerequisites,
  useUpdateSchoolCourse,
} from "../useCurriculumQueries";
import {
  createSchoolCourse,
  deleteSchoolCourse,
  getCoursePathways,
  getFrameworks,
  getPrerequisiteChain,
  getSchoolCourses,
  updateFrameworkCourse,
  updateFrameworks,
  updatePrerequisites,
  updateSchoolCourse,
} from "@/services/curriculumService";
import type {
  CurriculumFramework,
  SchoolCourse,
  SchoolCoursesResponse,
} from "@/types/curriculum";

jest.mock("@/services/curriculumService", () => ({
  getFrameworks: jest.fn(),
  updateFrameworks: jest.fn(),
  getFrameworkCourses: jest.fn(),
  updateFrameworkCourse: jest.fn(),
  getSchoolCourses: jest.fn(),
  getAvailableCourses: jest.fn(),
  createSchoolCourse: jest.fn(),
  updateSchoolCourse: jest.fn(),
  deleteSchoolCourse: jest.fn(),
  importSchoolCourses: jest.fn(),
  updatePrerequisites: jest.fn(),
  checkPrerequisites: jest.fn(),
  getPrerequisiteChain: jest.fn(),
  recognizeCourses: jest.fn(),
  recognizeAllUnmapped: jest.fn(),
  applyAIMapping: jest.fn(),
  analyzePrerequisites: jest.fn(),
  applyPrereqSuggestions: jest.fn(),
  getMyCourseEligibility: jest.fn(),
  getCoursePathways: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockCreate = createSchoolCourse as jest.Mock;
const mockUpdate = updateSchoolCourse as jest.Mock;
const mockDelete = deleteSchoolCourse as jest.Mock;
const mockUpdatePrereqs = updatePrerequisites as jest.Mock;
const mockUpdateFrameworks = updateFrameworks as jest.Mock;
const mockUpdateFrameworkCourse = updateFrameworkCourse as jest.Mock;
const mockGetCourses = getSchoolCourses as jest.Mock;
const mockGetFrameworks = getFrameworks as jest.Mock;
const mockGetChain = getPrerequisiteChain as jest.Mock;
const mockGetPathways = getCoursePathways as jest.Mock;

// The params the hooks are really called with in the admin panel.
const LIST_PARAMS = { page: 1, limit: 20 };
const listKey = curriculumKeys.schoolCourseList(LIST_PARAMS);
const page2Key = curriculumKeys.schoolCourseList({ page: 2, limit: 20 });
const searchKey = curriculumKeys.schoolCourseList({ page: 1, limit: 20, search: "bio" });
const availableKey = curriculumKeys.availableCourses({ page: 1 });
const frameworksKey = curriculumKeys.frameworks();

const course = (id: string, code: string, over: Partial<SchoolCourse> = {}): SchoolCourse => ({
  id,
  code,
  name: `Course ${code}`,
  department: "Science",
  credits: 1,
  gradeLevels: [9],
  prerequisites: [],
  corequisites: [],
  enrollmentCount: 0,
  status: "active",
  ...over,
});

const envelope = (
  rows: SchoolCourse[],
  over: Partial<SchoolCoursesResponse> = {},
): SchoolCoursesResponse => ({
  data: rows,
  total: rows.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...over,
});

const framework = (type: CurriculumFramework["type"], enabled: boolean): CurriculumFramework => ({
  id: `fw-${type}`,
  type,
  label: type,
  enabled,
  courseCount: 42,
  configuredAt: "2026-07-01T00:00:00.000Z",
});

const payload = {
  code: "BIO-150",
  name: "Biology",
  department: "Science",
  credits: 1,
  gradeLevels: [10],
};

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const rows = (qc: QueryClient, key: readonly unknown[] = listKey) =>
  qc.getQueryData<SchoolCoursesResponse>(key)?.data ?? [];
const codes = (qc: QueryClient, key: readonly unknown[] = listKey) =>
  rows(qc, key).map((c) => c.code);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCourses.mockResolvedValue(envelope([course("c-art", "ART-100"), course("c-math", "MATH-200")]));
  mockGetFrameworks.mockResolvedValue([framework("AP", false), framework("IB", true)]);
  mockGetChain.mockResolvedValue({ courseId: "c-chem", courseCode: "CHEM-100", chain: [], totalDepth: 0 });
  mockGetPathways.mockResolvedValue({ truncated: false, groups: [] });
});

describe("#89 the catalog changes before the server answers", () => {
  it("shows a new course immediately, in code order", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100"), course("c-math", "MATH-200")]));
    // Never settles: if the row only appeared on success, nothing would show at all.
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(rows(qc)).toHaveLength(3));
    // Between ART and MATH — the list is ordered by code, not by insertion.
    expect(codes(qc)).toEqual(["ART-100", "BIO-150", "MATH-200"]);
  });

  it("bumps total so the entry count matches the list", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(qc.getQueryData<SchoolCoursesResponse>(listKey)!.total).toBe(2));
  });

  it("shows an edit immediately", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    mockUpdate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-art", payload: { name: "Renamed", credits: 3 } }); });

    await waitFor(() => expect(rows(qc)[0].name).toBe("Renamed"));
    expect(rows(qc)[0].credits).toBe(3);
  });

  it("removes a course immediately, and drops the total with it", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100"), course("c-math", "MATH-200")]));
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteSchoolCourse(), { wrapper });

    act(() => { result.current.mutate("c-art"); });

    await waitFor(() => expect(codes(qc)).toEqual(["MATH-200"]));
    expect(qc.getQueryData<SchoolCoursesResponse>(listKey)!.total).toBe(1);
  });

  it("flips a framework toggle immediately without inventing the server's timestamp", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(frameworksKey, [framework("AP", false), framework("IB", true)]);
    mockUpdateFrameworks.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateFrameworks(), { wrapper });

    act(() => {
      result.current.mutate({ frameworks: [{ type: "AP", enabled: true }, { type: "IB", enabled: true }] });
    });

    await waitFor(() => expect(qc.getQueryData<CurriculumFramework[]>(frameworksKey)![0].enabled).toBe(true));
    const ap = qc.getQueryData<CurriculumFramework[]>(frameworksKey)![0];
    // configuredAt is stamped by the server on every write, and courseCount does not
    // move at all — neither may be guessed here.
    expect(ap.configuredAt).toBe("2026-07-01T00:00:00.000Z");
    expect(ap.courseCount).toBe(42);
  });

  it("patches the catalog the app really fetched, not just one poked into the cache", async () => {
    // The trap this guards: a cache entry seeded with `undefined` registers no query at
    // all, so the patch never runs and every assertion around it passes vacuously.
    // Here the entry exists because the query hook fetched it.
    const { qc, wrapper } = harness();
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => ({ list: useSchoolCourses(LIST_PARAMS), create: useCreateSchoolCourse() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data).toBeDefined());
    act(() => { result.current.create.mutate(payload); });

    await waitFor(() => expect(result.current.list.data!.data).toHaveLength(3));
    expect(codes(qc)).toEqual(["ART-100", "BIO-150", "MATH-200"]);
  });
});

describe("#89 an insert only lands where it belongs", () => {
  it("reaches the student-facing catalog too, not only the admin one", async () => {
    // Same rows, second key root. The pre-#89 hook patched and invalidated neither.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    qc.setQueryData(availableKey, envelope([course("c-art", "ART-100")]));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(codes(qc, availableKey)).toEqual(["ART-100", "BIO-150"]));
  });

  it("does not push a new course into a searched list", async () => {
    // The server filters with an ILIKE over code+name; guessing whether a brand-new
    // course matches shows a row the refetch removes.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    qc.setQueryData(searchKey, envelope([course("c-bio2", "BIO-900")]));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(rows(qc)).toHaveLength(2));
    expect(codes(qc, searchKey)).toEqual(["BIO-900"]);
  });

  it("does not push a course onto a page it sorts before", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(page2Key, envelope([course("c-math", "MATH-200"), course("c-zoo", "ZOO-100")], { page: 2, totalPages: 2 }));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); }); // BIO-150 sorts before MATH-200

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(codes(qc, page2Key)).toEqual(["MATH-200", "ZOO-100"]);
  });

  it("DOES push a course onto the last page when it sorts there", async () => {
    // The negative control for the two above: the page check is a range test, not a
    // blanket "skip anything that is not page 1".
    const { qc, wrapper } = harness();
    qc.setQueryData(page2Key, envelope([course("c-math", "MATH-200"), course("c-zoo", "ZOO-100")], { page: 2, totalPages: 2 }));
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate({ ...payload, code: "ZZZ-999" }); });

    await waitFor(() => expect(codes(qc, page2Key)).toEqual(["MATH-200", "ZOO-100", "ZZZ-999"]));
  });

  it("keeps the un-paginated framework block at the end", async () => {
    // The API appends every enabled framework's courses AFTER the school-course rows,
    // ignoring pagination. Sorting the new row against that tail would file it in the
    // middle of a block it is not part of.
    const { qc, wrapper } = harness();
    qc.setQueryData(
      listKey,
      envelope([
        course("c-art", "ART-100"),
        course("c-math", "MATH-200"),
        { ...course("fw-1", "AP-BIO"), isFrameworkCourse: true } as SchoolCourse,
      ]),
    );
    mockCreate.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate({ ...payload, code: "PHY-300" }); });

    await waitFor(() => expect(codes(qc)).toEqual(["ART-100", "MATH-200", "PHY-300", "AP-BIO"]));
  });

  it("reaches every cached page when deleting", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    qc.setQueryData(page2Key, envelope([course("c-zoo", "ZOO-100")], { page: 2, totalPages: 2 }));
    mockDelete.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDeleteSchoolCourse(), { wrapper });

    act(() => { result.current.mutate("c-zoo"); });

    await waitFor(() => expect(rows(qc, page2Key)).toHaveLength(0));
    expect(codes(qc)).toEqual(["ART-100"]);          // page 1 untouched
  });
});

describe("#89 prerequisites — ids in, codes out", () => {
  const catalog = () =>
    envelope([
      course("c-math", "MATH-100"),
      course("c-bio", "BIO-100"),
      course("c-chem", "CHEM-100"),
    ]);

  it("shows the resolved codes in the order the write stores them", async () => {
    // The payload names prerequisites by id; the row displays codes. The server resolves
    // them with `WHERE id = ANY(...) ORDER BY id ASC`, so c-bio precedes c-math whatever
    // order the dialog sent them in.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, catalog());
    mockUpdatePrereqs.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdatePrerequisites(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-chem",
        payload: { prerequisiteRules: [{ type: "AND", courseIds: ["c-math", "c-bio"] }], corequisites: ["LAB-1"] },
      });
    });

    await waitFor(() => expect(rows(qc)[2].prerequisites).toEqual(["BIO-100", "MATH-100"]));
    expect(rows(qc)[2].corequisites).toEqual(["LAB-1"]);
  });

  it("declines an entry that cannot name every prerequisite", async () => {
    // Writing the short list it CAN resolve would silently drop a prerequisite from a
    // save that actually succeeded.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, catalog());
    mockUpdatePrereqs.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdatePrerequisites(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-chem",
        payload: { prerequisiteRules: [{ type: "AND", courseIds: ["c-math", "c-not-cached"] }], corequisites: [] },
      });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(rows(qc)[2].prerequisites).toEqual([]);
  });
});

describe("#89 rollback — the half that usually goes untested", () => {
  it("restores the exact cache when a create fails", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100"), course("c-math", "MATH-200")]));
    const before = qc.getQueryData(listKey);
    mockCreate.mockRejectedValue(new Error("409 duplicate code"));
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(listKey)).toEqual(before);
  });

  it("puts the course BACK when a delete 403s", async () => {
    // The realistic failure: the endpoint rejects a course that is not in the caller's
    // school with a 403, and a row that stays gone reads as data loss.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100"), course("c-math", "MATH-200")]));
    mockDelete.mockRejectedValue(new Error("Course not in your school"));
    const { result } = renderHook(() => useDeleteSchoolCourse(), { wrapper });

    act(() => { result.current.mutate("c-art"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(codes(qc)).toEqual(["ART-100", "MATH-200"]);
    expect(qc.getQueryData<SchoolCoursesResponse>(listKey)!.total).toBe(2);
  });

  it("restores the previous name when an edit fails", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    mockUpdate.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate({ courseId: "c-art", payload: { name: "Renamed" } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(qc)[0].name).toBe("Course ART-100");
  });

  it("un-flips a framework toggle when the request fails", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(frameworksKey, [framework("AP", false), framework("IB", true)]);
    const before = qc.getQueryData(frameworksKey);
    mockUpdateFrameworks.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdateFrameworks(), { wrapper });

    act(() => { result.current.mutate({ frameworks: [{ type: "AP", enabled: true }] }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(frameworksKey)).toEqual(before);
  });

  it("restores the previous prerequisites when the write fails", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(
      listKey,
      envelope([course("c-math", "MATH-100"), course("c-chem", "CHEM-100", { prerequisites: ["MATH-100"] })]),
    );
    const before = qc.getQueryData(listKey);
    mockUpdatePrereqs.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useUpdatePrerequisites(), { wrapper });

    act(() => {
      result.current.mutate({
        courseId: "c-chem",
        payload: { prerequisiteRules: [{ type: "AND", courseIds: [] }], corequisites: [] },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(listKey)).toEqual(before);
  });

  it("rolls back every cached view it touched, not just the one that changed", async () => {
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    qc.setQueryData(availableKey, envelope([course("c-art", "ART-100")]));
    const beforeAdmin = qc.getQueryData(listKey);
    const beforeStudent = qc.getQueryData(availableKey);
    mockDelete.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useDeleteSchoolCourse(), { wrapper });

    act(() => { result.current.mutate("c-art"); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(listKey)).toEqual(beforeAdmin);
    expect(qc.getQueryData(availableKey)).toEqual(beforeStudent);
  });
});

describe("#89 the placeholder is replaced, and the right keys are invalidated", () => {
  it("merges the { id, code } the POST answers with instead of substituting it", async () => {
    // The endpoint echoes those two fields ONLY. Substituting would leave a row whose
    // name, department and credits are undefined until the refetch landed.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    mockCreate.mockResolvedValue({ id: "server-id", code: "BIO-150" });
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc).find((c) => c.code === "BIO-150")).toMatchObject({
      id: "server-id",
      name: "Biology",
      department: "Science",
      status: "active",
    });
  });

  it("leaves no placeholder id in the cache", async () => {
    // A leftover `optimistic-…` id means the next edit or delete of that row would be
    // sent to an id the server has never heard of.
    const { qc, wrapper } = harness();
    qc.setQueryData(listKey, envelope([course("c-art", "ART-100")]));
    mockCreate.mockResolvedValue({ id: "server-id", code: "BIO-150" });
    const { result } = renderHook(() => useCreateSchoolCourse(), { wrapper });

    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rows(qc).some((c) => c.id.startsWith("optimistic-"))).toBe(false);
  });

  it("refetches the catalog after a create", async () => {
    const { wrapper } = harness();
    mockCreate.mockResolvedValue({ id: "server-id", code: "BIO-150" });
    const { result } = renderHook(
      () => ({ list: useSchoolCourses(LIST_PARAMS), create: useCreateSchoolCourse() }),
      { wrapper },
    );

    await waitFor(() => expect(mockGetCourses).toHaveBeenCalledTimes(1));
    act(() => { result.current.create.mutate(payload); });

    await waitFor(() => expect(mockGetCourses).toHaveBeenCalledTimes(2));
  });

  it("refetches the catalog after a framework toggle — enabled frameworks fold into it", async () => {
    // The gap this closes: the API appends every ENABLED framework's courses to the
    // course list, so a toggle adds or removes catalog rows. The old hook invalidated
    // the frameworks key only, leaving the catalog showing courses of a framework the
    // user had just switched off.
    const { wrapper } = harness();
    mockUpdateFrameworks.mockResolvedValue({ success: true });
    const { result } = renderHook(
      () => ({ list: useSchoolCourses(LIST_PARAMS), frameworks: useFrameworks(), toggle: useUpdateFrameworks() }),
      { wrapper },
    );

    await waitFor(() => expect(mockGetCourses).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockGetFrameworks).toHaveBeenCalledTimes(1));
    act(() => { result.current.toggle.mutate({ frameworks: [{ type: "AP", enabled: true }] }); });

    await waitFor(() => expect(mockGetFrameworks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockGetCourses).toHaveBeenCalledTimes(2));
  });

  it("refetches the pathway graph after a delete", async () => {
    const { wrapper } = harness();
    mockDelete.mockResolvedValue(undefined);
    const { result } = renderHook(
      () => ({ pathways: useCoursePathways(), remove: useDeleteSchoolCourse() }),
      { wrapper },
    );

    await waitFor(() => expect(mockGetPathways).toHaveBeenCalledTimes(1));
    act(() => { result.current.remove.mutate("c-art"); });

    await waitFor(() => expect(mockGetPathways).toHaveBeenCalledTimes(2));
  });

  it("refetches the prerequisite chain after a prerequisite edit", async () => {
    // The chain, its depth and the eligibility checks are all server-computed from the
    // edge that just changed, and none of them is faked optimistically. The old hook
    // invalidated school-courses and pathways only, so the chain stayed stale.
    const { wrapper } = harness();
    mockUpdatePrereqs.mockResolvedValue(undefined);
    const { result } = renderHook(
      () => ({ chain: usePrerequisiteChain("c-chem"), save: useUpdatePrerequisites() }),
      { wrapper },
    );

    await waitFor(() => expect(mockGetChain).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.save.mutate({
        courseId: "c-chem",
        payload: { prerequisiteRules: [{ type: "AND", courseIds: [] }], corequisites: [] },
      });
    });

    await waitFor(() => expect(mockGetChain).toHaveBeenCalledTimes(2));
  });
});

describe("#89 the deliberate skips stay skipped", () => {
  it("does not patch the framework-course list on a customize", async () => {
    // GET /curriculum/frameworks/:type/courses is a GLOBAL catalog read: it resolves no
    // school, joins no override and returns no isCustomized. An optimistic patch here
    // would show an edit that the next fetch erases — if this test ever goes red because
    // someone converted the hook, the read has to change first.
    const { qc, wrapper } = harness();
    const fwKey = curriculumKeys.frameworkCourses("AP", { page: 1 });
    const cached = { data: [{ id: "fw-1", code: "AP-BIO", name: "AP Biology", credits: 1 }], total: 1, page: 1, limit: 10, totalPages: 1 };
    qc.setQueryData(fwKey, cached);
    mockUpdateFrameworkCourse.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateFrameworkCourse(), { wrapper });

    act(() => {
      result.current.mutate({ type: "AP", courseId: "fw-1", payload: { credits: 5, localName: "Bio (local)" } });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(qc.getQueryData(fwKey)).toEqual(cached);
  });
});
