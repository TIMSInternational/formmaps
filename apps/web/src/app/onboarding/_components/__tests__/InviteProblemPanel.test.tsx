/**
 * The screen an invitee lands on when their link can't be used. It used to be one "Invalid
 * Invitation" state whose only button was "Back to Login" — useless to someone who has no
 * password yet. Greta hit exactly that.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteProblemPanel } from "../InviteProblemPanel";
import { AuthApiError } from "@/lib/auth/authErrors";
import { resendInvite } from "@/services/studentOnboardingService";

let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: insts[mockLang].t.bind(insts[mockLang]), i18n: insts[mockLang] }),
  };
});
jest.mock("@/services/studentOnboardingService", () => ({ resendInvite: jest.fn() }));
const mockResend = resendInvite as jest.Mock;

beforeEach(() => { mockLang = "en"; mockResend.mockReset(); });

describe("expired invitation", () => {
  it("offers a new link and confirms where it went and until when", async () => {
    mockResend.mockResolvedValue({ sentTo: "g***@gmail.com", expiresAt: "2026-10-13T00:15:00Z" });
    render(<InviteProblemPanel token="tok" problem="expired" />);
    expect(screen.getByText("This invitation has expired")).toBeInTheDocument();
    expect(screen.queryByText(/Back to Login/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
    await waitFor(() => expect(screen.getByTestId("invite-problem-sent")).toBeInTheDocument());
    expect(mockResend).toHaveBeenCalledWith("tok");
    expect(screen.getByText(/We sent a new invitation link to g\*\*\*@gmail\.com\. It works until October 1[23], 2026\./)).toBeInTheDocument();
  });

  it("explains a rate limit and stays on the expired screen", async () => {
    mockResend.mockRejectedValue(new AuthApiError("slow down", { status: 429, code: "RATE_LIMITED" }));
    render(<InviteProblemPanel token="tok" problem="expired" />);
    fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've asked for several links already");
    expect(screen.getByTestId("invite-problem-expired")).toBeInTheDocument();
  });

  it("switches to the accepted state when the resend says the invite was used", async () => {
    mockResend.mockRejectedValue(new AuthApiError("used", { status: 409, code: "INVITE_USED" }));
    render(<InviteProblemPanel token="tok" problem="expired" />);
    fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
    expect(await screen.findByTestId("invite-problem-used")).toBeInTheDocument();
  });

  it("falls back to 'ask your school' when sending fails for another reason", async () => {
    mockResend.mockRejectedValue(new AuthApiError("boom", { status: 500 }));
    render(<InviteProblemPanel token="tok" problem="expired" />);
    fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ask your school administrator to invite you again");
  });
});

describe("other states", () => {
  it("accepted: sends them to sign in, with a password-reset way out", () => {
    render(<InviteProblemPanel token="tok" problem="used" />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
  });

  it("invalid: says what to do instead of just 'invalid'", () => {
    render(<InviteProblemPanel token="tok" problem="invalid" />);
    expect(screen.getByText(/Open the most recent invitation email/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send me a new link" })).not.toBeInTheDocument();
  });

  it("renders in Spanish with no English leaking through", () => {
    mockLang = "es";
    render(<InviteProblemPanel token="tok" problem="expired" />);
    expect(screen.getByText("Esta invitación ha vencido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envíame un enlace nuevo" })).toBeInTheDocument();
    expect(screen.queryByText(/Invalid or expired token/)).not.toBeInTheDocument();
  });
});
