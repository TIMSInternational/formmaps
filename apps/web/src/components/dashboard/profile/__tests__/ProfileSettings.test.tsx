/**
 * ProfileSettings (profile page "settings" tab) must not duplicate the
 * wired /dashboard/settings toggles with dead local-state ones: it keeps
 * the panels that only live here (calendar integration, invite parent)
 * and points to /dashboard/settings for preferences. A fake "saved"
 * toast with no persistence is worse than no button.
 */
import { render, screen } from "@testing-library/react";
import { ProfileSettings } from "@/components/dashboard/profile/ProfileSettings";

jest.mock("@/components/shared/CalendarIntegrationPanel", () => ({
  CalendarIntegrationPanel: () => <div data-testid="calendar-panel" />,
}));
jest.mock("@/components/dashboard/profile/StudentInviteParentPanel", () => ({
  StudentInviteParentPanel: () => <div data-testid="invite-parent-panel" />,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

describe("ProfileSettings", () => {
  it("keeps the real panels (calendar integration, invite parent)", () => {
    render(<ProfileSettings />);
    expect(screen.getByTestId("calendar-panel")).toBeInTheDocument();
    expect(screen.getByTestId("invite-parent-panel")).toBeInTheDocument();
  });

  it("has no fake save button (old stub toasted 'saved' without persisting)", () => {
    render(<ProfileSettings />);
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("has no orphaned local-state toggles", () => {
    render(<ProfileSettings />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("links to the real settings page for notification/privacy preferences", () => {
    render(<ProfileSettings />);
    const link = screen.getByRole("link", { name: /settings/i });
    expect(link).toHaveAttribute("href", "/dashboard/settings");
  });
});
