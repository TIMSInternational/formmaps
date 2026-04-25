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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get token
const getToken = () => localStorage.getItem("token");

// Helper for headers
const getHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

// Transaction APIs
export async function getUserTransactions(params?: {
  page?: number;
  limit?: number;
}): Promise<TransactionResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/transactions?${query.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch transactions");
  const json = await response.json();
  return json.data || json;
}

export async function getTransactionById(
  transactionId: string
): Promise<Transaction> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/transactions/${transactionId}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch transaction");
  const json = await response.json();
  return json.data || json;
}
