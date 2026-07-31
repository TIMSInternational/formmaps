/**
 * Task 7 client report (Madhav): the coach-profile sidebar used to hardcode
 * "Slots available today" with zero data binding — always true, even when
 * the real booking calendar (same-day GET /:coachId/slots) had nothing open,
 * a directly contradictory claim on the same screen. This component must
 * only ever show real, fetched availability — never static unbound copy.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { AvailabilityStatus } from "@/app/dashboard/book-coach/[coachId]/_components/AvailabilityStatus";

const getCoachAvailableSlots = jest.fn();
jest.mock("@/services/coachService", () => ({
  getCoachAvailableSlots: (...args: unknown[]) => getCoachAvailableSlots(...args),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && "date" in opts ? `${key}:${opts.date}` : key,
  }),
}));

describe("AvailabilityStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does NOT claim 'slots available today' when the real slots array is empty", async () => {
    getCoachAvailableSlots.mockResolvedValue({
      date: "2026-08-03",
      timezone: "America/New_York",
      coachId: "coach-1",
      sessionDurationMinutes: 30,
      price: { amount: 50, currency: "USD" },
      slots: [],
    });

    render(<AvailabilityStatus coachId="coach-1" />);

    await waitFor(() => {
      expect(screen.queryByText("coaching.profile.slotsToday")).not.toBeInTheDocument();
    });
  });

  it("shows the real 'slots today' copy only when slots are actually returned", async () => {
    getCoachAvailableSlots.mockResolvedValue({
      date: "2026-08-03",
      timezone: "America/New_York",
      coachId: "coach-1",
      sessionDurationMinutes: 30,
      price: { amount: 50, currency: "USD" },
      slots: ["2026-08-03T13:00:00.000Z"],
    });

    render(<AvailabilityStatus coachId="coach-1" />);

    await waitFor(() => {
      expect(screen.getByText("coaching.profile.slotsToday")).toBeInTheDocument();
    });
  });

  it("shows the real next-available date (not generic 'today' copy) when today is empty but the API returns one", async () => {
    getCoachAvailableSlots.mockResolvedValue({
      date: "2026-08-03",
      timezone: "America/Costa_Rica",
      coachId: "coach-2",
      sessionDurationMinutes: 30,
      price: { amount: 60, currency: "USD" },
      slots: [],
      nextAvailableDate: "2026-08-04",
    });

    render(<AvailabilityStatus coachId="coach-2" />);

    await waitFor(() => {
      expect(screen.queryByText("coaching.profile.slotsToday")).not.toBeInTheDocument();
      expect(screen.getByText(/coaching\.profile\.nextAvailableOn:/)).toBeInTheDocument();
    });
  });

  it("falls back to a neutral 'check calendar' message when there is no data-backed next date at all", async () => {
    getCoachAvailableSlots.mockResolvedValue({
      date: "2026-08-03",
      timezone: "America/New_York",
      coachId: "coach-3",
      sessionDurationMinutes: 30,
      price: { amount: 50, currency: "USD" },
      slots: [],
    });

    render(<AvailabilityStatus coachId="coach-3" />);

    await waitFor(() => {
      expect(screen.getByText("coaching.profile.checkCalendarFallback")).toBeInTheDocument();
    });
  });

  it("never claims availability while still loading (no flash of the old hardcoded copy)", () => {
    getCoachAvailableSlots.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AvailabilityStatus coachId="coach-1" />);
    expect(screen.queryByText("coaching.profile.slotsToday")).not.toBeInTheDocument();
  });
});
