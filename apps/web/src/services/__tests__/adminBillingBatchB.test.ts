/**
 * Audit 2026-10-09 batch B, web services:
 *  B5  status → tab group (badge colour) for every status the webhook writes
 *  B7  payouts: "All" is no longer sent as status=pending; search is sent
 *  B11 export fetches every matching page, not the 10 rows on screen
 *  B12 refund posts the payments row id
 */
import { apiRequest } from "@/lib/api/apiClient";
import {
  transactionStatusGroup,
  getAllAdminTransactions,
  refundAdminPayment,
  getAdminTransactions,
} from "@/services/adminTransactionsService";
import { getAdminPayouts } from "@/services/adminPayoutService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;

afterEach(() => jest.resetAllMocks());

describe("transactionStatusGroup", () => {
  it.each([
    ["succeeded", "completed"], ["pending", "pending"], ["trialing", "pending"],
    ["refunded", "refunded"], ["partially_refunded", "refunded"],
    ["failed", "failed"], ["disputed", "failed"], ["dispute_lost", "failed"], ["expired", "failed"],
  ])("%s → %s", (status, group) => {
    expect(transactionStatusGroup(status)).toBe(group);
  });
});

describe("transactions", () => {
  it("does not send empty search/status params", async () => {
    api.mockResolvedValue({ data: { items: [], total: 0, page: 1, limit: 20 } });
    await getAdminTransactions({ page: 1 });
    expect(api.mock.calls[0][0]).not.toMatch(/search=|status=/);
  });

  it("export pages through every match (100 per page)", async () => {
    const row = (i: number) => ({ id: `p${i}`, amount: 100 }) as never;
    api
      .mockResolvedValueOnce({ data: { items: Array.from({ length: 100 }, (_, i) => row(i)), total: 150, page: 1, limit: 100 } })
      .mockResolvedValueOnce({ data: { items: Array.from({ length: 50 }, (_, i) => row(100 + i)), total: 150, page: 2, limit: 100 } });

    const res = await getAllAdminTransactions({ status: "completed", search: "ana" });

    expect(res.items).toHaveLength(150);
    expect(res.truncated).toBe(false);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[1][0]).toMatch(/page=2&limit=100.*search=ana.*status=completed/);
  });

  it("refund sends the payments row id", async () => {
    api.mockResolvedValue({ success: true, data: { refundId: "re_1" } });
    await expect(refundAdminPayment("pay-1")).resolves.toEqual({ refundId: "re_1" });
    expect(api).toHaveBeenCalledWith("/api/v1/admin/refunds", expect.objectContaining({ method: "POST", data: { paymentId: "pay-1" } }));
  });
});

describe("payouts", () => {
  it("'All' sends no status (it used to be sent as pending) and sends the search", async () => {
    api.mockResolvedValue({ data: { items: [], total: 0 } });
    await getAdminPayouts({ page: 1, search: " cora " });
    const url = api.mock.calls[0][0] as string;
    expect(url).not.toContain("status=");
    expect(url).toContain("search=cora");
  });
});
