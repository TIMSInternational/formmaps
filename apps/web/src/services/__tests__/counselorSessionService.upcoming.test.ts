/**
 * Audit D15: the counselor dashboard asks for sessions still to come (?upcoming=true), not the
 * latest-dated confirmed ones.
 */
import { getMyCounselorSessions } from "../counselorSessionService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApi = apiRequest as jest.Mock;

beforeEach(() => mockApi.mockReset().mockResolvedValue({ data: { data: [], total: 0 } }));

describe("getMyCounselorSessions", () => {
  it("sends upcoming=true when asked", async () => {
    await getMyCounselorSessions({ upcoming: true, limit: 3 });
    const url = new URL(mockApi.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/v1/counselor/me/sessions");
    expect(url.searchParams.get("upcoming")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("status")).toBeNull();
  });

  it("leaves it off by default", async () => {
    await getMyCounselorSessions({ limit: 100 });
    expect(new URL(mockApi.mock.calls[0][0], "http://x").searchParams.get("upcoming")).toBeNull();
  });
});
