/**
 * audit 2026-10-09 C18 — the apiClient's 402 redirect lands here with ?returnTo=;
 * once the student has the full platform they go back to that page (not always
 * /dashboard), and a hostile or self-referencing returnTo falls back to /dashboard.
 */
import { render, waitFor } from "@testing-library/react";
import CompletePurchasePage from "@/app/complete-purchase/page";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ logout: jest.fn() }) }));
jest.mock("@/components/independent-student/ResultsPreviewCard", () => ({ ResultsPreviewCard: () => null }));
jest.mock("@/hooks/useSubscription", () => ({
  useSubscriptionStatus: () => ({ data: { hasActiveSubscription: true, hasFullPlatform: true }, refetch: jest.fn(), isFetching: false }),
}));

beforeEach(() => mockReplace.mockClear());

it("returns to the page whose 402 sent the student here", async () => {
  window.history.pushState({}, "", "/complete-purchase?returnTo=%2Fdashboard%2Fresume%3Ftab%3D2");
  render(<CompletePurchasePage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/resume?tab=2"));
});

it.each(["//evil.example", "https%3A%2F%2Fevil.example", "%2Fcomplete-purchase"])("ignores returnTo=%s", async (rt) => {
  window.history.pushState({}, "", `/complete-purchase?returnTo=${rt}`);
  render(<CompletePurchasePage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
});

it("goes to /dashboard without a returnTo", async () => {
  window.history.pushState({}, "", "/complete-purchase");
  render(<CompletePurchasePage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
});
