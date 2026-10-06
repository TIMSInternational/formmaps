/**
 * Accepting an invite consumes its token, so the page must never check it again afterwards:
 * success shows "your account is ready" and goes straight to the person's own home — no flash of
 * "invitation link not valid", including if the page mounts again (Back, a remount).
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { InviteOnboarding } from "../InviteOnboarding";
import { verifyStudentToken, completeStudentOnboarding } from "@/services/studentOnboardingService";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
const mockSetUser = jest.fn();
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ setUser: mockSetUser }) }));
jest.mock("@/services/studentOnboardingService", () => ({ verifyStudentToken: jest.fn(), completeStudentOnboarding: jest.fn() }));
jest.mock("@/components/illustration/Illustration", () => ({ Illustration: () => null }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("motion/react", () => {
  const React = require("react");
  return { motion: new Proxy({}, { get: () => ({ children, initial: _i, animate: _a, transition: _t, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", rest, children) }) };
});
jest.mock("../InviteProblemPanel", () => ({ InviteProblemPanel: ({ problem }: { problem: string }) => <div>problem:{problem}</div> }));

const verify = verifyStudentToken as jest.Mock;
const complete = completeStudentOnboarding as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  verify.mockResolvedValue({ isValid: true, student: { id: "u1", name: "Ana Diaz" }, roleName: "student", schoolName: "IntroShips" });
});

async function acceptWith(role: string) {
  complete.mockResolvedValue({ success: true, token: "jwt", user: { id: "u1", name: "Ana Diaz", email: "ana@x.dev", roleName: role } });
  render(<InviteOnboarding token="tok-1" />);
  const [pw, confirm] = await screen.findAllByPlaceholderText(/Placeholder/);
  fireEvent.change(pw, { target: { value: "Passw0rd!Ok" } });
  fireEvent.change(confirm, { target: { value: "Passw0rd!Ok" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /activateAccount/ })); });
}

it("success says the account is ready and goes straight to the person's home — no link error", async () => {
  await acceptWith("student");
  expect(await screen.findByText("onboarding.student.activatedTitle")).toBeInTheDocument();
  expect(screen.queryByText(/^problem:/)).toBeNull();
  expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", isAuthenticated: true }));
  expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  expect(verify).toHaveBeenCalledTimes(1);
});

it("never re-checks the consumed token: a remount after success shows the activated state", async () => {
  await acceptWith("student");
  await screen.findByText("onboarding.student.activatedTitle");
  // The page mounts again (Back button / any remount). The server would now say INVITE_INVALID.
  verify.mockResolvedValue({ isValid: false, problem: "invalid" });
  const { unmount } = render(<InviteOnboarding token="tok-1" />);
  await waitFor(() => expect(screen.getAllByText("onboarding.student.activatedTitle").length).toBe(2));
  expect(screen.queryByText(/^problem:/)).toBeNull();
  expect(verify).toHaveBeenCalledTimes(1);
  // …and it keeps going to their home rather than sitting on a spinner.
  expect(mockReplace).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenLastCalledWith("/dashboard");
  unmount();
});

it("a counselor lands on /counselor directly (no bounce through /dashboard)", async () => {
  await acceptWith("counselor");
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/counselor"));
});

it("a failed submit keeps the form and remembers nothing", async () => {
  complete.mockRejectedValue(Object.assign(new Error("Password too weak"), { status: 400 }));
  render(<InviteOnboarding token="tok-1" />);
  const [pw, confirm] = await screen.findAllByPlaceholderText(/Placeholder/);
  fireEvent.change(pw, { target: { value: "Passw0rd!Ok" } });
  fireEvent.change(confirm, { target: { value: "Passw0rd!Ok" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /activateAccount/ })); });
  expect(screen.queryByText("onboarding.student.activatedTitle")).toBeNull();
  expect(screen.getByRole("button", { name: /activateAccount/ })).toBeInTheDocument();
  expect(window.sessionStorage.getItem("invite-accepted:tok-1")).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("a link that really is dead (never accepted here) still shows its problem state", async () => {
  verify.mockResolvedValue({ isValid: false, problem: "expired" });
  render(<InviteOnboarding token="tok-dead" />);
  expect(await screen.findByText("problem:expired")).toBeInTheDocument();
});

it("a password the server would reject (no special character) is stopped on the form, with the reason", async () => {
  render(<InviteOnboarding token="tok-1" />);
  const [pw, confirm] = await screen.findAllByPlaceholderText(/Placeholder/);
  fireEvent.change(pw, { target: { value: "Password1" } });
  fireEvent.change(confirm, { target: { value: "Password1" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /activateAccount/ })); });
  expect(await screen.findByText("auth.passwordRules.problem.special")).toBeInTheDocument();
  expect(complete).not.toHaveBeenCalled();
  // …and the checklist lists that rule up front.
  expect(screen.getByText(/auth\.passwordRules\.label\.special/)).toBeInTheDocument();
});
