import { refreshAccessToken } from "@/services/tokenRefreshService";

function mockFetchStatus(status: number) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ success: false }),
  }) as unknown as typeof fetch;
}

describe("refreshAccessToken — failure handling", () => {
  beforeEach(() => {
    document.cookie = "logged_in=true; path=/";
  });

  it("clears the logged_in cookie when refresh is rejected with 400 (missing/invalid refresh token)", async () => {
    mockFetchStatus(400);
    const result = await refreshAccessToken();
    expect(result).toBeNull();
    expect(document.cookie).not.toContain("logged_in=true");
  });

  it("clears the logged_in cookie on 401 (expired refresh token)", async () => {
    mockFetchStatus(401);
    const result = await refreshAccessToken();
    expect(result).toBeNull();
    expect(document.cookie).not.toContain("logged_in=true");
  });

  it("does NOT clear the session on transient 429 (rate limited)", async () => {
    mockFetchStatus(429);
    const result = await refreshAccessToken();
    expect(result).toBeNull();
    expect(document.cookie).toContain("logged_in=true");
  });

  it("does NOT clear the session on transient 5xx", async () => {
    mockFetchStatus(503);
    const result = await refreshAccessToken();
    expect(result).toBeNull();
    expect(document.cookie).toContain("logged_in=true");
  });
});
