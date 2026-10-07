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
    useTranslation: () => ({ t: (k: string, d?: unknown) => (get(k) as string) ?? (typeof d === "string" ? d : k) }),
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

  async function fillAndSubmit(dob = "2008-01-01") {
    const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
    fireEvent.change(byId("firstName"), { target: { value: "Indie" } });
    fireEvent.change(byId("lastName"), { target: { value: "Student" } });
    fireEvent.change(byId("email"), { target: { value: "indie.student@formmaps.dev" } });
    fireEvent.change(byId("dateOfBirth"), { target: { value: dob } });
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
      {
        documents: [
          { key: "terms", version: "2026-10-15" },
          { key: "privacy", version: "2026-10-15" },
        ],
        parentConfirmed: false,
      },
    );
    // The 401 from this pre-signup lookup hijacked anonymous users to /login
    expect(mockGetRole).not.toHaveBeenCalled();
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });

  it("keeps submit disabled until the Terms/Privacy box is ticked", () => {
    render(<SignupPage />);
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
    fireEvent.click(document.querySelector('[data-consent-field="termsAccepted"]') as HTMLInputElement);
    expect(submit).not.toBeDisabled();
  });

  it("requires the parent/guardian box for a 13–17 student and records parental consent", async () => {
    render(<SignupPage />);
    const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
    fireEvent.change(byId("firstName"), { target: { value: "Teen" } });
    fireEvent.change(byId("lastName"), { target: { value: "Student" } });
    fireEvent.change(byId("email"), { target: { value: "teen@formmaps.dev" } });
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 15);
    const dobStr = dob.toISOString().slice(0, 10);
    fireEvent.change(byId("dateOfBirth"), { target: { value: dobStr } });
    fireEvent.change(screen.getByPlaceholderText("Create a strong password"), { target: { value: "Test1234!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "Test1234!" } });

    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(document.querySelector('[data-consent-field="termsAccepted"]') as HTMLInputElement);
    const parentBox = document.querySelector('[data-consent-field="parentConfirmed"]') as HTMLInputElement;
    expect(parentBox).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.click(parentBox);
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp.mock.calls[0][6]).toEqual({
      documents: [
        { key: "terms", version: "2026-10-15" },
        { key: "privacy", version: "2026-10-15" },
        { key: "parental-consent", version: "2026-10-15" },
      ],
      parentConfirmed: true,
    });
  });

  // Greta: invited, so her email already had a (password-less) account, and signup answered
  // only "Unable to create account with this email" with no way forward.
  it.each([
    ["the EMAIL_UNAVAILABLE code", { status: 409, code: "EMAIL_UNAVAILABLE" }],
    ["today's legacy message", { status: 400 }],
  ])("explains an existing account or pending invite (%s)", async (_label, opts) => {
    const { AuthApiError } = jest.requireActual("@/lib/auth/authErrors");
    mockSignUp.mockRejectedValue(new AuthApiError("Unable to create account with this email", opts));
    render(<SignupPage />);
    await fillAndSubmit();

    const notice = await screen.findByTestId("signup-email-unavailable");
    expect(notice).toHaveTextContent("use the link in your invitation email");
    expect(screen.getByRole("link", { name: "Forgot your password? Reset it" })).toHaveAttribute("href", "/forgot-password");
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
