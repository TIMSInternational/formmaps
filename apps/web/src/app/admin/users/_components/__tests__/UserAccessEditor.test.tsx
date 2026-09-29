/**
 * Changing a user's role or school from the admin panel. Both backend routes existed with no
 * UI, so on 2026-09-28 each change had to go through a reviewed SQL file against production.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserAccessEditor } from "../UserAccessEditor";
import { getActiveRoles, linkUserToSchool, updateUserRole } from "@/services/adminUsersService";
import { getSchools } from "@/services/schoolService";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("en");
  return { initReactI18next: { type: "3rdParty", init: () => {} }, useTranslation: () => ({ t: inst.t.bind(inst), i18n: inst }) };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/adminUsersService", () => ({
  getActiveRoles: jest.fn(),
  updateUserRole: jest.fn(),
  linkUserToSchool: jest.fn(),
}));
jest.mock("@/services/schoolService", () => ({ getSchools: jest.fn() }));

// Confirm dialog: record the question and answer "yes" (or "no" when told to).
let mockConfirmAnswer = true;
const mockConfirm = jest.fn(async () => mockConfirmAnswer);
jest.mock("@/components/ui/confirm-dialog", () => ({
  useConfirmDialog: () => ({ confirm: mockConfirm, ConfirmDialog: () => null }),
}));

// Radix Select is pointer-driven and does not run in jsdom; a native select keeps the test on
// the behaviour (which role id is sent, after what confirmation) rather than on Radix.
jest.mock("@/components/ui/select", () => {
  const React = require("react");
  const Ctx = React.createContext({ onValueChange: (_: string) => {}, value: "", disabled: false });
  return {
    Select: ({ value, onValueChange, disabled, children }: { value: string; onValueChange: (v: string) => void; disabled?: boolean; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { value, onValueChange, disabled } }, children),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "select",
        { "aria-label": "Role", value: ctx.value, disabled: ctx.disabled, onChange: (e: { target: { value: string } }) => ctx.onValueChange(e.target.value) },
        React.createElement("option", { value: "" }, "—"),
        children,
      );
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => React.createElement("option", { value }, children),
  };
});

let mockViewerRole = "Super Admin";
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (sel: (s: unknown) => unknown) => sel({ user: { role: mockViewerRole } }),
}));

const ROLES = [
  { id: "r-student", name: "student" },
  { id: "r-counselor", name: "counselor" },
  { id: "r-sa", name: "school_admin" },
  { id: "r-super", name: "Super Admin" },
];
const user = { id: "u1", name: "Greta Fernández", role: "student" };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirmAnswer = true;
  mockViewerRole = "Super Admin";
  (getActiveRoles as jest.Mock).mockResolvedValue(ROLES);
  (updateUserRole as jest.Mock).mockResolvedValue(undefined);
  (linkUserToSchool as jest.Mock).mockResolvedValue({});
  (getSchools as jest.Mock).mockResolvedValue({ data: [{ id: "s-intro", name: "IntroShips" }, { id: "s-test", name: "FormMaps" }] });
});

async function roleSelect() {
  const sel = screen.getByLabelText("Role", { selector: "select" }) as HTMLSelectElement;
  await waitFor(() => expect(sel).not.toBeDisabled());
  return sel;
}

it("changes the role by id, after a confirmation that names both roles", async () => {
  const onChanged = jest.fn();
  render(<UserAccessEditor user={user} onChanged={onChanged} />);
  fireEvent.change(await roleSelect(), { target: { value: "r-sa" } });

  await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith("u1", "r-sa"));
  expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
    description: expect.stringMatching(/Change Greta Fernández from Student to School admin\?/),
  }));
  expect(onChanged).toHaveBeenCalled();
});

it("does nothing when the admin cancels", async () => {
  mockConfirmAnswer = false;
  render(<UserAccessEditor user={user} onChanged={jest.fn()} />);
  fireEvent.change(await roleSelect(), { target: { value: "r-counselor" } });
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  expect(updateUserRole).not.toHaveBeenCalled();
});

it("only a Super Admin is offered the Super Admin role", async () => {
  const { unmount } = render(<UserAccessEditor user={user} onChanged={jest.fn()} />);
  expect(Array.from((await roleSelect()).options).map((o) => o.textContent)).toContain("Super Admin");
  unmount();

  mockViewerRole = "school_admin";
  render(<UserAccessEditor user={user} onChanged={jest.fn()} />);
  expect(Array.from((await roleSelect()).options).map((o) => o.textContent)).not.toContain("Super Admin");
});

it("moves the user to a searched school after confirming", async () => {
  const onChanged = jest.fn();
  render(<UserAccessEditor user={user} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole("button", { name: "Change school" }));
  fireEvent.change(await screen.findByPlaceholderText(/search/i), { target: { value: "intro" } });
  fireEvent.click(await screen.findByRole("button", { name: /IntroShips/ }));

  await waitFor(() => expect(linkUserToSchool).toHaveBeenCalledWith("u1", "s-intro"));
  expect(screen.queryByRole("button", { name: /^FormMaps$/ })).not.toBeInTheDocument();
  expect(onChanged).toHaveBeenCalled();
});
