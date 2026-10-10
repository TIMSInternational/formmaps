// Super Admin complimentary access — audit 2026-10-09 E5 (decision D6). A student or a school gets
// free access for N days (default 30); it auto-expires and is never charged or counted as revenue.
// API: /api/v1/admin/complimentary-access (Node routes/admin.ts).
import { apiRequest } from "@/lib/api/apiClient";

export type ComplimentaryTargetType = "student" | "school";

export interface ComplimentaryGrant {
  id: string;
  targetType: ComplimentaryTargetType;
  userId: string | null;
  schoolId: string | null;
  targetName: string | null;
  targetEmail: string | null;
  startsAt: string;
  expiresAt: string;
  note: string | null;
  grantedById: string;
}

export const COMP_DEFAULT_DAYS = 30;
export const COMP_MAX_DAYS = 365;

const BASE = "/api/v1/admin/complimentary-access";

export async function listComplimentaryGrants(targetType: ComplimentaryTargetType, targetId: string): Promise<ComplimentaryGrant[]> {
  const q = new URLSearchParams({ targetType, targetId });
  const response = await apiRequest(`${BASE}?${q.toString()}`, { method: "GET", showErrorToast: false });
  return (response?.data ?? []) as ComplimentaryGrant[];
}

export async function grantComplimentaryAccess(input: {
  targetType: ComplimentaryTargetType;
  targetId: string;
  days: number;
  note?: string;
}): Promise<ComplimentaryGrant> {
  const response = await apiRequest(BASE, { method: "POST", data: input, showErrorToast: false });
  return response?.data as ComplimentaryGrant;
}

export async function revokeComplimentaryAccess(id: string): Promise<void> {
  await apiRequest(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE", showErrorToast: false });
}
