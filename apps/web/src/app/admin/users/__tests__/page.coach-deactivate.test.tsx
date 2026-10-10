// Audit F4 — deactivating a coach from the admin Users page cancels and refunds their paid upcoming
// sessions on the server. The in-page confirm must say how many first, and a refund the server could not
// issue must be surfaced so the admin refunds it by hand.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/lib/i18n";
import i18n from "@/lib/i18n";
import AdminUsersPage from "../page";
import * as svc from "@/services/adminUsersService";
import { toast } from "sonner";

const confirmMock = jest.fn();
jest.mock("@/components/ui/confirm-dialog", () => ({
  useConfirmDialog: () => ({ confirm: (o: unknown) => confirmMock(o), ConfirmDialog: () => null }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("@/hooks/useAdminAccess", () => ({ useAdminAccess: () => ({ isAdmin: true, loading: false }) }));
jest.mock("@/hooks/useAdminAnalytics", () => ({ useAdminAnalytics: () => ({ data: undefined, isLoading: false }) }));
jest.mock("@/hooks/useTelemetryAnalytics", () => ({ useTelemetryAnalytics: () => ({ data: undefined, isLoading: false }) }));
const USERS = [
  { id: "cu1", name: "Ana Coach", email: "ana@x.dev", role: "coach", status: "active", joinedDate: "2026-01-01", subscriptionStatus: "none" },
  { id: "su1", name: "Sam Student", email: "sam@x.dev", role: "student", status: "active", joinedDate: "2026-01-01", subscriptionStatus: "none" },
];
jest.mock("@/hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({ data: { items: USERS, total: 2, page: 1, limit: 10 }, isLoading: false, refetch: jest.fn() }),
}));
jest.mock("../_components/UsersTable", () => ({
  UsersTable: ({ users, onDeactivate }: { users: { id: string; name: string }[]; onDeactivate: (u: unknown) => void }) => (
    <div>{users.map((u) => <button key={u.id} onClick={() => onDeactivate(u)}>deactivate {u.name}</button>)}</div>
  ),
}));
jest.mock("../_components/UserDetailDialog", () => ({ UserDetailDialog: () => null }));
jest.mock("../_components/AddUserDialog", () => ({ AddUserDialog: () => null }));
jest.mock("../_components/invite-wizard/InviteUserWizard", () => ({ InviteUserWizard: () => null }));
jest.mock("@/services/adminUsersService", () => ({
  ...jest.requireActual("@/services/adminUsersService"),
  getDeactivationImpact: jest.fn(),
  setUserActive: jest.fn(),
}));

const impact = svc.getDeactivationImpact as jest.Mock;
const setActive = svc.setUserActive as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en");
  confirmMock.mockResolvedValue(true);
  impact.mockResolvedValue({ isCoach: true, paidFutureSessions: 2 });
  setActive.mockResolvedValue({ coachBookings: { cancelled: 2, refunded: ["b1", "b2"], refundFailed: [] } });
});

it("the confirm names the coach's paid sessions that will be cancelled and refunded", async () => {
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByText("deactivate Ana Coach"));
  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  expect(impact).toHaveBeenCalledWith("cu1");
  expect(confirmMock.mock.calls[0][0].description).toContain("2 paid upcoming sessions");
  await waitFor(() => expect(setActive).toHaveBeenCalledWith("cu1", false));
  expect(toast.warning).not.toHaveBeenCalled();
});

it("a non-coach gets the plain confirm and no impact lookup", async () => {
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByText("deactivate Sam Student"));
  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  expect(impact).not.toHaveBeenCalled();
  expect(confirmMock.mock.calls[0][0].description).not.toContain("paid upcoming");
});

it("cancelling the confirm deactivates nothing", async () => {
  confirmMock.mockResolvedValue(false);
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByText("deactivate Ana Coach"));
  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  expect(setActive).not.toHaveBeenCalled();
});

it("a refund the server could not issue is shown as a warning", async () => {
  setActive.mockResolvedValue({ coachBookings: { cancelled: 2, refunded: ["b1"], refundFailed: ["b2"] } });
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByText("deactivate Ana Coach"));
  await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  expect((toast.warning as jest.Mock).mock.calls[0][0]).toContain("Refund it manually in Stripe");
});

it("in Spanish the confirm says it in Spanish", async () => {
  await i18n.changeLanguage("es");
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByText("deactivate Ana Coach"));
  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  expect(confirmMock.mock.calls[0][0].description).toContain("2 sesiones pagadas próximas");
});
