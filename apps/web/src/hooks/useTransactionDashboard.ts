import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getTransactionStats,
  downloadTransactions,
  TransactionStats,
} from "@/services/dashboardTransactionService";

/**
 * Hook to fetch transaction statistics
 */
export function useTransactionStats() {
  return useQuery<TransactionStats>({
    queryKey: ["transactionStats"],
    queryFn: getTransactionStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to export/download transactions
 */
export function useExportTransactions() {
  return useMutation({
    mutationFn: ({
      format,
      startDate,
      endDate,
    }: {
      format: "csv" | "pdf";
      startDate?: string;
      endDate?: string;
    }) => downloadTransactions(format, startDate, endDate),
  });
}
