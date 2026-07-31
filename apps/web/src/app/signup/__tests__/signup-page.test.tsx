import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupPage from "@/app/signup/page";
import { signUp, login } from "@/services/authService";
import { getRoleByName } from "@/services/roleService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("react-i18next", () => {
  // Resolve real English copy so placeholder/text queries match what users see.
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) =>
    k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    useTranslation: () => ({ t: (k: string, d?: string) => (get(k) as string) ?? d ?? k }),
  };
});
jest.mock("@/services/authService", () => ({
  signUp: jest.fn(),
  login: jest.fn(),
}));
jest.mock("@/services/roleService", () => ({
  getRoleByName: jest.fn(),
}));

const mockSignUp = signUp as jest.Mock;
const mockLogin = login as jest.Mock;
const mockGetRole = getRoleByName as jest.Mock;

describe("Signup page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignUp.mockResolvedValue({});
    mockLogin.mockResolvedValue({ user: { id: "u1", role: { name: "student" } } });
  });

  async function fillAndSubmit() {
    const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
    fireEvent.change(byId("firstName"), { target: { value: "Indie" } });
    fireEvent.change(byId("lastName"), { target: { value: "Student" } });
    fireEvent.change(byId("email"), { target: { value: "indie.student@formmaps.dev" } });
    fireEvent.change(byId("dateOfBirth"), { target: { value: "2008-01-01" } });
    fireEvent.change(screen.getByPlaceholderText("Create a strong password"), {
      target: { value: "Test1234!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your password"), {
      target: { value: "Test1234!" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // accept terms
    fireEvent.click(document.querySelector('button[type="submit"]') as HTMLButtonElement);
  }

  it("signs up without calling any auth-required role endpoint first", async () => {
    render(<SignupPage />);
    await fillAndSubmit();

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp).toHaveBeenCalledWith(
      "Indie Student",
      "indie.student@formmaps.dev",
      "Test1234!",
      undefined,
      "2008-01-01",
      false,
    );
    // The 401 from this pre-signup lookup hijacked anonymous users to /login
    expect(mockGetRole).not.toHaveBeenCalled();
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });
});
