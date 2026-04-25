import type {
  DataMapping,
  DataMappingPayload,
  AIMappingSuggestion,
  AIMappingSuggestPayload,
  DataMappingsResponse,
} from "@/types/dataMapping";

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

const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  return json.data ?? json;
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
  const res = await fetch(
    buildUrl("/api/v1/school-admin/data-mappings", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<DataMappingsResponse>(res);
}

export async function createDataMapping(payload: DataMappingPayload): Promise<DataMapping> {
  const res = await fetch(buildUrl("/api/v1/school-admin/data-mappings"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<DataMapping>(res);
}

export async function updateDataMapping(id: string, payload: Partial<DataMappingPayload>): Promise<DataMapping> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/data-mappings/${id}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<DataMapping>(res);
}

export async function deleteDataMapping(id: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/data-mappings/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete mapping");
}

export async function getAIMappingSuggestions(
  payload: AIMappingSuggestPayload
): Promise<{ suggestions: AIMappingSuggestion[] }> {
  const res = await fetch(buildUrl("/api/v1/school-admin/data-mappings/ai-suggest"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ suggestions: AIMappingSuggestion[] }>(res);
}

export async function bulkApproveMappings(mappingIds: string[]): Promise<{ success: boolean; approved: number }> {
  const res = await fetch(buildUrl("/api/v1/school-admin/data-mappings/bulk-approve"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ mappingIds }),
  });
  return handleResponse<{ success: boolean; approved: number }>(res);
}
