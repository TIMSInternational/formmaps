import type {
  PortfolioItem,
  PortfolioItemPayload,
  PortfolioSummary,
  PortfolioItemType,
  PortfolioResponse,
} from "@/types/portfolio";
import { apiRequest } from "@/lib/api/apiClient";

export async function getPortfolioItems(params: {
  type?: PortfolioItemType;
  page?: number;
  limit?: number;
}): Promise<PortfolioResponse> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const res = await apiRequest(`/api/v1/student/portfolio${qs ? `?${qs}` : ""}`);
  return (res.data ?? res) as PortfolioResponse;
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const res = await apiRequest("/api/v1/student/portfolio/summary");
  return (res.data ?? res) as PortfolioSummary;
}

export async function createPortfolioItem(
  payload: PortfolioItemPayload
): Promise<PortfolioItem> {
  const res = await apiRequest("/api/v1/student/portfolio", {
    method: "POST",
    data: payload,
  });
  return (res.data ?? res) as PortfolioItem;
}

export async function updatePortfolioItem(
  id: string,
  payload: Partial<PortfolioItemPayload>
): Promise<PortfolioItem> {
  const res = await apiRequest(`/api/v1/student/portfolio/${id}`, {
    method: "PUT",
    data: payload,
  });
  return (res.data ?? res) as PortfolioItem;
}

export async function deletePortfolioItem(id: string): Promise<void> {
  await apiRequest(`/api/v1/student/portfolio/${id}`, { method: "DELETE" });
}

export async function uploadPortfolioAttachment(
  itemId: string,
  file: File
): Promise<{ id: string; fileName: string; fileUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiRequest(
    `/api/v1/student/portfolio/${itemId}/attachments`,
    { method: "POST", data: formData, headers: { "Content-Type": "multipart/form-data" } }
  );
  return (res.data ?? res) as { id: string; fileName: string; fileUrl: string };
}
