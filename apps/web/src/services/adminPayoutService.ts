import { apiRequest } from "@/lib/api/apiClient";
import { Payout, PayoutStatus } from "@/types/coach";

export interface AdminPayout extends Payout {
  payoutId?: string; // Some endpoints return payoutId instead of id
  coachId: string;
  coachName: string;
  coachEmail?: string;
}

export interface AdminPayoutListResponse {
  items: AdminPayout[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface AdminPayoutFilters {
  status?: PayoutStatus;
  page?: number;
  limit?: number;
  coachId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CommissionStatsResponse {
  totalCommission: number;
  totalPayouts: number;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  byPeriod?: Array<{
    period: string;
    commission: number;
    payoutCount: number;
  }>;
}

const buildQuery = (filters: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.append(key, String(value));
  });
  return query.toString();
};

export async function getAdminPayouts(
  filters: AdminPayoutFilters = {}
): Promise<AdminPayoutListResponse> {
  const query = buildQuery({
    status: filters.status ?? "pending",
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
  });

  const response = await apiRequest(
    `/api/v1/admin/payouts${query ? `?${query}` : ""}`,
    { method: "GET" }
  );

  const payload: any = (response as any).data ?? response;
  const items: AdminPayout[] = Array.isArray(payload)
    ? payload
    : payload.items || payload.data || payload.payouts || [];

  return {
    items,
    total: payload.total ?? payload.totalCount ?? items.length ?? 0,
    page: payload.page ?? filters.page ?? 1,
    limit: payload.limit ?? filters.limit ?? 20,
    totalPages: payload.totalPages,
  };
}

export async function approveAdminPayout(
  payoutId: string
): Promise<AdminPayout> {
  const response = await apiRequest(`/api/v1/admin/payouts/${payoutId}/approve`, {
    method: "POST",
  });
  return (response as any).data ?? (response as any);
}

export async function rejectAdminPayout(
  payoutId: string,
  reason: string
): Promise<AdminPayout> {
  const response = await apiRequest(`/api/v1/admin/payouts/${payoutId}/reject`, {
    method: "POST",
    data: { reason },
  });
  return (response as any).data ?? (response as any);
}

export async function getAdminPayoutHistory(
  filters: AdminPayoutFilters = {}
): Promise<AdminPayoutListResponse> {
  const query = buildQuery({
    status: filters.status,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    coachId: filters.coachId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  const response = await apiRequest(
    `/api/v1/admin/payouts${query ? `?${query}` : ""}`,
    { method: "GET" }
  );

  const payload: any = (response as any).data ?? response;
  const items: AdminPayout[] = Array.isArray(payload)
    ? payload
    : payload.items || payload.data || payload.payouts || [];

  return {
    items,
    total: payload.total ?? payload.totalCount ?? items.length ?? 0,
    page: payload.page ?? filters.page ?? 1,
    limit: payload.limit ?? filters.limit ?? 20,
    totalPages: payload.totalPages,
  };
}

export async function getCommissionStats(
  params: { startDate?: string; endDate?: string } = {}
): Promise<CommissionStatsResponse> {
  const query = buildQuery({
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const response = await apiRequest(
    `/api/v1/admin/commission-stats${query ? `?${query}` : ""}`,
    { method: "GET" }
  );

  const payload: any = (response as any).data ?? response;
  return payload as CommissionStatsResponse;
}
