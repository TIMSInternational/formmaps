/**
 * Audit F: app/global-error.tsx catches crashes in the root layout itself (app/error.tsx cannot).
 * It must render with no providers, in the saved language, and Retry must call Next's reset().
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import GlobalError from "../global-error";

jest.mock("@/lib/sentry", () => ({ captureError: jest.fn() }));
const { captureError } = require("@/lib/sentry") as { captureError: jest.Mock };

describe("app/global-error (root layout boundary)", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    localStorage.clear();
    captureError.mockClear();
    // <html>/<body> inside the test container triggers a DOM-nesting warning; the component is still rendered.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("renders English copy, reports the error, and Retry calls reset", () => {
    const reset = jest.fn();
    render(<GlobalError error={Object.assign(new Error("boom"), { digest: "d1" })} reset={reset} />);
    expect(screen.getByTestId("global-error")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ digest: "d1", boundary: "global" }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  });

  it("renders Spanish when the saved language is Spanish", () => {
    localStorage.setItem("i18nextLng", "es-CO");
    render(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Intentar de nuevo" })).toBeInTheDocument();
  });
});
