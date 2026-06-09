import { apiClient, apiRequest } from "@/lib/api/apiClient";
import { refreshAccessToken } from "@/services/tokenRefreshService";

jest.mock("@/services/tokenRefreshService", () => ({
  refreshAccessToken: jest.fn().mockResolvedValue(null),
  isLoggedIn: jest.requireActual("@/services/tokenRefreshService").isLoggedIn,
}));
jest.mock("@/utils/tokenUtils", () => ({ forceLogout: jest.fn() }));
jest.mock("@/hooks/useToast", () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

const mockRefresh = refreshAccessToken as jest.Mock;

// Simulate a 401 response at the axios adapter level
const adapter401 = (config: unknown) =>
  Promise.reject({
    config,
    response: { status: 401, data: { success: false, message: "Unauthorized" } },
    request: {},
    isAxiosError: true,
    toJSON: () => ({}),
  });

describe("apiClient 401 handling", () => {
  let originalAdapter: unknown;

  beforeAll(() => {
    originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = adapter401 as never;
  });
  afterAll(() => {
    apiClient.defaults.adapter = originalAdapter as never;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    // Start each test logged OUT
    document.cookie = "logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  });

  it("does NOT attempt token refresh for anonymous sessions (public pages must not be hijacked to /login)", async () => {
    await expect(apiRequest("/api/role/name/User")).rejects.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("attempts token refresh when the user is logged in", async () => {
    document.cookie = "logged_in=true; path=/";
    await expect(apiRequest("/api/v1/user/me")).rejects.toThrow();
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe("apiRequest retry handling", () => {
  let originalAdapter: unknown;

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter;
    jest.clearAllMocks();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter as never;
  });

  it("does not retry 429 responses by default", async () => {
    const adapter429 = jest.fn((config: unknown) =>
      Promise.reject({
        config,
        response: { status: 429, data: { success: false, message: "Too many requests" } },
        request: {},
        isAxiosError: true,
        toJSON: () => ({}),
      }),
    );
    apiClient.defaults.adapter = adapter429 as never;

    await expect(apiRequest("/api/v1/user/me")).rejects.toThrow("Too many requests");
    expect(adapter429).toHaveBeenCalledTimes(1);
  });

  it("does not force JSON content type for FormData uploads", async () => {
    const adapter = jest.fn((config: unknown) =>
      Promise.resolve({
        config,
        data: { success: true },
        headers: {},
        status: 200,
        statusText: "OK",
      }),
    );
    apiClient.defaults.adapter = adapter as never;
    const formData = new FormData();
    formData.append("file", new Blob(["resume"]), "resume.pdf");

    await apiRequest("/api/resume/upload-and-parse", {
      method: "POST",
      data: formData,
    });

    const config = adapter.mock.calls[0][0] as {
      headers: { get?: (name: string) => string | undefined; [key: string]: unknown };
    };
    const contentType = config.headers.get?.("Content-Type") ?? config.headers["Content-Type"];
    expect(contentType).not.toBe("application/json");
  });
});
