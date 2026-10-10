/**
 * Audit 2026-10-09 D4: the Counselors screen asked for a counselor's caseload with `limit: 1000`; both backends clamp
 * that endpoint to 50, so assigned students past the 50th showed as unassigned.
 */
import { getAllCounselorStudents, COUNSELOR_STUDENTS_PAGE_MAX } from "@/services/schoolProfileService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;

it("reads the whole caseload 50 at a time", async () => {
  const total = 120;
  api.mockImplementation((url: string) => {
    const q = new URLSearchParams(url.split("?")[1]);
    const page = Number(q.get("page")); const limit = Number(q.get("limit"));
    const start = (page - 1) * limit;
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: `s${start + i}` }));
    return Promise.resolve({ success: true, data: { data, total, page, limit, totalPages: Math.ceil(total / limit) } });
  });

  const result = await getAllCounselorStudents("coun-1");

  expect(COUNSELOR_STUDENTS_PAGE_MAX).toBe(50);
  expect(api).toHaveBeenCalledTimes(3);
  expect(api.mock.calls.every(([url]) => url.startsWith("/api/v1/school-admin/counselors/coun-1/students") && url.includes("limit=50"))).toBe(true);
  expect(result.data).toHaveLength(120);
  expect(result.total).toBe(120);
});

describe("getAllMyCounselorStudents (counselor pickers)", () => {
  it("reads the calling counselor's whole caseload 50 at a time, rows untouched", async () => {
    const { getAllMyCounselorStudents } = await import("@/services/schoolProfileService");
    api.mockReset();
    const total = 73;
    api.mockImplementation((url: string) => {
      const q = new URLSearchParams(url.split("?")[1]);
      const page = Number(q.get("page")); const limit = Number(q.get("limit"));
      const start = (page - 1) * limit;
      const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: `s${start + i}`, first_name: "x" }));
      return Promise.resolve({ success: true, data: { data, total, page, limit, totalPages: Math.ceil(total / limit) } });
    });

    const rows = await getAllMyCounselorStudents<{ id: string; first_name: string }>();

    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[0][0]).toBe("/api/v1/counselor/me/students?limit=50&page=1");
    expect(rows).toHaveLength(73);
    expect(rows[0].first_name).toBe("x");
  });
});
