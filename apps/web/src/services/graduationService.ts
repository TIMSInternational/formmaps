import type {
  GraduationRuleSet,
  GraduationRuleSetWithId,
  StudentGraduationProgress,
  GraduationProgressResponse,
} from "@/types/graduation";

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
// Graduation Rules
// ============================================

export async function getGraduationRules(): Promise<GraduationRuleSetWithId> {
  const res = await fetch(buildUrl("/api/v1/school-admin/graduation/rules"), {
    headers: getHeaders(),
  });
  return handleResponse<GraduationRuleSetWithId>(res);
}

export async function createGraduationRules(payload: GraduationRuleSet): Promise<GraduationRuleSetWithId> {
  const res = await fetch(buildUrl("/api/v1/school-admin/graduation/rules"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<GraduationRuleSetWithId>(res);
}

export async function updateGraduationRules(
  ruleSetId: string,
  payload: Partial<GraduationRuleSet>
): Promise<GraduationRuleSetWithId> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/graduation/rules/${ruleSetId}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<GraduationRuleSetWithId>(res);
}

// ============================================
// Graduation Progress
// ============================================

export async function getStudentGraduationProgress(
  studentId: string
): Promise<StudentGraduationProgress> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/graduation/progress/${studentId}`),
    { headers: getHeaders() }
  );
  return handleResponse<StudentGraduationProgress>(res);
}

export async function getAllGraduationProgress(params?: {
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
}): Promise<GraduationProgressResponse> {
  const res = await fetch(
    buildUrl("/api/v1/school-admin/graduation/progress", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<GraduationProgressResponse>(res);
}
