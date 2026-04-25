import type {
  PortfolioItem,
  PortfolioItemPayload,
  PortfolioSummary,
  PortfolioItemType,
  PortfolioResponse,
} from "@/types/portfolio";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

function getHeaders(isFormData = false): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: token ? `Bearer ${token}` : "",
  };
  if (!isFormData) headers["Content-Type"] = "application/json";
  return headers;
}

function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export async function getPortfolioItems(params: {
  type?: PortfolioItemType;
  page?: number;
  limit?: number;
}): Promise<PortfolioResponse> {
  const res = await fetch(
    buildUrl("/api/v1/student/portfolio", params as Record<string, string | number | boolean | undefined>),
    { headers: getHeaders() }
  );
  return handleResponse<PortfolioResponse>(res);
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const res = await fetch(`${API_BASE}/api/v1/student/portfolio/summary`, {
    headers: getHeaders(),
  });
  return handleResponse<PortfolioSummary>(res);
}

export async function createPortfolioItem(
  payload: PortfolioItemPayload
): Promise<PortfolioItem> {
  const res = await fetch(`${API_BASE}/api/v1/student/portfolio`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<PortfolioItem>(res);
}

export async function updatePortfolioItem(
  id: string,
  payload: Partial<PortfolioItemPayload>
): Promise<PortfolioItem> {
  const res = await fetch(`${API_BASE}/api/v1/student/portfolio/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<PortfolioItem>(res);
}

export async function deletePortfolioItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/student/portfolio/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete portfolio item");
}

export async function uploadPortfolioAttachment(
  itemId: string,
  file: File
): Promise<{ id: string; fileName: string; fileUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/v1/student/portfolio/${itemId}/attachments`,
    { method: "POST", headers: getHeaders(true), body: formData }
  );
  return handleResponse<{ id: string; fileName: string; fileUrl: string }>(res);
}
