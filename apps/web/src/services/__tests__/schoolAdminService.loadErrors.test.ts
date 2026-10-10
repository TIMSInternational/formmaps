/**
 * audit 2026-10-09 F: top performers and the results list swallowed load failures and returned an empty
 * list, so a failed request read as "no performance data yet" / "no results found". They now rethrow and
 * the pages show an error with Retry.
 */
import { getTopPerformers, getStudentResults } from "@/services/schoolAdminService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn(), actingSchoolFetchHeaders: () => ({}) }));
const api = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => api.mockReset());

it("getTopPerformers rethrows a failed load instead of returning an empty list", async () => {
  api.mockRejectedValue(new Error("502"));
  await expect(getTopPerformers(10)).rejects.toThrow("502");
});

it("getStudentResults rethrows a failed load instead of returning an empty page", async () => {
  api.mockRejectedValue(new Error("502"));
  await expect(getStudentResults({ page: 1 })).rejects.toThrow("502");
});

it("still returns the data on success", async () => {
  api.mockResolvedValue({ data: [{ studentId: "s1" }] } as never);
  await expect(getTopPerformers(10)).resolves.toEqual({ data: [{ studentId: "s1" }] });
});
