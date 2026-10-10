/**
 * audit 2026-10-09 C18 — the student paywall answers 402 { success, message, code }
 * on both backends. The apiClient:
 * - sends platform-level 402s (PAYMENT_REQUIRED / FULL_PLATFORM_REQUIRED) to
 *   /complete-purchase with a return URL — once, never from the purchase page
 *   itself or from the assessment areas that are open to every student;
 * - never navigates on PAID_RESULTS_REQUIRED (results pages render an unlock state);
 * - never retries a 402.
 */
import "@/lib/i18n";
import { toast } from "@/hooks/useToast";
import { apiClient, apiRequest, isPaymentRequiredError, paywallNavigation, purchaseRedirectFor } from "@/lib/api/apiClient";
import { safeReturnTo } from "@/lib/independentStudent";

jest.mock("@/hooks/useToast", () => ({ toast: { warning: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/tokenRefreshService", () => ({ refreshAccessToken: jest.fn(), isLoggedIn: jest.fn(() => true) }));
jest.mock("@/utils/tokenUtils", () => ({ forceLogout: jest.fn() }));

type Handler = { rejected: (err: unknown) => Promise<unknown> };
const rejectedInterceptor = (apiClient.interceptors.response as unknown as { handlers: Handler[] }).handlers[0].rejected;

const make402 = (code?: string) => ({
  config: {},
  response: { status: 402, data: { success: false, message: "Complete your purchase to access FormMaps", ...(code ? { code } : {}) } },
});

let now = 1_000_000;
let assign: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  now += 60_000; // past the redirect cooldown left by the previous test
  jest.spyOn(Date, "now").mockImplementation(() => now);
  assign = jest.spyOn(paywallNavigation, "assign").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("apiClient 402 handling", () => {
  it("redirects a platform 402 to /complete-purchase with the current page as returnTo, without a toast", async () => {
    window.history.pushState({}, "", "/dashboard/resume?tab=2");
    const err = await rejectedInterceptor(make402("PAYMENT_REQUIRED")).catch((e) => e);
    expect(assign).toHaveBeenCalledWith("/complete-purchase?returnTo=%2Fdashboard%2Fresume%3Ftab%3D2");
    expect(isPaymentRequiredError(err)).toBe(true);
    expect((err as { data: { code: string } }).data.code).toBe("PAYMENT_REQUIRED");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("navigates once when N gated queries 402 together", async () => {
    window.history.pushState({}, "", "/dashboard/courses");
    await Promise.all([1, 2, 3].map(() => rejectedInterceptor(make402("FULL_PLATFORM_REQUIRED")).catch(() => {})));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it.each(["/complete-purchase", "/subscribe", "/dashboard/assessments", "/dashboard/assessments/lia", "/evaluation/x"])(
    "does not navigate from %s (no loop; assessments are open to everyone)",
    async (path) => {
      window.history.pushState({}, "", path);
      await rejectedInterceptor(make402("PAYMENT_REQUIRED")).catch(() => {});
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("does not navigate on PAID_RESULTS_REQUIRED — the results page shows the unlock state", async () => {
    window.history.pushState({}, "", "/dashboard/assessments/personality/results");
    const err = await rejectedInterceptor(make402("PAID_RESULTS_REQUIRED")).catch((e) => e);
    expect(assign).not.toHaveBeenCalled();
    expect(isPaymentRequiredError(err)).toBe(true);
    window.history.pushState({}, "", "/dashboard");
    await rejectedInterceptor(make402("PAID_RESULTS_REQUIRED")).catch(() => {});
    expect(assign).not.toHaveBeenCalled();
  });

  it("apiRequest never retries a 402 (even a GET, which retries 5xx by default)", async () => {
    window.history.pushState({}, "", "/dashboard/assessments/lia/results");
    const request = jest.spyOn(apiClient, "request").mockRejectedValue(
      Object.assign(new Error("locked"), { status: 402, data: { code: "PAID_RESULTS_REQUIRED" } }),
    );
    await expect(apiRequest("/api/v1/lia/user/u1/results")).rejects.toMatchObject({ status: 402 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("purchaseRedirectFor / safeReturnTo", () => {
  it("builds the purchase URL and skips exempt pages", () => {
    expect(purchaseRedirectFor("/careers", "", "PAYMENT_REQUIRED")).toBe("/complete-purchase?returnTo=%2Fcareers");
    expect(purchaseRedirectFor("/careers", "", undefined)).toBe("/complete-purchase?returnTo=%2Fcareers");
    expect(purchaseRedirectFor("/complete-purchase", "?returnTo=%2Fx", "PAYMENT_REQUIRED")).toBeNull();
    expect(purchaseRedirectFor("/careers", "", "PAID_RESULTS_REQUIRED")).toBeNull();
  });

  it("accepts only same-origin app paths that are not the purchase page", () => {
    expect(safeReturnTo("/dashboard/resume?tab=2")).toBe("/dashboard/resume?tab=2");
    expect(safeReturnTo("//evil.example")).toBeNull();
    expect(safeReturnTo("/\\evil.example")).toBeNull();
    expect(safeReturnTo("https://evil.example")).toBeNull();
    expect(safeReturnTo("/complete-purchase?returnTo=%2Fx")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });
});
