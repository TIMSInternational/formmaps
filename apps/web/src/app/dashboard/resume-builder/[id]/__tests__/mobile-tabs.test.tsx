/**
 * tafurfede/formmaps-platform#406 — on a phone the preview was ~200 px tall and
 * the AI editor's input sat below the fold. Below lg the page shows Preview /
 * AI editor as tabs, each getting the full height.
 */
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useParams: () => ({ id: "r1" }) }));
jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: { div: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});
jest.mock("@/services/resumeService", () => ({
  getResumeById: () => new Promise(() => {}),
}));
jest.mock("../../_components/ResumePreviewPanel", () => ({
  ResumePreviewPanel: () => <div>preview-panel</div>,
}));
jest.mock("../../_components/AIChatEditor", () => ({
  AIChatEditor: () => <div>chat-editor</div>,
}));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({
    resumeBuilder: {
      data: { personalInfo: { fullName: "" }, template: "classic", careerField: "", experience: [], education: [], skills: [], dynamicSections: [] },
    },
    populateWithDummyContent: jest.fn(),
    setResumeTemplate: jest.fn(),
    resetResumeBuilder: jest.fn(),
    setCurrentResumeId: jest.fn(),
    loadResume: jest.fn(),
    currentResumeId: "r1",
  }),
}));

import ResumeBuilderPage from "../page";

function pane(text: string) {
  return screen.getByText(text).closest("[data-pane]") as HTMLElement;
}

describe("resume editor mobile tabs", () => {
  it("shows the preview first and hides the editor below lg", () => {
    render(<ResumeBuilderPage />);
    expect(pane("preview-panel").className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(pane("chat-editor").className).toMatch(/(^|\s)hidden(\s|$)/);
    // both always visible on desktop
    expect(pane("chat-editor").className).toMatch(/lg:flex/);
  });

  it("switches to the AI editor tab", () => {
    render(<ResumeBuilderPage />);
    fireEvent.click(screen.getByRole("tab", { name: "AI editor" }));
    expect(pane("chat-editor").className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(pane("preview-panel").className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByRole("tab", { name: "AI editor" })).toHaveAttribute("aria-selected", "true");
  });
});
