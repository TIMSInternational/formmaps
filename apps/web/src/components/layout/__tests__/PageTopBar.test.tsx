import { render, screen, fireEvent } from "@testing-library/react";
import { PageTopBar } from "@/components/layout/PageTopBar";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette/CommandPalette";

jest.mock("@/components/notifications/NotificationCenter", () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}));

describe("PageTopBar", () => {
  it("search button dispatches the open-command-palette event", () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    render(<PageTopBar />);
    fireEvent.click(screen.getByTitle("Search (Cmd+K)"));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  });
});
