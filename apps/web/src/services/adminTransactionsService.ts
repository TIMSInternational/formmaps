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
  params.append("search", filters.search || "");
  params.append("status", filters.status || "");

  const response = await apiRequest(
    `/api/v1/admin/transactions?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return response.data || response;
}
