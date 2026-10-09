import { apiRequest } from "@/lib/api/apiClient";

export interface AdminTransaction {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  description: string;
  paymentMethodId?: string;
  bookingId?: string;
}

export interface AdminTransactionsResponse {
  items: AdminTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminTransactionsFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

/**
 * Get all system transactions with pagination and filtering (Admin only)
 */
export async function getAdminTransactions(
  filters: AdminTransactionsFilters = {}
): Promise<AdminTransactionsResponse> {
  const params = new URLSearchParams();
  params.append("page", (filters.page || 1).toString());
  params.append("limit", (filters.limit || 20).toString());
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  if (filters.status) params.append("status", filters.status);

  const response = await apiRequest(
    `/api/v1/admin/transactions?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return response.data || response;
}

/** Status → the tab it belongs to (mirrors TRANSACTION_STATUS_GROUPS in the API's routes/admin.ts). */
export function transactionStatusGroup(status: string): "completed" | "pending" | "failed" | "refunded" {
  if (status === "succeeded" || status === "completed") return "completed";
  if (status === "pending" || status === "trialing") return "pending";
  if (status === "refunded" || status === "partially_refunded") return "refunded";
  return "failed";
}

export const EXPORT_MAX_ROWS = 5000;

/**
 * Every transaction matching the filters, for the CSV export (it used to export only the 10 rows on screen).
 * Pages of 100 (the API's cap), stopping at EXPORT_MAX_ROWS.
 */
export async function getAllAdminTransactions(
  filters: Omit<AdminTransactionsFilters, "page" | "limit"> = {}
): Promise<{ items: AdminTransaction[]; total: number; truncated: boolean }> {
  const items: AdminTransaction[] = [];
  let total = 0;
  for (let page = 1; items.length < EXPORT_MAX_ROWS; page++) {
    const res = await getAdminTransactions({ ...filters, page, limit: 100 });
    total = res.total;
    items.push(...res.items);
    if (res.items.length < 100 || items.length >= total) break;
  }
  return { items: items.slice(0, EXPORT_MAX_ROWS), total, truncated: total > EXPORT_MAX_ROWS };
}

export type RefundErrorCode = "NOT_ELIGIBLE" | "NOT_CHARGED" | "BOOKING_PAYMENT" | "NOT_FOUND" | "NO_CUSTOMER";

/** Refund a payment row under the refund policy (POST /api/v1/admin/refunds resolves it to the Stripe charge). */
export async function refundAdminPayment(paymentId: string): Promise<{ refundId: string }> {
  const response = await apiRequest(`/api/v1/admin/refunds`, { method: "POST", data: { paymentId }, showErrorToast: false });
  return response.data || response;
}
