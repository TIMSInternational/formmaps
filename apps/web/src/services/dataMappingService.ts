import type {
  DataMapping,
  DataMappingPayload,
  AIMappingSuggestion,
  AIMappingSuggestPayload,
  DataMappingsResponse,
} from "@/types/dataMapping";
import { apiRequest } from "@/lib/api/apiClient";

const buildQueryString = (params?: Record<string, string | number | undefined>): string => {
  if (!params) return "";
  const filtered: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      filtered[key] = String(value);
    }
  });
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `?${qs}` : "";
};

// ============================================
// Data Mappings (SCRUM-142)
// ============================================

export async function getDataMappings(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<DataMappingsResponse> {
  const res = await apiRequest(
    `/api/v1/school-admin/data-mappings${buildQueryString(params as Record<string, string | number | undefined>)}`
  );
  return res.data ?? res;
}

export async function createDataMapping(payload: DataMappingPayload): Promise<DataMapping> {
  const res = await apiRequest("/api/v1/school-admin/data-mappings", {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}

export async function updateDataMapping(id: string, payload: Partial<DataMappingPayload>): Promise<DataMapping> {
  const res = await apiRequest(`/api/v1/school-admin/data-mappings/${id}`, {
    method: "PUT",
    data: payload,
  });
  return res.data ?? res;
}

export async function deleteDataMapping(id: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/data-mappings/${id}`, {
    method: "DELETE",
  });
}

export async function getAIMappingSuggestions(
  payload: AIMappingSuggestPayload
): Promise<{ suggestions: AIMappingSuggestion[] }> {
  const res = await apiRequest("/api/v1/school-admin/data-mappings/ai-suggest", {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}

export async function bulkApproveMappings(mappingIds: string[]): Promise<{ success: boolean; approved: number }> {
  const res = await apiRequest("/api/v1/school-admin/data-mappings/bulk-approve", {
    method: "POST",
    data: { mappingIds },
  });
  return res.data ?? res;
}
