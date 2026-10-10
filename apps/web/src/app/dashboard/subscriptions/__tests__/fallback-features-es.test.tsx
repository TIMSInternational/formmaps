/**
 * Audit F: when the backend returned no plans, the fallback plan cards listed their features in English
 * for everyone. They now come from i18n and follow the UI language.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("es");
  return { useTranslation: () => ({ t: inst.getFixedT(null, "common"), i18n: inst }) };
});
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ user: { id: "u1", role: "student" } }) }));
jest.mock("@/components/StripeCheckout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/hooks/useSubscription", () => ({
  useSubscriptionStatus: () => ({ data: { hasActiveSubscription: false }, isLoading: false }),
  useSubscriptionPlans: () => ({ data: [], isLoading: false }),
  useCancelSubscription: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/services/subscriptionService", () => ({ openBillingPortal: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import SubscriptionsPage from "../page";

describe("Subscriptions page — fallback plans in Spanish", () => {
  it("lists the fallback features in the UI language", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Evaluaciones LIA y PCA")).toBeInTheDocument();
    expect(screen.getByText("Sesiones de coaching ilimitadas")).toBeInTheDocument();
    expect(screen.queryByText("PCA & MIL Assessments")).toBeNull();
  });
});
