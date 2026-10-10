import { apiRequest } from "@/lib/api/apiClient";
import { Payout, PayoutStatus } from "@/types/coach";

interface ApiPayload extends Record<string, unknown> {
  data?: unknown;
  items?: AdminPayout[];
  payouts?: AdminPayout[];
  total?: number;
  totalCount?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

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
  search?: string;
  page?: number;
  limit?: number;
  coachId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CommissionStatsResponse {
  totalCommission: number;
  totalPayouts: number;
  completedCount?: number;
  pendingAmount?: number;
  pendingCount?: number;
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
    // No status = every status (the page's default "All" tab used to be sent as "pending").
    status: filters.status,
    search: filters.search?.trim() || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
  });

  const response = await apiRequest(
    `/api/v1/admin/payouts${query ? `?${query}` : ""}`,
    { method: "GET" }
  );

  const raw = response as ApiPayload;
  const payload: ApiPayload = (raw.data as ApiPayload) ?? raw;
  const items: AdminPayout[] = Array.isArray(payload)
    ? payload
    : (payload.items || payload.data || payload.payouts || []) as AdminPayout[];

  return {
    items,
    total: payload.total ?? payload.totalCount ?? items.length ?? 0,
    page: payload.page ?? filters.page ?? 1,
    limit: payload.limit ?? filters.limit ?? 20,
    totalPages: payload.totalPages ?? Math.max(1, Math.ceil((payload.total ?? items.length ?? 0) / (payload.limit ?? filters.limit ?? 20))),
  };
}

/** "Mark as paid" — FormMaps sends no money; this records the day it was paid and an optional reference. */
export async function approveAdminPayout(
  payoutId: string,
  details: { paidAt?: string; reference?: string } = {}
): Promise<AdminPayout> {
  const response = await apiRequest<ApiPayload>(`/api/v1/admin/payouts/${payoutId}/approve`, {
    method: "POST",
    data: {
      ...(details.paidAt ? { paidAt: details.paidAt } : {}),
      ...(details.reference?.trim() ? { reference: details.reference.trim() } : {}),
    },
  });
  return (response.data ?? response) as AdminPayout;
}

// --- Monthly coach payouts (audit D3): amounts are integer cents ---

export interface MonthlyPayoutRecord {
  id: string;
  status: string;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  requestedAt: string;
  paidAt: string | null;
  reference: string | null;
}

export interface MonthlyPayoutRow {
  coachId: string;
  coachName: string;
  coachEmail: string;
  currency: string;
  sessions: number;
  grossCents: number;
  commissionPercent: number;
  commissionCents: number;
  netCents: number;
  payout: MonthlyPayoutRecord | null;
  /** A paid payout that no longer matches the month (a refund or a late payment after it was paid). */
  differenceCents: number;
}

export interface MonthlyPayouts {
  month: string;
  periodStart: string;
  periodEnd: string;
  monthEnded: boolean;
  rows: MonthlyPayoutRow[];
  totals: { grossCents: number; commissionCents: number; netCents: number; sessions: number };
}

export interface GenerateMonthlyPayoutsResult {
  month: string;
  created: number;
  updated: number;
  unchanged: number;
  locked: number;
  payouts: MonthlyPayouts;
}

export async function getMonthlyPayouts(month: string): Promise<MonthlyPayouts> {
  const response = await apiRequest<ApiPayload>(`/api/v1/admin/payouts/monthly?month=${encodeURIComponent(month)}`, { method: "GET" });
  return (response.data ?? response) as unknown as MonthlyPayouts;
}

export async function generateMonthlyPayouts(month: string): Promise<GenerateMonthlyPayoutsResult> {
  const response = await apiRequest<ApiPayload>(`/api/v1/admin/payouts/generate`, { method: "POST", data: { month } });
  return (response.data ?? response) as unknown as GenerateMonthlyPayoutsResult;
}

/** The month before `now` as YYYY-MM (the first month that can be generated). */
export function previousMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function rejectAdminPayout(
  payoutId: string,
  reason: string
): Promise<AdminPayout> {
  const response = await apiRequest<ApiPayload>(`/api/v1/admin/payouts/${payoutId}/reject`, {
    method: "POST",
    data: { reason },
  });
  return (response.data ?? response) as AdminPayout;
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

  const raw = response as ApiPayload;
  const payload: ApiPayload = (raw.data as ApiPayload) ?? raw;
  const items: AdminPayout[] = Array.isArray(payload)
    ? payload
    : (payload.items || payload.data || payload.payouts || []) as AdminPayout[];

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

  const response = await apiRequest<ApiPayload>(
    `/api/v1/admin/commission-stats${query ? `?${query}` : ""}`,
    { method: "GET" }
  );

  const payload = (response.data ?? response) as CommissionStatsResponse;
  return payload;
}
