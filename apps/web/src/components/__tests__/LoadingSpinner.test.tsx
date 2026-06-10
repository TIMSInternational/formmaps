import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "../LoadingSpinner";

// One branded loading screen everywhere: login/auth transitions used to flash
// 2-3 different designs (indigo gradient → dark "Verifying access" → skeleton).
describe("LoadingSpinner", () => {
  it("shows the FormMaps logo so every transition screen is the same brand frame", () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByAltText("FormMaps")).toBeInTheDocument();
  });

  it("uses the brand-blue spinner, not generic indigo", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".animate-spin") as HTMLElement;
    expect(spinner).not.toBeNull();
    // jsdom normalizes #065292 to rgb(6, 82, 146)
    expect(spinner.style.borderTopColor).toBe("rgb(6, 82, 146)");
  });

  it("renders as a fixed overlay when overlay is set (AuthWrapper redirect)", () => {
    render(<LoadingSpinner overlay />);
    const status = screen.getByRole("status");
    expect(status.className).toContain("fixed");
    expect(status.className).toContain("inset-0");
  });

  it("shows a custom label when provided (e.g. portal access checks)", () => {
    render(<LoadingSpinner label="Verifying access..." />);
    expect(screen.getByText("Verifying access...")).toBeInTheDocument();
  });
});
