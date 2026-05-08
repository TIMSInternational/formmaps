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

// Transaction APIs
export async function getUserTransactions(params?: {
  page?: number;
  limit?: number;
}): Promise<TransactionResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());

  const qs = query.toString();
  const res = await apiRequest(`/api/v1/transactions${qs ? `?${qs}` : ""}`);
  return res.data || res;
}

export async function getTransactionById(
  transactionId: string
): Promise<Transaction> {
  const res = await apiRequest(`/api/v1/transactions/${transactionId}`);
  return res.data || res;
}
