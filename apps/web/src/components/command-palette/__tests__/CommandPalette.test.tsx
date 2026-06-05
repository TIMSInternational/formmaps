import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette/CommandPalette";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// jsdom lacks ResizeObserver/scrollIntoView, which cmdk uses
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
});

describe("CommandPalette", () => {
  it("opens on Cmd+K", () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText("Search pages, actions...")).toBeNull();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Search pages, actions...")).toBeInTheDocument();
  });

  it("opens on the global open-command-palette event (used by the top-bar search button)", () => {
    render(<CommandPalette />);
    fireEvent(window, new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
    expect(screen.getByPlaceholderText("Search pages, actions...")).toBeInTheDocument();
  });

  it("closes on Escape (the ESC hint must not be decorative)", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Search pages, actions...")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // AnimatePresence exit-animates before unmounting
    await waitForElementToBeRemoved(() => screen.queryByPlaceholderText("Search pages, actions..."));
  });
});
