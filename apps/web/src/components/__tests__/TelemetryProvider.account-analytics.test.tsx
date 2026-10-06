import { render, waitFor } from "@testing-library/react";
import { TelemetryProvider } from "@/components/TelemetryProvider";
import { telemetry } from "@/services/telemetryService";
import { getUserSettings } from "@/services/userService";

jest.mock("@/components/ui/CookieConsentBanner", () => ({ CookieConsentBanner: () => null }));
jest.mock("@/components/auth/SessionTimeoutModal", () => ({ SessionTimeoutModal: () => null }));
jest.mock("@/hooks/useWebVitals", () => ({ useWebVitals: jest.fn() }));
jest.mock("@/hooks/useConsent", () => ({
  useConsent: () => ({ hasAnalytics: true, isLoading: false }),
  hasAnalyticsConsent: () => true,
}));
jest.mock("@/services/telemetryService", () => ({
  telemetry: { init: jest.fn(), stop: jest.fn(), clearQueue: jest.fn(), setAccountAnalytics: jest.fn() },
}));
jest.mock("@/services/userService", () => ({ getUserSettings: jest.fn() }));

const storeUser = { id: "u-1" as string | null, isAuthenticated: true };
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (selector: (s: { user: typeof storeUser }) => unknown) => selector({ user: storeUser }),
}));

const mockSettings = getUserSettings as jest.Mock;
const setAccountAnalytics = telemetry.setAccountAnalytics as jest.Mock;

describe("TelemetryProvider — account Usage Analytics opt-in (#401)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeUser.id = "u-1";
    storeUser.isAuthenticated = true;
  });

  it("enables collection only when the account's saved setting opts in", async () => {
    mockSettings.mockResolvedValue({ allowAnalytics: true });
    render(<TelemetryProvider><div /></TelemetryProvider>);
    await waitFor(() => expect(setAccountAnalytics).toHaveBeenLastCalledWith(true));
  });

  it("keeps collection off for an account with no saved settings row", async () => {
    mockSettings.mockResolvedValue(null);
    render(<TelemetryProvider><div /></TelemetryProvider>);
    await waitFor(() => expect(mockSettings).toHaveBeenCalled());
    expect(setAccountAnalytics).not.toHaveBeenCalledWith(true);
    expect(setAccountAnalytics).toHaveBeenCalledWith(false);
  });

  it("keeps collection off when the settings request fails", async () => {
    mockSettings.mockRejectedValue(new Error("network"));
    render(<TelemetryProvider><div /></TelemetryProvider>);
    await waitFor(() => expect(mockSettings).toHaveBeenCalled());
    expect(setAccountAnalytics).not.toHaveBeenCalledWith(true);
  });

  it("does not fetch settings and stays off when signed out", () => {
    storeUser.isAuthenticated = false;
    storeUser.id = null;
    render(<TelemetryProvider><div /></TelemetryProvider>);
    expect(mockSettings).not.toHaveBeenCalled();
    expect(setAccountAnalytics).toHaveBeenCalledWith(false);
  });
});
