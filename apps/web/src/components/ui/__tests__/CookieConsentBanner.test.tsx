import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/ui/CookieConsentBanner";

describe("CookieConsentBanner (single source of consent truth)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows when no consent is stored", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByText("We value your privacy")).toBeInTheDocument();
  });

  it("links to the privacy page that actually exists (/privacy, not /legal/privacy)", () => {
    render(<CookieConsentBanner />);
    const link = screen.getByRole("link", { name: /privacy policy/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("Accept All stores telemetry consent and hides the banner", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("telemetry_consent") as string);
    expect(stored.preferences).toEqual({ necessary: true, analytics: true, marketing: true });
  });

  it("Necessary Only stores analytics=false and hides the banner", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /necessary only/i }));
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("telemetry_consent") as string);
    expect(stored.preferences.analytics).toBe(false);
  });

  it("does not re-show once consent is stored", () => {
    localStorage.setItem(
      "telemetry_consent",
      JSON.stringify({
        version: "1.0",
        timestamp: "2026-01-01T00:00:00.000Z",
        preferences: { necessary: true, analytics: false, marketing: false },
      })
    );
    render(<CookieConsentBanner />);
    expect(screen.queryByText("We value your privacy")).not.toBeInTheDocument();
  });
});
