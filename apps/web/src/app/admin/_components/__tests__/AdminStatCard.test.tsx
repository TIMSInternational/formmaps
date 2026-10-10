import { act, render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { AdminStatCard } from "../AdminStatCard";

// Audit D16: the count-up ran on requestAnimationFrame only, so in a tab that was not visible the
// dashboard showed "0" (and "-0%") forever instead of the real numbers.
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("AdminStatCard value", () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it("shows the real value straight away when the tab is hidden", () => {
    setVisibility("hidden");
    render(<AdminStatCard label="Total Users" value="30" icon={Users} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("keeps the sign and value of a negative percentage", () => {
    setVisibility("hidden");
    render(<AdminStatCard label="Growth" value="-66.7%" icon={Users} />);
    expect(screen.getByText("-66.7%")).toBeInTheDocument();
  });

  it("ends on the exact value even if animation frames stop", () => {
    setVisibility("visible");
    jest.useFakeTimers();
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1); // frames never fire
    render(<AdminStatCard label="Revenue" value="$1,234" icon={Users} />);
    act(() => { jest.advanceTimersByTime(1100); });
    expect(screen.getByText("$1,234")).toBeInTheDocument();
  });
});
