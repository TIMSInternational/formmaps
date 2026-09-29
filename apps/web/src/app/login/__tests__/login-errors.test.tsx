/**
 * Login failures are explained from the API's code in the user's language. The page used to
 * print the server's raw English ("Invalid email or password", "Account temporarily locked…"),
 * and gave an invitee who hadn't finished setup no hint that the invitation email was the way in.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";
import { login } from "@/services/authService";
import { AuthApiError } from "@/lib/auth/authErrors";

let mockLang: "en" | "es" = "en";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: insts[mockLang].t.bind(insts[mockLang]), i18n: insts[mockLang] }),
  };
});
jest.mock("@/services/authService", () => ({ login: jest.fn() }));
const mockLogin = login as jest.Mock;

async function submit() {
  const email = document.querySelector('input[type="email"]') as HTMLInputElement;
  fireEvent.change(email, { target: { value: "greta@example.com" } });
  const pw = document.querySelector('input[type="password"]') as HTMLInputElement;
  fireEvent.change(pw, { target: { value: "Whatever123" } });
  fireEvent.submit(pw.closest("form")!);
}

beforeEach(() => { mockLang = "en"; mockLogin.mockReset(); });

it("wrong credentials: translated message plus the invitation hint", async () => {
  mockLogin.mockRejectedValue(new AuthApiError("Invalid email or password", { status: 401, code: "INVALID_CREDENTIALS" }));
  render(<LoginPage />);
  await submit();
  expect(await screen.findByText("That email and password don't match. Check them and try again.")).toBeInTheDocument();
  expect(screen.getByTestId("login-invite-hint")).toHaveTextContent("Invited recently?");
  expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
});

it("lockout: shows the minutes and no invitation hint", async () => {
  mockLogin.mockRejectedValue(new AuthApiError("Account temporarily locked. Try again in 9 minute(s)", { status: 429 }));
  render(<LoginPage />);
  await submit();
  expect(await screen.findByText(/locked for 9 minutes\./)).toBeInTheDocument();
  expect(screen.queryByTestId("login-invite-hint")).not.toBeInTheDocument();
});

it("renders the error in Spanish for a Spanish user", async () => {
  mockLang = "es";
  mockLogin.mockRejectedValue(new AuthApiError("Invalid email or password", { status: 401 }));
  render(<LoginPage />);
  await submit();
  await waitFor(() =>
    expect(screen.getByText("El correo y la contraseña no coinciden. Revísalos e inténtalo de nuevo.")).toBeInTheDocument(),
  );
});
