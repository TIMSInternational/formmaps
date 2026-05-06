import type {
  AssessmentConfigResponse,
  AssessmentConfigPayload,
  AssessmentStatusSummary,
} from "@/types/assessmentConfig";

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

const buildUrl = (endpoint: string) => `${API_BASE_URL}${endpoint}`;

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

export async function getAssessmentConfig(): Promise<AssessmentConfigResponse> {
  const res = await fetch(buildUrl("/api/v1/school-admin/assessments/config"), {
    headers: getHeaders(),
  });
  return handleResponse<AssessmentConfigResponse>(res);
}

export async function updateAssessmentConfig(payload: AssessmentConfigPayload): Promise<AssessmentConfigResponse> {
  const res = await fetch(buildUrl("/api/v1/school-admin/assessments/config"), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AssessmentConfigResponse>(res);
}

export async function getAssessmentStatus(): Promise<AssessmentStatusSummary> {
  const res = await fetch(buildUrl("/api/v1/school-admin/assessments/status"), {
    headers: getHeaders(),
  });
  return handleResponse<AssessmentStatusSummary>(res);
}
