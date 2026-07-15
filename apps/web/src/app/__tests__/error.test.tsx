import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import GlobalError from "../error";

jest.mock("@/lib/sentry", () => ({ captureError: jest.fn() }));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: { getState: jest.fn(() => ({ user: { role: "parent" } })) },
}));

const getState = require("@/store/useGlobalStore").useGlobalStore.getState as jest.Mock;

describe("GlobalError (route error boundary)", () => {
  beforeEach(() => {
    localStorage.clear();
    getState.mockReturnValue({ user: { role: "parent" } });
  });

  it("sends the user back to THEIR portal (parents → /parent, not /dashboard)", () => {
    render(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/parent");
  });

  it("renders Spanish copy when the persisted locale is Spanish", () => {
    localStorage.setItem("i18nextLng", "es");
    render(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();
  });

  it("falls back to /dashboard + English when role/locale are unavailable", () => {
    getState.mockReturnValue({ user: {} });
    render(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("still renders if reading the store throws (never re-throws)", () => {
    getState.mockImplementation(() => { throw new Error("store down"); });
    render(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard");
  });
});
