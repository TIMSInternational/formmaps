import { getUserTransactions, getTransactionById } from "@/services/transactionService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

describe("transactionService", () => {
  afterEach(() => jest.resetAllMocks());

  it("maps the {transactions, pagination} envelope to {items, total, ...}", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        transactions: [
          {
            id: "p1",
            amount: 1999,
            currency: "USD",
            status: "completed",
            description: null,
            createdDate: "2026-06-01T00:00:00.000Z",
            paymentMethodId: "pm_1",
            receiptUrl: "http://r",
            bookingId: "b1",
          },
        ],
        pagination: { page: 2, limit: 10, total: 23, totalPages: 3 },
      },
    });

    const res = await getUserTransactions({ page: 2, limit: 10 });

    expect(res.total).toBe(23);
    expect(res.page).toBe(2);
    expect(res.limit).toBe(10);
    expect(res.totalPages).toBe(3);
    expect(res.items).toHaveLength(1);

    const t = res.items[0];
    expect(t.id).toBe("p1");
    expect(t.amount).toBe(1999);
    // createdDate -> date so the table's new Date(trx.date) renders
    expect(t.date).toBe("2026-06-01T00:00:00.000Z");
    // null description -> fallback so the page's trx.description.toLowerCase() never throws
    expect(t.description).toBe("Payment");
    expect(t.paymentMethodId).toBe("pm_1");
    expect(t.receiptUrl).toBe("http://r");
    expect(t.bookingId).toBe("b1");
  });

  it("getTransactionById maps createdDate to date and keeps the description", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        id: "p9",
        amount: 500,
        currency: "USD",
        status: "pending",
        description: "Coaching session",
        createdDate: "2026-05-09T12:00:00.000Z",
      },
    });

    const t = await getTransactionById("p9");

    expect(t.id).toBe("p9");
    expect(t.amount).toBe(500);
    expect(t.date).toBe("2026-05-09T12:00:00.000Z");
    expect(t.description).toBe("Coaching session");
  });
});
