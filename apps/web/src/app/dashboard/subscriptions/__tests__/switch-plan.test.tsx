/**
 * audit 2026-10-09 C11 — "Switch plan" for a student with a live subscription
 * opens the Stripe billing portal (it used to push /subscribe, which bounces
 * anyone with a live plan straight back to /dashboard).
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "u1", role: "student" } }),
}));
jest.mock("@/components/StripeCheckout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/hooks/useSubscription", () => ({
  useSubscriptionStatus: () => ({
    data: { hasActiveSubscription: true, planId: "starter" },
    isLoading: false,
  }),
  useSubscriptionPlans: () => ({
    data: [
      { id: "starter", name: "Starter", price: 10, interval: "monthly", features: [] },
      { id: "pro", name: "Pro", price: 20, interval: "monthly", features: [] },
    ],
    isLoading: false,
  }),
  useCancelSubscription: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockOpenBillingPortal = jest.fn();
jest.mock("@/services/subscriptionService", () => ({
  openBillingPortal: () => mockOpenBillingPortal(),
}));
const mockToastError = jest.fn();
jest.mock("sonner", () => ({ toast: { error: (m: string) => mockToastError(m) } }));

import SubscriptionsPage from "../page";

describe("Subscriptions page — Switch plan (C11)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens the Stripe billing portal instead of routing to /subscribe", async () => {
    // A hash-only URL keeps jsdom from attempting a real navigation.
    mockOpenBillingPortal.mockResolvedValue("#stripe-portal");
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getByText("coach:subscriptions.plan.switchPlan"));
    await waitFor(() => expect(window.location.hash).toBe("#stripe-portal"));
    expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalledWith("/subscribe");
  });

  it("shows a translated error toast when the portal cannot be opened", async () => {
    mockOpenBillingPortal.mockRejectedValue(new Error("boom"));
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getByText("coach:subscriptions.plan.switchPlan"));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("studentUi.subscriptions.portalFailed"));
    expect(mockPush).not.toHaveBeenCalledWith("/subscribe");
  });
});
