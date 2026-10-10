/**
 * Audit F: a crash in a student dashboard page is caught inside the dashboard layout (sidebar kept),
 * translated, with Retry wired to Next's reset().
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import DashboardError from "../error";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => `t:${k}` }) }));
jest.mock("@/lib/sentry", () => ({ captureError: jest.fn() }));
const { captureError } = require("@/lib/sentry") as { captureError: jest.Mock };

describe("app/dashboard/error (student dashboard boundary)", () => {
  it("shows translated copy, reports the error, and Retry calls reset", () => {
    const reset = jest.fn();
    render(<DashboardError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("t:error.somethingWentWrong")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /t:error.tryAgain/ }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ boundary: "dashboard" }));
    expect(screen.getByRole("link", { name: "t:error.notFound.goToDashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
