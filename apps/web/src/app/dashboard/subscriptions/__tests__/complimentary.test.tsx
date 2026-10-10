/**
 * audit 2026-10-09 E5 (decision D6) — a student on a Super Admin complimentary grant sees
 * "Complimentary access … until <date>", not a plan to manage or cancel.
 */
import { render, screen } from "@testing-library/react";
import SubscriptionsPage from "../page";
import { useSubscriptionStatus } from "@/hooks/useSubscription";

// Key echo (the page's coach namespace is not in test-utils/realI18n); the en/es strings are checked by i18n parity.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { date?: string }) => (o?.date ? `${key}:${o.date}` : key) }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ user: { id: "stu-1" } }) }));
jest.mock("@/components/StripeCheckout", () => () => null);
jest.mock("@/services/subscriptionService", () => ({ openBillingPortal: jest.fn() }));
jest.mock("@/hooks/useSubscription", () => ({
  useSubscriptionStatus: jest.fn(),
  useSubscriptionPlans: () => ({ data: [], isLoading: false }),
  useCancelSubscription: () => ({ mutate: jest.fn(), isPending: false }),
}));

const EXPIRES = "2026-11-09T15:00:00.000Z";

it("shows the complimentary banner with its end date and no billing or cancel actions", () => {
  (useSubscriptionStatus as jest.Mock).mockReturnValue({
    isLoading: false,
    data: { hasActiveSubscription: true, hasPaidAccess: true, planId: "complimentary", status: "active",
      expiryDate: EXPIRES, isComplimentary: true, cancelAtPeriodEnd: false },
  });
  render(<SubscriptionsPage />);

  const banner = screen.getByTestId("complimentary-banner");
  expect(banner).toHaveTextContent("coach:subscriptions.active.complimentaryTitle");
  expect(banner).toHaveTextContent(`coach:subscriptions.active.complimentaryUntil:${new Date(EXPIRES).toLocaleDateString()}`);
  expect(screen.queryByText("coach:subscriptions.active.manageBilling")).not.toBeInTheDocument();
  expect(screen.queryByText("coach:subscriptions.active.cancelPlan")).not.toBeInTheDocument();
});

it("a paid plan still shows the normal active-subscription banner", () => {
  (useSubscriptionStatus as jest.Mock).mockReturnValue({
    isLoading: false,
    data: { hasActiveSubscription: true, planId: "starter", status: "active", expiryDate: EXPIRES, cancelAtPeriodEnd: false },
  });
  render(<SubscriptionsPage />);

  expect(screen.queryByTestId("complimentary-banner")).not.toBeInTheDocument();
  expect(screen.getByText("coach:subscriptions.active.manageBilling")).toBeInTheDocument();
});
