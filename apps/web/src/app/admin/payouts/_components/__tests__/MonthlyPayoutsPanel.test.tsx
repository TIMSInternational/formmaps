// Audit 2026-10-09, decision D3 — manual monthly coach payouts on /admin/payouts.
// Pins: the month's rows and totals (cents → money), Generate only for an ended month and only after the in-page
// confirm, the paid row shows its day/reference and any difference, and Mark as paid sends the day and reference.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/lib/i18n";
import { MonthlyPayoutsPanel } from "../MonthlyPayoutsPanel";
import * as svc from "@/services/adminPayoutService";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/adminPayoutService", () => ({
  ...jest.requireActual("@/services/adminPayoutService"),
  getMonthlyPayouts: jest.fn(),
  generateMonthlyPayouts: jest.fn(),
  approveAdminPayout: jest.fn(),
}));

const getMonthly = svc.getMonthlyPayouts as jest.Mock;
const generate = svc.generateMonthlyPayouts as jest.Mock;
const approve = svc.approveAdminPayout as jest.Mock;

const month = (overrides: Partial<svc.MonthlyPayouts> = {}): svc.MonthlyPayouts => ({
  month: "2026-09", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z", monthEnded: true,
  rows: [
    {
      coachId: "c-ana", coachName: "Ana Coach", coachEmail: "ana@x.dev", currency: "USD", sessions: 2,
      grossCents: 10000, commissionPercent: 20, commissionCents: 2000, netCents: 8000,
      payout: { id: "po-ana", status: "pending", grossCents: 10000, commissionCents: 2000, netCents: 8000, requestedAt: "2026-10-02T00:00:00.000Z", paidAt: null, reference: null },
      differenceCents: 0,
    },
    {
      coachId: "c-ben", coachName: "Ben Coach", coachEmail: "ben@x.dev", currency: "USD", sessions: 2,
      grossCents: 1998, commissionPercent: 12.5, commissionCents: 250, netCents: 1748,
      payout: { id: "po-ben", status: "completed", grossCents: 999, commissionCents: 125, netCents: 874, requestedAt: "2026-10-02T00:00:00.000Z", paidAt: "2026-10-05T12:00:00.000Z", reference: "TRF-9" },
      differenceCents: 874,
    },
  ],
  totals: { grossCents: 11998, commissionCents: 2250, netCents: 9748, sessions: 4 },
  ...overrides,
});

function renderPanel(onChanged = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MonthlyPayoutsPanel onChanged={onChanged} /></QueryClientProvider>);
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  getMonthly.mockResolvedValue(month());
});

it("shows each coach's month in money, with the paid row's day, reference and difference, and the totals", async () => {
  renderPanel();
  const rows = await screen.findAllByTestId("monthly-payout-row");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText("$100.00")).toBeInTheDocument();
  expect(within(rows[0]).getByTestId("monthly-payout-net")).toHaveTextContent("$80.00");
  expect(within(rows[1]).getByText(/Paid .*TRF-9/)).toBeInTheDocument();
  expect(within(rows[1]).getByText("Differs from the paid amount by $8.74")).toBeInTheDocument();
  expect(screen.getByText("$97.48")).toBeInTheDocument();
  // Only the pending payout can be marked paid.
  expect(within(rows[0]).getByRole("button", { name: /Mark as paid/ })).toBeInTheDocument();
  expect(within(rows[1]).queryByRole("button", { name: /Mark as paid/ })).toBeNull();
});

it("Generate is disabled until the month has ended", async () => {
  getMonthly.mockResolvedValue(month({ monthEnded: false }));
  renderPanel();
  await screen.findAllByTestId("monthly-payout-row");
  expect(screen.getByRole("button", { name: "Generate payouts" })).toBeDisabled();
  expect(screen.getByText("You can generate payouts once the month has ended.")).toBeInTheDocument();
});

it("Generate asks first, then generates the selected month once", async () => {
  generate.mockResolvedValue({ month: "2026-09", created: 2, updated: 0, unchanged: 0, locked: 0, payouts: month() });
  const onChanged = renderPanel();
  await screen.findAllByTestId("monthly-payout-row");

  fireEvent.click(screen.getByRole("button", { name: "Generate payouts" }));
  const dialog = await screen.findByRole("dialog");
  expect(generate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Generate" }));

  await waitFor(() => expect(generate).toHaveBeenCalledWith(svc.previousMonth()));
  expect(generate).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it("changing the month loads that month", async () => {
  renderPanel();
  await screen.findAllByTestId("monthly-payout-row");
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-08" } });
  await waitFor(() => expect(getMonthly).toHaveBeenCalledWith("2026-08"));
});

it("Mark as paid sends the day and the reference", async () => {
  approve.mockResolvedValue({});
  renderPanel();
  const rows = await screen.findAllByTestId("monthly-payout-row");
  fireEvent.click(within(rows[0]).getByRole("button", { name: /Mark as paid/ }));

  const dialog = await screen.findByTestId("mark-paid-dialog");
  expect(within(dialog).getByText(/pay Ana Coach \$80\.00 yourself first/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Date paid"), { target: { value: "2026-10-05" } });
  fireEvent.change(within(dialog).getByLabelText("Reference (optional)"), { target: { value: "TRF-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark as paid" }));

  await waitFor(() => expect(approve).toHaveBeenCalledWith("po-ana", { paidAt: "2026-10-05", reference: "TRF-1" }));
});
