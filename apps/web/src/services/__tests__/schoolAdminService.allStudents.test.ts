/**
 * getAllStudents: the roster endpoint serves at most 100 students per page (both backends clamp `limit`), so screens
 * that need every student (counselor assignment, Evaluations) asked for 200 / 1000 and silently got the first 100.
 * It walks the pages instead.
 */
import { getAllStudents } from "@/services/schoolAdminService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn(), actingSchoolFetchHeaders: () => ({}) }));
const api = apiRequest as jest.MockedFunction<typeof apiRequest>;

const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${from + i}`, name: `S${from + i}`, email: `s${from + i}@x.test` }));
const page = (data: unknown[], total: number, p: number) => ({ data, total, page: p, limit: 100, totalPages: Math.ceil(total / 100) });

beforeEach(() => api.mockReset());

it("walks every page, 100 at a time", async () => {
  api
    .mockResolvedValueOnce(page(rows(0, 100), 250, 1) as never)
    .mockResolvedValueOnce(page(rows(100, 100), 250, 2) as never)
    .mockResolvedValueOnce(page(rows(200, 50), 250, 3) as never);
  const all = await getAllStudents();
  expect(all).toHaveLength(250);
  expect(all[249].id).toBe("s249");
  api.mock.calls.forEach(([url], i) => {
    expect(url).toMatch(/^\/api\/v1\/school-admin\/students\?/);
    expect(url).toMatch(new RegExp(`[?&]page=${i + 1}(&|$)`));
  });
  for (const [url] of api.mock.calls) expect(url).toContain("limit=100");
});

it("one short page = one request", async () => {
  api.mockResolvedValueOnce(page(rows(0, 7), 7, 1) as never);
  expect(await getAllStudents()).toHaveLength(7);
  expect(api).toHaveBeenCalledTimes(1);
});

it("exactly 100 students stops on totalPages, not on an extra empty request", async () => {
  api.mockResolvedValueOnce(page(rows(0, 100), 100, 1) as never);
  expect(await getAllStudents()).toHaveLength(100);
  expect(api).toHaveBeenCalledTimes(1);
});

it("passes the filters to every page", async () => {
  api.mockResolvedValueOnce(page(rows(0, 3), 3, 1) as never);
  await getAllStudents({ status: "pending", search: "ana" });
  expect(api.mock.calls[0][0]).toMatch(/status=pending/);
  expect(api.mock.calls[0][0]).toMatch(/search=ana/);
});

it("is bounded (a backend that never stops paging cannot loop forever)", async () => {
  api.mockImplementation(async () => page(rows(0, 100), 1_000_000, 1) as never);
  const all = await getAllStudents();
  expect(api).toHaveBeenCalledTimes(50);
  expect(all).toHaveLength(5000);
});

it("a failed request ends the walk with what it has (getStudents answers an empty page)", async () => {
  api.mockResolvedValueOnce(page(rows(0, 100), 150, 1) as never).mockRejectedValueOnce(new Error("boom"));
  expect(await getAllStudents()).toHaveLength(100);
});
