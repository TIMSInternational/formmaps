import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["requested", "Requested"],
    ["accepted", "Accepted"],
    ["in_progress", "In Progress"],
    ["submitted", "Submitted"],
    ["declined", "Declined"],
  ])("renders %s as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to the raw status for unknown values", () => {
    render(<StatusBadge status="weird" />);
    expect(screen.getByText("weird")).toBeInTheDocument();
  });
});
