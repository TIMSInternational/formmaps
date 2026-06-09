/**
 * 403 handling in the apiClient response interceptor:
 * - SUBSCRIPTION_REQUIRED 403s must NOT toast — AuthWrapper's /subscribe
 *   redirect is the UX; a gated dashboard mounting N queries during the
 *   bounce produced a 17-toast "Access denied" wall.
 * - Other 403s toast once with a stable id so repeats replace, not stack.
 */
import { toast } from "@/hooks/useToast";
import { apiClient } from "@/lib/api/apiClient";

jest.mock("@/hooks/useToast", () => ({
  toast: { warning: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/tokenRefreshService", () => ({
  refreshAccessToken: jest.fn(),
  isLoggedIn: jest.fn(() => true),
}));
jest.mock("@/utils/tokenUtils", () => ({ forceLogout: jest.fn() }));

type Handler = { rejected: (err: unknown) => Promise<unknown> };
const rejectedInterceptor = (
  apiClient.interceptors.response as unknown as { handlers: Handler[] }
).handlers[0].rejected;

const make403 = (data: Record<string, unknown>) => ({
  config: {},
  response: { status: 403, data },
});

describe("apiClient 403 toast behavior", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does NOT toast subscription-gate 403s (redirect to /subscribe is the UX)", async () => {
    await expect(
      rejectedInterceptor(
        make403({ success: false, message: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" })
      )
    ).rejects.toBeTruthy();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("toasts other 403s with a stable id so repeats replace instead of stacking", async () => {
    const err = make403({ success: false, message: "Not assigned" });
    await expect(rejectedInterceptor(err)).rejects.toBeTruthy();
    await expect(rejectedInterceptor(err)).rejects.toBeTruthy();
    expect(toast.warning).toHaveBeenCalledTimes(2);
    for (const call of (toast.warning as jest.Mock).mock.calls) {
      expect(call[0]).toBe("Access denied");
      expect(call[1]).toMatchObject({ id: "access-denied" });
    }
  });
});
