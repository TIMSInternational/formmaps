import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentSettingsPage from "@/app/dashboard/settings/page";
import { getUserSettings, updateUserSettings } from "@/services/userService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/contexts/AdminThemeContext", () => ({
  useAdminTheme: () => ({ mode: "light", setMode: jest.fn() }),
}));
jest.mock("@/services/userService", () => ({
  getUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

// applyLanguage (imported by settings/page.tsx) uses useGlobalStore.getState()
// and the i18n instance directly — stub both so the helper is a no-op in tests.
jest.mock("@/store/useGlobalStore", () => {
  const state = {
    language: "english",
    setLanguage: jest.fn(),
    user: { name: "Test User", email: "test@formmaps.dev", role: "student", isAuthenticated: true },
  };
  // The page calls useGlobalStore with different selectors (user, setLanguage, etc.)
  // so we return the full store state and let each selector extract what it needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { useGlobalStore: hook };
});
jest.mock("@/lib/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn().mockResolvedValue(undefined), language: "en" },
}));
// useSetLanguage (used by the language picker onChange) also needs react-i18next.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: jest.fn().mockResolvedValue(undefined), language: "en" },
  }),
}));

const mockGet = getUserSettings as jest.Mock;
const mockUpdate = updateUserSettings as jest.Mock;
const mockApiRequest = apiRequest as jest.Mock;

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

  it("hydration on mount does NOT PUT to the backend (no redundant write)", async () => {
    render(<StudentSettingsPage />);
    // Wait for settings to load and hydration to complete.
    await screen.findByRole("switch", { name: /push notifications/i });
    // applyLanguage (not useSetLanguage) was called — no PUT should have fired.
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      "/api/v1/user/settings",
      expect.objectContaining({ method: "PUT" })
    );
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

  it("students can change their password from settings", async () => {
    mockApiRequest.mockResolvedValue({ success: true });
    render(<StudentSettingsPage />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "Test1234!" },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "NewTest5678!" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "NewTest5678!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/authapi/change-password",
      expect.objectContaining({
        method: "PUT",
        data: expect.objectContaining({
          password: "NewTest5678!",
          oldPassword: "Test1234!",
        }),
      }),
    );
  });

  it("rejects mismatched password confirmation without calling the API", async () => {
    render(<StudentSettingsPage />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "Test1234!" },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "NewTest5678!" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "Different999!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
