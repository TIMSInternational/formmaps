import type {
  Alert,
  AlertSummary,
  AlertUpdatePayload,
  AlertBulkActionPayload,
  AlertsResponse,
  AlertsQueryParams,
} from "@/types/alert";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

const buildUrl = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
};

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), toCamel(v)])
    );
  }
  return obj;
}

const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  return toCamel(json.data ?? json) as T;
};

// ============================================
// Alerts
// ============================================

export async function getAlerts(params?: AlertsQueryParams): Promise<AlertsResponse> {
  const res = await fetch(
    buildUrl("/api/v1/alerts", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<AlertsResponse>(res);
}

export async function getAlertSummary(): Promise<AlertSummary> {
  const res = await fetch(buildUrl("/api/v1/alerts/summary"), {
    headers: getHeaders(),
  });
  return handleResponse<AlertSummary>(res);
}

export async function updateAlert(alertId: string, payload: AlertUpdatePayload): Promise<Alert> {
  const res = await fetch(buildUrl(`/api/v1/alerts/${alertId}`), {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Alert>(res);
}

export async function bulkAlertAction(payload: AlertBulkActionPayload): Promise<{ success: boolean; affected: number }> {
  const res = await fetch(buildUrl("/api/v1/alerts/bulk-action"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ success: boolean; affected: number }>(res);
}
