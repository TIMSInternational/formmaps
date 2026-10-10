/**
 * audit 2026-10-09 E5 (decision D6) — Super Admin "Grant free access" for a student or a school.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComplimentaryAccessPanel } from "../ComplimentaryAccessPanel";
import {
  grantComplimentaryAccess,
  listComplimentaryGrants,
  revokeComplimentaryAccess,
} from "@/services/complimentaryAccessService";

let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => {
      const inst = insts[mockLang];
      return { t: inst.getFixedT(null, ns ?? "common"), i18n: inst };
    },
  };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/complimentaryAccessService", () => ({
  ...jest.requireActual("@/services/complimentaryAccessService"),
  listComplimentaryGrants: jest.fn(),
  grantComplimentaryAccess: jest.fn(),
  revokeComplimentaryAccess: jest.fn(),
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  useConfirmDialog: () => ({ confirm: jest.fn().mockResolvedValue(true), ConfirmDialog: () => null }),
}));

const list = listComplimentaryGrants as jest.Mock;
const grant = grantComplimentaryAccess as jest.Mock;
const revoke = revokeComplimentaryAccess as jest.Mock;
const EXPIRES = "2026-11-09T15:00:00.000Z";
const row = { id: "g-1", targetType: "student", userId: "stu-1", schoolId: null, targetName: "Ana", targetEmail: "a@x.dev",
  startsAt: "2026-10-10T15:00:00.000Z", expiresAt: EXPIRES, note: null, grantedById: "sa-1" };

beforeEach(() => {
  mockLang = "en";
  list.mockReset(); grant.mockReset(); revoke.mockReset();
});

it("grants 30 days by default and then shows 'Complimentary until <date>'", async () => {
  list.mockResolvedValue([]);
  grant.mockResolvedValue(row);
  render(<ComplimentaryAccessPanel targetType="student" targetId="stu-1" targetName="Ana" />);

  fireEvent.click(await screen.findByRole("button", { name: "Grant free access" }));

  await waitFor(() => expect(grant).toHaveBeenCalledWith({ targetType: "student", targetId: "stu-1", days: 30, note: undefined }));
  expect(await screen.findByTestId("complimentary-badge")).toHaveTextContent(`Complimentary until ${new Date(EXPIRES).toLocaleDateString()}`);
  expect(list).toHaveBeenCalledWith("student", "stu-1");
});

it("sends the chosen days and note for a school, and refuses days outside 1–365", async () => {
  list.mockResolvedValue([]);
  grant.mockResolvedValue({ ...row, targetType: "school", userId: null, schoolId: "sch-1" });
  render(<ComplimentaryAccessPanel targetType="school" targetId="sch-1" targetName="Sch" />);

  const days = await screen.findByLabelText("Days");
  fireEvent.change(days, { target: { value: "366" } });
  expect(screen.getByText("Enter a whole number of days from 1 to 365.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Grant free access" })).toBeDisabled();

  fireEvent.change(days, { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "pilot" } });
  fireEvent.click(screen.getByRole("button", { name: "Grant free access" }));
  await waitFor(() => expect(grant).toHaveBeenCalledWith({ targetType: "school", targetId: "sch-1", days: 90, note: "pilot" }));
});

it("revokes an active grant and offers to grant again", async () => {
  list.mockResolvedValue([row]);
  revoke.mockResolvedValue(undefined);
  render(<ComplimentaryAccessPanel targetType="student" targetId="stu-1" targetName="Ana" />);

  fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

  await waitFor(() => expect(revoke).toHaveBeenCalledWith("g-1"));
  expect(await screen.findByRole("button", { name: "Grant free access" })).toBeInTheDocument();
});

it("is translated (es)", async () => {
  mockLang = "es";
  list.mockResolvedValue([row]);
  render(<ComplimentaryAccessPanel targetType="student" targetId="stu-1" targetName="Ana" />);
  expect(await screen.findByTestId("complimentary-badge")).toHaveTextContent("Cortesía hasta el");
  expect(screen.getByRole("button", { name: "Revocar" })).toBeInTheDocument();
});
