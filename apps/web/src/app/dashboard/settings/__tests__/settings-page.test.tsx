import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentSettingsPage from "@/app/dashboard/settings/page";
import { getUserSettings, updateUserSettings, updateUserProfile } from "@/services/userService";
import { telemetry } from "@/services/telemetryService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/contexts/AdminThemeContext", () => ({
  useAdminTheme: () => ({ mode: "light", setMode: jest.fn() }),
}));
jest.mock("@/services/userService", () => ({
  getUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
  updateUserProfile: jest.fn(),
}));
jest.mock("@/services/telemetryService", () => ({ telemetry: { setAccountAnalytics: jest.fn() } }));
const mockSetUser = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

// applyLanguage (imported by settings/page.tsx) uses useGlobalStore.getState()
// and the i18n instance directly — stub both so the helper is a no-op in tests.
jest.mock("@/store/useGlobalStore", () => {
  const state = {
    language: "english",
    setLanguage: jest.fn(),
    user: { name: "Test User", email: "test@formmaps.dev", role: "student", isAuthenticated: true },
    setUser: (u: unknown) => mockSetUser(u),
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
// The page's copy resolves through t(); use the real English locale so text queries match.
jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) =>
    k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    useTranslation: () => ({
      t: (k: string, o?: { defaultValue?: string }) => (get(k) as string) ?? o?.defaultValue ?? k,
      i18n: { changeLanguage: jest.fn().mockResolvedValue(undefined), language: "en" },
    }),
  };
});

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

describe("Student settings page — privacy is opt-in (#401)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  it("an account with no saved settings shows every privacy toggle OFF", async () => {
    mockGet.mockResolvedValue(null);
    render(<StudentSettingsPage />);
    for (const name of [/profile visibility/i, /share progress/i, /usage analytics/i]) {
      expect(await screen.findByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
    }
  });

  it("saving applies the Usage Analytics choice to telemetry immediately", async () => {
    mockGet.mockResolvedValue(null);
    render(<StudentSettingsPage />);
    fireEvent.click(await screen.findByRole("switch", { name: /usage analytics/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ allowAnalytics: true, profileVisible: false, shareProgress: false })));
    await waitFor(() => expect(telemetry.setAccountAnalytics).toHaveBeenCalledWith(true));
  });
});

describe("Student settings page — editable display name (#401)", () => {
  const mockProfile = updateUserProfile as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
  });

  it("saves a trimmed name via the profile endpoint and updates the signed-in user", async () => {
    mockProfile.mockResolvedValue({ name: "Valentina Rojas" });
    render(<StudentSettingsPage />);
    const input = await screen.findByLabelText(/^name$/i);
    expect(input).toHaveValue("Test User");
    fireEvent.change(input, { target: { value: "  Valentina Rojas  " } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    await waitFor(() => expect(mockProfile).toHaveBeenCalledWith({ name: "Valentina Rojas" }));
    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith({ name: "Valentina Rojas" }));
  });

  it("does not claim success when the API ignores the name (older API strips unknown fields)", async () => {
    mockProfile.mockResolvedValue({ fullName: "Test User" });
    render(<StudentSettingsPage />);
    const input = await screen.findByLabelText(/^name$/i);
    fireEvent.change(input, { target: { value: "Valentina Rojas" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    await waitFor(() => expect(mockProfile).toHaveBeenCalled());
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("does not save an empty name", async () => {
    render(<StudentSettingsPage />);
    const input = await screen.findByLabelText(/^name$/i);
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /save name/i })).toBeDisabled();
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it("caps the name at 100 characters", async () => {
    render(<StudentSettingsPage />);
    expect(await screen.findByLabelText(/^name$/i)).toHaveAttribute("maxLength", "100");
  });
});
