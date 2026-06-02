import type {
  Alert,
  AlertSummary,
  AlertUpdatePayload,
  AlertBulkActionPayload,
  AlertsResponse,
  AlertsQueryParams,
} from "@/types/alert";
import { apiRequest } from "@/lib/api/apiClient";
import { toCamel } from "@/lib/toCamel";

// ============================================
// Alerts
// ============================================

export async function getAlerts(params?: AlertsQueryParams): Promise<AlertsResponse> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : "";
  const res = await apiRequest(`/api/v1/alerts${qs}`);
  return toCamel(res.data ?? res) as AlertsResponse;
}

export async function getAlertSummary(): Promise<AlertSummary> {
  const res = await apiRequest("/api/v1/alerts/summary");
  return toCamel(res.data ?? res) as AlertSummary;
}

export async function updateAlert(alertId: string, payload: AlertUpdatePayload): Promise<Alert> {
  const res = await apiRequest(`/api/v1/alerts/${alertId}`, {
    method: "PUT",
    data: payload,
  });
  return toCamel(res.data ?? res) as Alert;
}

export async function bulkAlertAction(payload: AlertBulkActionPayload): Promise<{ success: boolean; affected: number }> {
  const res = await apiRequest("/api/v1/alerts/bulk-action", {
    method: "POST",
    data: payload,
  });
  return toCamel(res.data ?? res) as { success: boolean; affected: number };
}
