import { apiRequest } from "@/lib/api/apiClient";

export type ReportTargetType = "message" | "conversation" | "user";

/** File a UGC report (message / conversation / user). */
export async function reportTarget(
  targetType: ReportTargetType,
  targetId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  const res = await apiRequest("/api/v1/moderation/report", {
    method: "POST",
    data: { targetType, targetId, reason },
  });
  return res?.data ?? res;
}

/** Block a user — neither side can message the other afterward. */
export async function blockUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/moderation/block/${encodeURIComponent(userId)}`, { method: "POST" });
}

/** Remove a block. */
export async function unblockUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/moderation/block/${encodeURIComponent(userId)}`, { method: "DELETE" });
}
