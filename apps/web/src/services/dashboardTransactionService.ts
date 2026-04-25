import { apiRequest } from "@/lib/api/apiClient";

export interface TransactionStats {
  totalSpent: number;
  currency: string;
  invoiceCount: number;
  lastPaymentMethod: {
    type: string;
    last4: string;
    expiry: string;
  } | null;
  spendingTrend: {
    percentage: number;
    direction: "up" | "down";
  };
}

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

/**
 * Get transaction statistics (total spent, invoice count, etc.)
 */
export async function getTransactionStats(): Promise<TransactionStats> {
  return apiRequest("/api/v1/transactions/stats", {
    method: "GET",
  });
}

/**
 * Export transactions as CSV or PDF
 */
export async function exportTransactions(
  format: "csv" | "pdf" = "csv",
  startDate?: string,
  endDate?: string
): Promise<Blob> {
  const params = new URLSearchParams();
  params.append("format", format);
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  const response = await fetch(
    `/api/v1/transactions/export?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    }
  );

  if (!response.ok) throw new Error("Failed to export transactions");
  return response.blob();
}

/**
 * Download exported transactions file
 */
export async function downloadTransactions(
  format: "csv" | "pdf" = "csv",
  startDate?: string,
  endDate?: string
): Promise<void> {
  const blob = await exportTransactions(format, startDate, endDate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
