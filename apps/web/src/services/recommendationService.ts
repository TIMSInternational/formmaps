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
  letterFileKey: string | null;
  letterFileName: string | null;
  letterUploadedAt: string | null;
  createdDate: string;
  student?: { name: string; email: string };
  recommender?: { name: string; email: string; roleName?: string | null };
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

/** Recommender uploads the signed PDF letter. Flips the request to "submitted". */
export async function uploadRecommendationLetter(id: string, file: File): Promise<RecommendationRequest> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiRequest(`/api/v1/recommendations/${id}/letter`, { method: "POST", data: formData });
  return res?.data ?? res;
}

/** Short-TTL signed URL for the uploaded letter (student/recommender/staff). */
export async function getRecommendationLetterUrl(id: string): Promise<{ url: string; filename: string }> {
  const res = await apiRequest(`/api/v1/recommendations/${id}/letter`, { method: "GET" });
  return res?.data ?? res;
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
