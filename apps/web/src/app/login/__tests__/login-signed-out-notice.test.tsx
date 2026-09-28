/**
 * /login after a forced sign-out: <SessionTimeout /> sends ?reason=idle|expired and the page
 * explains why. And the "Remember me for 30 days" checkbox is gone — it was never wired to
 * anything, and a 30-day session would undo the 12-hour limit.
 */
import { render, screen } from "@testing-library/react";
import LoginPage from "@/app/login/page";

let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockParams,
}));
jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) =>
    k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: (k: string, d?: string) => (get(k) as string) ?? d ?? k }),
  };
});
jest.mock("@/services/authService", () => ({ login: jest.fn() }));

describe("login page", () => {
  it("explains an idle sign-out", () => {
    mockParams = new URLSearchParams("reason=idle&redirect=%2Fdashboard");
    render(<LoginPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "You were signed out after 30 minutes of inactivity.",
    );
  });

  it("explains a 12-hour expiry", () => {
    mockParams = new URLSearchParams("reason=expired");
    render(<LoginPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session reached its 12-hour limit. Please sign in again.",
    );
  });

  it("shows no notice for a normal visit or an unknown reason", () => {
    for (const q of ["", "reason=hacked"]) {
      mockParams = new URLSearchParams(q);
      const { unmount } = render(<LoginPage />);
      expect(screen.queryByRole("status")).toBeNull();
      unmount();
    }
  });

  it("has no 'Remember me' checkbox", () => {
    mockParams = new URLSearchParams();
    render(<LoginPage />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/remember me/i)).toBeNull();
  });
});
