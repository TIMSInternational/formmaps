import { apiRequest } from "@/lib/api/apiClient";

export interface RecommendationRequest {
  id: string;
  studentId: string;
  recommenderId: string;
  status: string;
  relationship: string | null;
  requestMessage: string | null;
  declineReason: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  createdDate: string;
  student?: { name: string; email: string };
  recommender?: { name: string; email: string };
}

export async function requestRecommendation(data: {
  recommenderId: string;
  relationship: string;
  requestMessage?: string;
  dueDate?: string;
}): Promise<RecommendationRequest> {
  const res = await apiRequest("/api/v1/recommendations", { method: "POST", data });
  return res?.data ?? res;
}

export async function listMyRecommendations(): Promise<RecommendationRequest[]> {
  const res = await apiRequest("/api/v1/recommendations", { method: "GET" });
  return res?.data ?? res ?? [];
}

export async function listReceivedRecommendations(): Promise<RecommendationRequest[]> {
  const res = await apiRequest("/api/v1/recommendations/received", { method: "GET" });
  return res?.data ?? res ?? [];
}

export async function respondToRecommendation(id: string, action: "accept" | "decline", declineReason?: string): Promise<RecommendationRequest> {
  const res = await apiRequest(`/api/v1/recommendations/${id}/respond`, { method: "PUT", data: { action, declineReason } });
  return res?.data ?? res;
}

export async function updateRecommendationStatus(id: string, status: "in_progress" | "submitted"): Promise<RecommendationRequest> {
  const res = await apiRequest(`/api/v1/recommendations/${id}/status`, { method: "PUT", data: { status } });
  return res?.data ?? res;
}

export async function linkApplications(id: string, applicationIds: string[]): Promise<void> {
  await apiRequest(`/api/v1/recommendations/${id}/link-applications`, { method: "POST", data: { applicationIds } });
}

export interface RecommendationDashboard {
  total: number;
  countByStatus: Record<string, number>;
  requests: RecommendationRequest[];
}

export async function getRecommendationDashboard(): Promise<RecommendationDashboard> {
  const res = await apiRequest("/api/v1/recommendations/dashboard", { method: "GET" });
  return res?.data ?? res;
}
