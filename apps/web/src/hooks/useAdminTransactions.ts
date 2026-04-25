import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getAdminTransactions,
  AdminTransactionsResponse,
  AdminTransactionsFilters,
} from "@/services/adminTransactionsService";

/**
 * Hook to fetch admin transactions list with pagination and filtering
 */
export function useAdminTransactions(filters: AdminTransactionsFilters = {}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  return useQuery<AdminTransactionsResponse>({
    queryKey: ["adminTransactions", { page, limit, ...filters }],
    queryFn: () => getAdminTransactions(filters),
    placeholderData: keepPreviousData,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
