import { apiRequest } from "@/lib/api/apiClient";

export interface TrackedApplication {
  id: string;
  name: string;
  type: "university" | "career";
  location?: string;
  matchScore?: number;
  deadline?: string;
  notes?: string;
  column: "researching" | "shortlisted" | "applying" | "applied" | "accepted";
  createdAt: string;
}

export async function listApplications(): Promise<TrackedApplication[]> {
  const response = await apiRequest("/api/v1/student/applications", { method: "GET" });
  return response?.data ?? response ?? [];
}

export async function createApplication(data: {
  name: string;
  type?: string;
  location?: string;
  matchScore?: number;
  deadline?: string;
  notes?: string;
  column?: string;
}): Promise<TrackedApplication> {
  const response = await apiRequest("/api/v1/student/applications", {
    method: "POST",
    data,
  });
  return response?.data ?? response;
}

export async function updateApplication(
  id: string,
  data: Partial<Omit<TrackedApplication, "id" | "createdAt">>
): Promise<TrackedApplication> {
  const response = await apiRequest(`/api/v1/student/applications/${id}`, {
    method: "PUT",
    data,
  });
  return response?.data ?? response;
}

export async function deleteApplication(id: string): Promise<void> {
  await apiRequest(`/api/v1/student/applications/${id}`, { method: "DELETE" });
}
