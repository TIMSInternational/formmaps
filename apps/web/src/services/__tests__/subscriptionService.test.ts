import { createCheckoutSession, openBillingPortal } from "@/services/subscriptionService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

describe("subscriptionService — Stripe flows", () => {
  afterEach(() => jest.resetAllMocks());

  it("createCheckoutSession unwraps the {success,data} envelope (sessionUrl reachable)", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { sessionId: "cs_test_1", sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_1" },
    });
    const res = await createCheckoutSession({
      planId: "p1", userId: "u1", amount: 2900, currency: "usd",
      productName: "Monthly", successUrl: "https://x/s", cancelUrl: "https://x/c",
    });
    expect(res.sessionUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(res.sessionId).toBe("cs_test_1");
  });

  it("openBillingPortal posts to /api/stripe/billing-portal and returns the portal url", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { url: "https://billing.stripe.com/p/session/test_123" },
    });
    const url = await openBillingPortal();
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/stripe/billing-portal",
      expect.objectContaining({ method: "POST" })
    );
    expect(url).toBe("https://billing.stripe.com/p/session/test_123");
  });

  it("dead /api/subscriptions* functions are removed from the module", async () => {
    const mod = await import("@/services/subscriptionService");
    for (const dead of ["createSubscription", "getUserSubscription", "updateSubscription", "cancelSubscription", "getUserSubscriptionHistory"]) {
      expect((mod as Record<string, unknown>)[dead]).toBeUndefined();
    }
  });
});
