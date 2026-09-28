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
    // The spinner reads the brand accent from the token, not a literal, so the
    // palette change in the token layer reaches it. jsdom does not resolve
    // custom properties, so the declared value is what we assert.
    expect(spinner.style.borderTopColor).toBe("var(--admin-accent-blue)");
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
