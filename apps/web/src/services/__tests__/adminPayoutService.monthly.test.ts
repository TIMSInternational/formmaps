/** Audit D3 — monthly coach payout requests and the Mark-as-paid body. */
import { apiRequest } from "@/lib/api/apiClient";
import { approveAdminPayout, generateMonthlyPayouts, getMonthlyPayouts, previousMonth } from "@/services/adminPayoutService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;

afterEach(() => jest.resetAllMocks());

it("reads and generates a month", async () => {
  api.mockResolvedValue({ success: true, data: { month: "2026-09", rows: [] } });
  expect((await getMonthlyPayouts("2026-09")).month).toBe("2026-09");
  expect(api).toHaveBeenLastCalledWith("/api/v1/admin/payouts/monthly?month=2026-09", { method: "GET" });
  await generateMonthlyPayouts("2026-09");
  expect(api).toHaveBeenLastCalledWith("/api/v1/admin/payouts/generate", { method: "POST", data: { month: "2026-09" } });
});

it("Mark as paid sends the day and a trimmed reference, and omits an empty one", async () => {
  api.mockResolvedValue({ success: true, data: {} });
  await approveAdminPayout("po-1", { paidAt: "2026-10-05", reference: "  TRF-1 " });
  expect(api).toHaveBeenLastCalledWith("/api/v1/admin/payouts/po-1/approve", { method: "POST", data: { paidAt: "2026-10-05", reference: "TRF-1" } });
  await approveAdminPayout("po-1", { paidAt: "2026-10-05", reference: "   " });
  expect(api).toHaveBeenLastCalledWith("/api/v1/admin/payouts/po-1/approve", { method: "POST", data: { paidAt: "2026-10-05" } });
  await approveAdminPayout("po-1");
  expect(api).toHaveBeenLastCalledWith("/api/v1/admin/payouts/po-1/approve", { method: "POST", data: {} });
});

it("previousMonth is the last full UTC month, across a year boundary", () => {
  expect(previousMonth(new Date("2026-10-10T12:00:00Z"))).toBe("2026-09");
  expect(previousMonth(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12");
});
