/**
 * The admin Users list: an invited account used to read "active" (it is isActive from the
 * moment it is invited), and each row's "⋯" button did nothing but swallow the click.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UsersTable, type UserRecord } from "../UsersTable";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("en");
  return { initReactI18next: { type: "3rdParty", init: () => {} }, useTranslation: () => ({ t: inst.t.bind(inst), i18n: inst }) };
});

const base = { email: "x@example.com", role: "student", joinedDate: "2026-09-01T00:00:00Z" };
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000 + 3_600_000).toISOString();
const USERS: UserRecord[] = [
  { ...base, id: "a", name: "Ana Active", status: "active", inviteStatus: "active" },
  { ...base, id: "g", name: "Greta Invited", status: "active", inviteStatus: "invited", inviteExpiresAt: inDays(3) },
  { ...base, id: "e", name: "Eva Expired", status: "active", inviteStatus: "expired", inviteExpiresAt: inDays(-9) },
  { ...base, id: "i", name: "Ian Inactive", status: "inactive" },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof UsersTable>> = {}) {
  const props = {
    users: USERS, loading: false, page: 1, totalPages: 1,
    onPageChange: jest.fn(), onViewProfile: jest.fn(), onResendInvite: jest.fn(), onDeactivate: jest.fn(),
    ...overrides,
  };
  render(<UsersTable {...props} />);
  return props;
}
const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

it("tells invited and expired accounts apart from onboarded ones", () => {
  renderTable();
  expect(within(row("Ana Active")).getByTestId("user-status-badge")).toHaveTextContent("Active");
  expect(within(row("Greta Invited")).getByTestId("user-status-badge")).toHaveTextContent("Invited · expires in 3 days");
  expect(within(row("Eva Expired")).getByTestId("user-status-badge")).toHaveTextContent("Invitation expired");
  expect(within(row("Ian Inactive")).getByTestId("user-status-badge")).toHaveTextContent("Inactive");
});

function openMenu(name: string) {
  const trigger = within(row(name)).getByRole("button", { name: "Open menu" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
}

it("offers 'Resend invitation' on a pending invite and calls back with that user", () => {
  const props = renderTable();
  const menu = openMenu("Eva Expired");
  fireEvent.click(within(menu).getByRole("menuitem", { name: /Resend invitation/ }));
  expect(props.onResendInvite).toHaveBeenCalledWith(expect.objectContaining({ id: "e" }));
  expect(props.onViewProfile).not.toHaveBeenCalled(); // the menu must not also open the row
});

it("does not offer a resend for an account that finished setup", () => {
  renderTable();
  const menu = openMenu("Ana Active");
  expect(within(menu).queryByRole("menuitem", { name: /Resend invitation/ })).not.toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: /Deactivate/ })).toBeInTheDocument();
});
