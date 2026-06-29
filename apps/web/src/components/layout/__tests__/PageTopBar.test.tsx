import { render, screen, fireEvent } from "@testing-library/react";
import { PageTopBar } from "@/components/layout/PageTopBar";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette/CommandPalette";

jest.mock("@/components/notifications/NotificationCenter", () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}));

// Provide a minimal i18next mock so t("shell.searchShortcut") resolves
// to the EN value without a full provider tree.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "shell.searchShortcut": "Search (Cmd+K)",
      };
      return map[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

describe("PageTopBar", () => {
  it("search button dispatches the open-command-palette event", () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    render(<PageTopBar />);
    // The EN locale renders the search shortcut as "Search (Cmd+K)"
    fireEvent.click(screen.getByTitle("Search (Cmd+K)"));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  });
});
