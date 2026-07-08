export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  date: string;
  description: string;
  method?: string;
  paymentMethodId?: string;
  receiptUrl?: string;
  bookingId?: string;
}

export interface TransactionResponse {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

import { apiRequest } from "@/lib/api/apiClient";

// The API returns Payment rows (createdDate, nullable description, no `method`).
// Map them to the Transaction shape the UI renders. Stripe writes status
// "succeeded" — the UI's tabs/badges/totals all speak "completed", so without
// this normalization no real payment ever matched a "completed" filter.
function normalizeStatus(status: string): Transaction["status"] {
  if (status === "succeeded" || status === "completed") return "completed";
  if (status === "failed" || status === "refunded") return status;
  return "pending";
}

function mapTransaction(p: any): Transaction {
  return {
    id: p.id,
    amount: Number(p.amount ?? 0),
    currency: p.currency ?? "USD",
    status: normalizeStatus(p.status ?? ""),
    date: p.date ?? p.createdDate,
    description: p.description ?? "Payment",
    method: p.method ?? undefined,
    paymentMethodId: p.paymentMethodId,
    receiptUrl: p.receiptUrl,
    bookingId: p.bookingId,
  };
}

// Transaction APIs
export async function getUserTransactions(params?: {
  page?: number;
  limit?: number;
}): Promise<TransactionResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());

  const qs = query.toString();
  const res = await apiRequest(`/api/v1/user/transactions${qs ? `?${qs}` : ""}`);
  const data = res?.data ?? res ?? {};
  const rows: any[] = data.transactions ?? data.items ?? [];
  const pagination = data.pagination ?? {};

  return {
    items: rows.map(mapTransaction),
    total: pagination.total ?? data.total ?? rows.length,
    page: pagination.page ?? params?.page ?? 1,
    limit: pagination.limit ?? params?.limit ?? rows.length,
    totalPages: pagination.totalPages ?? 1,
  };
}

export interface TransactionStats {
  totalSpent: number;
  monthlySpent: number;
  totalTransactions: number;
}

/** Whole-history spend stats (succeeded payments only) — the paginated list
 *  must never be used to derive totals, it only holds the current page. */
export async function getTransactionStats(): Promise<TransactionStats> {
  const res = await apiRequest(`/api/v1/user/transactions/stats`);
  const data = res?.data ?? res ?? {};
  return {
    totalSpent: Number(data.totalSpent ?? 0),
    monthlySpent: Number(data.monthlySpent ?? 0),
    totalTransactions: Number(data.totalTransactions ?? 0),
  };
}

export async function getTransactionById(
  transactionId: string
): Promise<Transaction> {
  const res = await apiRequest(`/api/v1/user/transactions/${transactionId}`);
  return mapTransaction(res?.data ?? res ?? {});
}
