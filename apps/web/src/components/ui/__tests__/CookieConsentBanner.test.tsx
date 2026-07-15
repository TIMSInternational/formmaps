import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/ui/CookieConsentBanner";

// Match the repo's established i18n test pattern: t(key, default) -> default.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

describe("CookieConsentBanner (single source of consent truth)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a modal dialog when no consent is stored", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("We value your privacy")).toBeInTheDocument();
  });

  it("links to the privacy page that actually exists (/privacy, not /legal/privacy)", () => {
    render(<CookieConsentBanner />);
    const link = screen.getByRole("link", { name: /privacy policy/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("Accept All stores full consent and hides the modal", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("telemetry_consent") as string);
    expect(stored.preferences).toEqual({ necessary: true, analytics: true, marketing: true });
  });

  it("Necessary Only stores analytics=false and hides the modal", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /necessary only/i }));
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("telemetry_consent") as string);
    expect(stored.preferences.analytics).toBe(false);
  });

  it("Customize reveals category toggles; Save Preferences persists the analytics choice", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /customize/i }));

    // Analytics toggle is shown and defaults on; turn it off.
    const analyticsSwitch = screen.getByRole("switch", { name: /analytics/i });
    expect(analyticsSwitch).toBeInTheDocument();
    fireEvent.click(analyticsSwitch);

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("telemetry_consent") as string);
    expect(stored.preferences).toEqual({ necessary: true, analytics: false, marketing: false });
  });

  it("does not re-show once consent is stored", () => {
    localStorage.setItem(
      "telemetry_consent",
      JSON.stringify({
        version: "1.0",
        timestamp: "2026-01-01T00:00:00.000Z",
        preferences: { necessary: true, analytics: false, marketing: false },
      }),
    );
    render(<CookieConsentBanner />);
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
  });
});
