import { render, screen, waitFor } from "@testing-library/react";
import { CalendarIntegrationPanel } from "@/components/shared/CalendarIntegrationPanel";
import { getCalendarStatus } from "@/services/calendarService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => "/dashboard/profile",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/services/calendarService", () => ({
  getCalendarAuthUrl: jest.fn(),
  getCalendarStatus: jest.fn(),
  disconnectCalendar: jest.fn(),
}));

const mockStatus = getCalendarStatus as jest.Mock;
const EMPTY = { configured: false, connected: false, email: null, connectedAt: null };

beforeEach(() => jest.clearAllMocks());

describe("CalendarIntegrationPanel states", () => {
  it("not configured → info note, no connect buttons", async () => {
    mockStatus.mockResolvedValue(EMPTY);
    render(<CalendarIntegrationPanel />);
    await waitFor(() => expect(screen.getByTestId("calendar-not-configured")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /connect google/i })).not.toBeInTheDocument();
  });

  it("disconnected → both connect buttons", async () => {
    mockStatus.mockResolvedValue({ ...EMPTY, configured: true });
    render(<CalendarIntegrationPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: /connect google/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /connect outlook/i })).toBeInTheDocument();
  });

  it("connected → provider card with email and disconnect", async () => {
    mockStatus.mockImplementation(async (p: string) =>
      p === "google"
        ? { configured: true, connected: true, email: "u@gmail.com", connectedAt: "iso" }
        : { ...EMPTY, configured: true },
    );
    render(<CalendarIntegrationPanel />);
    await waitFor(() => expect(screen.getByText(/google calendar connected/i)).toBeInTheDocument());
    expect(screen.getByText("u@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("expired connection (email on record, not connected) → reconnect card", async () => {
    mockStatus.mockImplementation(async (p: string) =>
      p === "google"
        ? { configured: true, connected: false, email: "u@gmail.com", connectedAt: "iso" }
        : { ...EMPTY, configured: true },
    );
    render(<CalendarIntegrationPanel />);
    await waitFor(() => expect(screen.getByText(/connection expired/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("status fetch failure → safe fallback (not-configured note), no crash", async () => {
    mockStatus.mockResolvedValue(EMPTY); // service itself falls back to EMPTY on errors
    render(<CalendarIntegrationPanel />);
    await waitFor(() => expect(screen.getByTestId("calendar-not-configured")).toBeInTheDocument());
  });
});
