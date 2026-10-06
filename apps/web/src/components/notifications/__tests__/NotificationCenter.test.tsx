import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import "@/lib/i18n";
import { NotificationCenter } from "../NotificationCenter";
import { CLOSE_POPOVERS_EVENT } from "@/components/command-palette/events";

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (sel: (s: unknown) => unknown) => sel({ user: { id: "stu-1", role: "student" } }),
}));
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useDashboardAssessmentSummary: () => ({ data: undefined }),
}));

function openPanel() {
  render(<NotificationCenter />);
  const bell = screen.getByRole("button", { name: /Notifications/ });
  fireEvent.click(bell);
  // the welcome seed is always present for a student
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  return bell;
}

describe("NotificationCenter popover (#407)", () => {
  it("closes on Escape and returns focus to the bell", async () => {
    const bell = openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
    expect(bell).toHaveFocus();
  });

  it("closes when another surface (the command palette) asks popovers to close", async () => {
    openPanel();
    fireEvent(window, new CustomEvent(CLOSE_POPOVERS_EVENT));
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
  });
});
