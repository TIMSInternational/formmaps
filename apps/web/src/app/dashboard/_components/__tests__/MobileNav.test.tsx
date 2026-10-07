/**
 * formmaps#411 — "More → New chat" left the mobile nav drawer open on top of the chat.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("../StudentSidebar", () => ({
  StudentSidebar: ({ onOpenChat }: { onOpenChat?: () => void }) => (
    <button onClick={onOpenChat}>shell.newChat</button>
  ),
}));

import { MobileNav } from "../MobileNav";

describe("MobileNav drawer", () => {
  it("closes when a chat is started from the drawer", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByText("nav.more"));
    expect(screen.getByText("shell.newChat")).toBeInTheDocument();

    fireEvent.click(screen.getByText("shell.newChat"));
    expect(screen.queryByText("shell.newChat")).not.toBeInTheDocument();
  });
});
