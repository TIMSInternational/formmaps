import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentSettingsPage from "@/app/dashboard/settings/page";
import { getUserSettings, updateUserSettings } from "@/services/userService";

jest.mock("@/contexts/AdminThemeContext", () => ({
  useAdminTheme: () => ({ mode: "light", setMode: jest.fn() }),
}));
jest.mock("@/services/userService", () => ({
  getUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));

const mockGet = getUserSettings as jest.Mock;
const mockUpdate = updateUserSettings as jest.Mock;

describe("Student settings page — real persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      emailNotifications: true,
      pushNotifications: false, // differs from page default (true) to prove load wiring
      bookingNotifications: true,
      marketingEmails: false,
      language: "en",
      profileVisible: true,
      shareProgress: true,
      allowAnalytics: true,
    });
    mockUpdate.mockResolvedValue({});
  });

  it("loads saved settings from the backend on mount", async () => {
    render(<StudentSettingsPage />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    const pushSwitch = await screen.findByRole("switch", { name: /push notifications/i });
    expect(pushSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("Save Settings persists toggles via PUT /user/settings with backend field names", async () => {
    render(<StudentSettingsPage />);
    const digest = await screen.findByRole("switch", { name: /weekly digest/i });
    fireEvent.click(digest); // false -> true
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketingEmails: true, // Weekly Digest maps to marketingEmails
        emailNotifications: true,
        bookingNotifications: true, // Session Reminders maps to bookingNotifications
        shareProgress: true,
        allowAnalytics: true,
      }),
    );
  });
});
