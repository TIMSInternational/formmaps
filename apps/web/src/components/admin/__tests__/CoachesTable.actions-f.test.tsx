/**
 * Audit F: the coach row menu had "View details" and "Deactivate" items with no onClick. Every item left in
 * the menu must do something; the dead two are gone (no coach detail page; deactivation is not an HTTP action).
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CoachesTable } from "../CoachesTable";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/coachService", () => ({
  getAllCoachesAdmin: jest.fn(async () => ({ data: { coaches: [{ id: "c1", name: "Cora Coach", email: "cora@example.test", status: "active" }] } })),
  inviteCoach: jest.fn(),
}));
// Render the Radix menu inline so its items are in the DOM without pointer-event emulation.
jest.mock("@/components/ui/dropdown-menu", () => {
  const React = jest.requireActual("react");
  const Pass = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return {
    DropdownMenu: Pass, DropdownMenuTrigger: Pass, DropdownMenuContent: Pass, DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
      React.createElement("button", { role: "menuitem", onClick, "data-has-handler": onClick ? "yes" : "no" }, children),
  };
});

describe("CoachesTable row actions (audit F)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("has no dead menu items, and Edit calls onEdit", async () => {
    const onEdit = jest.fn();
    render(<CoachesTable onEdit={onEdit} />);
    jest.advanceTimersByTime(600);
    await waitFor(() => expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.getAttribute("data-has-handler"))).not.toContain("no");
    expect(screen.queryByText("admin.coaches.actions.viewDetails")).not.toBeInTheDocument();
    expect(screen.queryByText("admin.coaches.actions.deactivate")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("admin.coaches.actions.editCoach"));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });
});
