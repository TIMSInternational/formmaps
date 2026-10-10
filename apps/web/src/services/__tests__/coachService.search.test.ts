// audit 2026-10-09 C15: getCoaches must send the param names the API reads.
import { getCoaches } from "../coachService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn().mockResolvedValue({}) }));

it("sends specialty (not just specialization), search and paging", async () => {
  await getCoaches({ page: 2, limit: 12, specialization: "STEM", search: "ana" });
  const url = new URL((apiRequest as jest.Mock).mock.calls[0][0], "http://x");
  expect(url.pathname).toBe("/api/v1/coach");
  expect(url.searchParams.get("specialty")).toBe("STEM");
  expect(url.searchParams.get("search")).toBe("ana");
  expect(url.searchParams.get("page")).toBe("2");
  expect(url.searchParams.get("limit")).toBe("12");
});
