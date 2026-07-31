/**
 * Regression test for the "Jump to <date>" button in the empty-slots state.
 *
 * `slotsData.nextAvailableDate` is a "YYYY-MM-DD" string. Before this fix,
 * BookingModal parsed it with `new Date(slotsData.nextAvailableDate)`, which
 * parses as UTC midnight and renders as the PREVIOUS calendar day in any
 * timezone behind UTC (all of North/South/Central America). This suite runs
 * under exactly such a timezone (America/New_York, forced process-wide by
 * jest.global-setup.js — a per-file `process.env.TZ = ...` in beforeAll() is
 * a no-op, see that file for why) and proves the button shows the real
 * next-available date, not one day earlier.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { BookingModal } from "@/components/coaching/BookingModal";
import { Coach } from "@/types/coach";

const getCoachAvailableSlots = jest.fn();
jest.mock("@/services/coachService", () => ({
  getCoachAvailableSlots: (...args: unknown[]) => getCoachAvailableSlots(...args),
  bookSession: jest.fn(),
  rescheduleSession: jest.fn(),
}));
jest.mock("@/services/paymentService", () => ({
  redirectToStripeCheckout: jest.fn(),
}));
jest.mock("@/services/telemetryService", () => ({
  telemetry: { trackSession: jest.fn() },
}));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "student-1" } }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), loading: jest.fn() },
}));

const mockGetSlots = getCoachAvailableSlots as jest.Mock;

const coach: Coach = {
  id: "coach-1",
  name: "Test Coach",
};

describe("BookingModal — nextAvailableDate 'Jump to' button (UTC-midnight parsing bug)", () => {
  // Runs under a forced negative-UTC-offset zone (America/New_York) — see
  // jest.global-setup.js — the exact class of environment where the bug
  // manifests (all of North/South/Central America).

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the real next-available date (Aug 3), not one day earlier (Aug 2)", async () => {
    mockGetSlots.mockResolvedValue({
      date: "2026-07-27",
      timezone: "America/New_York",
      coachId: "coach-1",
      sessionDurationMinutes: 30,
      price: { amount: 85, currency: "USD" },
      slots: [],
      nextAvailableDate: "2026-08-03",
    });

    render(
      <BookingModal coach={coach} isOpen={true} onClose={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Jump to Aug 3/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Jump to Aug 2/i })).not.toBeInTheDocument();
  });
});
