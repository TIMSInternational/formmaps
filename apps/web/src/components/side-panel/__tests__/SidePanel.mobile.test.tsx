/**
 * formmaps#411 — at 500px the Ask AI side panel rendered inline at 320-600px and squeezed
 * the page into a ~60px column. Below 768px it must be a full-screen sheet.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (sel: (s: { assessmentActive: boolean }) => unknown) => sel({ assessmentActive: false }),
}));

import { SidePanelContextProvider, SidePanelRenderer, useSidePanel } from "../SidePanel";

function mockViewport(narrow: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: narrow && query.includes("max-width: 767px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
}

let open: ReturnType<typeof useSidePanel>["openPanel"];
function Opener() {
  open = useSidePanel().openPanel;
  return null;
}

function renderPanel() {
  render(
    <SidePanelContextProvider>
      <Opener />
      <SidePanelRenderer />
    </SidePanelContextProvider>,
  );
  act(() => open({ title: "Ask AI", content: <div>chat body</div> }));
}

describe("SidePanelRenderer layout", () => {
  it("renders a full-screen sheet below 768px", () => {
    mockViewport(true);
    renderPanel();
    const panel = screen.getByTestId("side-panel");
    expect(panel).toHaveAttribute("data-layout", "sheet");
    expect(panel).toHaveStyle({ position: "fixed" });
    expect(panel).toHaveAttribute("role", "dialog");
    expect(screen.getByText("chat body")).toBeInTheDocument();
  });

  it("stays an inline resizable column on desktop", () => {
    mockViewport(false);
    renderPanel();
    const panel = screen.getByTestId("side-panel");
    expect(panel).toHaveAttribute("data-layout", "inline");
    expect(panel).not.toHaveStyle({ position: "fixed" });
  });
});
