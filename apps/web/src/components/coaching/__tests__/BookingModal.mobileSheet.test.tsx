/**
 * #396 — on phones the booking dialog must be a scrollable full-height sheet
 * with a reachable close button.
 * #404 — the title comes from the real duration, and slots render in the
 * STUDENT's timezone with the coach's wall-clock as a hint.
 *
 * The suite runs under America/New_York (forced by jest.global-setup.js), so
 * the "student" here is in New York and the coach is in Chicago.
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BookingModal } from "@/components/coaching/BookingModal";
import { Coach } from "@/types/coach";

const getCoachAvailableSlots = jest.fn();
const rescheduleSession = jest.fn();
jest.mock("@/services/coachService", () => ({
  getCoachAvailableSlots: (...args: unknown[]) => getCoachAvailableSlots(...args),
  bookSession: jest.fn(),
  rescheduleSession: (...args: unknown[]) => rescheduleSession(...args),
}));
jest.mock("@/services/paymentService", () => ({ redirectToStripeCheckout: jest.fn() }));
jest.mock("@/services/telemetryService", () => ({ telemetry: { trackSession: jest.fn() } }));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "student-1" } }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.values(opts).join(",")})`
        : key,
  }),
}));
jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), loading: jest.fn() },
}));

const coach: Coach = { id: "coach-1", name: "Test Coach" };

// 14:00Z = 10:00am New York (EDT) = 09:00am Chicago (CDT)
const SLOT = "2026-10-07T14:00:00.000Z";

function mockSlots(overrides: Record<string, unknown> = {}) {
  (getCoachAvailableSlots as jest.Mock).mockResolvedValue({
    date: "2026-10-07",
    timezone: "America/New_York",
    coachTimezone: "America/Chicago",
    coachId: "coach-1",
    sessionDurationMinutes: 30,
    price: { amount: 85, currency: "USD" },
    slots: [SLOT, "2026-10-07T14:30:00.000Z"],
    ...overrides,
  });
}

describe("BookingModal — mobile sheet (#396)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSlots();
  });

  it("the dialog content is a height-capped, vertically scrollable container", async () => {
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toMatch(/max-h-\[100dvh\]/);
    expect(dialog.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    // The old `overflow-hidden` on the y axis is exactly what made it unscrollable.
    expect(dialog.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/);
  });

  it("renders a close button inside a sticky header, and it calls onClose", async () => {
    const onClose = jest.fn();
    render(<BookingModal coach={coach} isOpen onClose={onClose} />);
    const header = await screen.findByTestId("booking-sheet-header");
    expect(header.className).toMatch(/sticky/);
    expect(header.className).toMatch(/top-0/);
    const close = header.querySelector("button");
    expect(close).not.toBeNull();
    expect(close).toHaveAccessibleName("common.close");
    fireEvent.click(close!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("BookingModal — duration label + student timezone (#404)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("titles a 30-minute session from its real duration, never '1 Hour Session'", async () => {
    mockSlots();
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getAllByText("booking.sessionMinutes(30)").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("1 Hour Session")).not.toBeInTheDocument();
  });

  it("renders slots in the student's zone with the coach's wall-clock as a hint", async () => {
    mockSlots();
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    expect(await screen.findByRole("button", { name: /10:00am/ })).toBeInTheDocument();
    expect(screen.getByText("booking.coachTimeHint(09:00am)")).toBeInTheDocument();
    expect(screen.getByText("booking.timesShownIn(America/New_York)")).toBeInTheDocument();
    expect(screen.getByText("booking.coachTimezone(America/Chicago)")).toBeInTheDocument();
  });

  it("asks the API for slots in the student's zone", async () => {
    mockSlots();
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(getCoachAvailableSlots).toHaveBeenCalled());
    expect((getCoachAvailableSlots as jest.Mock).mock.calls[0][2]).toBe("America/New_York");
  });

  it("omits the coach hint when coach and student share a zone", async () => {
    mockSlots({ coachTimezone: "America/New_York" });
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    await screen.findByRole("button", { name: /10:00am/ });
    expect(screen.queryByText(/booking\.coachTimeHint/)).not.toBeInTheDocument();
  });

  it("degrades gracefully when the API does not return coachTimezone (older nexa-api)", async () => {
    mockSlots({ coachTimezone: undefined });
    render(<BookingModal coach={coach} isOpen onClose={jest.fn()} />);
    expect(await screen.findByRole("button", { name: /10:00am/ })).toBeInTheDocument();
    expect(screen.queryByText(/booking\.coachTimeHint/)).not.toBeInTheDocument();
    expect(screen.queryByText(/booking\.coachTimezone/)).not.toBeInTheDocument();
  });

  it("submits the API's exact UTC instant — the payload is unchanged by the display zone", async () => {
    mockSlots();
    rescheduleSession.mockResolvedValue({ id: "b-2" });
    render(
      <BookingModal
        coach={coach}
        isOpen
        onClose={jest.fn()}
        mode="reschedule"
        bookingId="b-1"
        initialTopic="career"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /10:00am/ }));
    fireEvent.click(await screen.findByRole("button", { name: "booking.rescheduleSession" }));
    await waitFor(() => expect(rescheduleSession).toHaveBeenCalled());
    expect(rescheduleSession).toHaveBeenCalledWith("b-1", {
      start: SLOT,
      end: "2026-10-07T14:30:00.000Z",
    });
  });
});
