/**
 * Audit 2026-10-09:
 *  A4 — apiRequest retried EVERY method twice on a 5xx/timeout. A write that timed out may already have been
 *       applied (or billed, for AI calls), so a retry duplicated it. Only reads retry by default now.
 *  A5 — a spent AI budget arrives as 429 + AI_BUDGET_EXCEEDED and must show translated copy, not "server error".
 */
import { apiClient, apiRequest } from "@/lib/api/apiClient";
import i18n from "@/lib/i18n";

jest.mock("@/services/tokenRefreshService", () => ({
  refreshAccessToken: jest.fn().mockResolvedValue(null),
  isLoggedIn: jest.requireActual("@/services/tokenRefreshService").isLoggedIn,
}));
jest.mock("@/utils/tokenUtils", () => ({ forceLogout: jest.fn() }));
jest.mock("@/hooks/useToast", () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

const failWith = (status: number, data: unknown = { success: false, message: "Internal server error" }) =>
  jest.fn((config: unknown) =>
    Promise.reject({ config, response: { status, data }, request: {}, isAxiosError: true, toJSON: () => ({}) }),
  );

let originalAdapter: unknown;
beforeEach(() => {
  originalAdapter = apiClient.defaults.adapter;
  jest.useFakeTimers();
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter as never;
  jest.useRealTimers();
});

async function settle<T>(p: Promise<T>) {
  const outcome = p.then(() => "resolved", (e: Error) => e);
  await jest.runAllTimersAsync();
  return outcome;
}

describe("A4 — only reads are retried by default", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])("%s that 5xx's is sent exactly once", async (method) => {
    const adapter = failWith(500);
    apiClient.defaults.adapter = adapter as never;

    await settle(apiRequest("/api/v1/things", { method, data: {}, showErrorToast: false }));

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("GET that 5xx's is still retried twice", async () => {
    const adapter = failWith(503);
    apiClient.defaults.adapter = adapter as never;

    await settle(apiRequest("/api/v1/things"));

    expect(adapter).toHaveBeenCalledTimes(3);
  });

  it("a write can still opt in to retries explicitly", async () => {
    const adapter = failWith(500);
    apiClient.defaults.adapter = adapter as never;

    await settle(apiRequest("/api/v1/things", { method: "PUT", data: {}, retries: 1, showErrorToast: false }));

    expect(adapter).toHaveBeenCalledTimes(2);
  });
});

describe("A5 — a spent AI budget says so, in the user's language", () => {
  it("maps AI_BUDGET_EXCEEDED to the translated message and does not retry", async () => {
    const adapter = failWith(429, { success: false, code: "AI_BUDGET_EXCEEDED", message: "server english" });
    apiClient.defaults.adapter = adapter as never;

    const err = (await settle(apiRequest("/api/v1/ai/thing", { method: "POST", data: {} }))) as Error & { status: number };

    expect(err.status).toBe(429);
    expect(err.message).toBe(i18n.t("components.apiClient.aiBudgetExceeded"));
    expect(err.message).not.toBe("components.apiClient.aiBudgetExceeded");
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
