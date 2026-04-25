import type {
  SeniorProject,
  SeniorProjectPayload,
  SeniorProjectReviewPayload,
  SeniorProjectAttachment,
} from "@/types/seniorProject";

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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// ─── Student: own senior project ──────────────────────────────────

export async function getMySeniorProject(): Promise<SeniorProject | null> {
  const res = await fetch(`${API_BASE}/api/v1/student/senior-project`, {
    headers: getHeaders(),
  });
  if (res.status === 404) return null;
  return handleResponse<SeniorProject>(res);
}

export async function createSeniorProject(
  payload: SeniorProjectPayload
): Promise<SeniorProject> {
  const res = await fetch(`${API_BASE}/api/v1/student/senior-project`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SeniorProject>(res);
}

export async function updateSeniorProject(
  payload: Partial<SeniorProjectPayload & { status: "submitted" }>
): Promise<SeniorProject> {
  const res = await fetch(`${API_BASE}/api/v1/student/senior-project`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SeniorProject>(res);
}

export async function uploadSeniorProjectAttachment(
  file: File
): Promise<SeniorProjectAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/v1/student/senior-project/attachments`,
    { method: "POST", headers: getHeaders(true), body: formData }
  );
  return handleResponse<SeniorProjectAttachment>(res);
}

// ─── Admin/Counselor: view & review student senior project ────────

export async function getStudentSeniorProject(
  studentId: string
): Promise<SeniorProject | null> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/senior-project`,
    { headers: getHeaders() }
  );
  if (res.status === 404) return null;
  return handleResponse<SeniorProject>(res);
}

export async function reviewStudentSeniorProject(
  studentId: string,
  payload: SeniorProjectReviewPayload
): Promise<SeniorProject> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/senior-project/review`,
    {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  );
  return handleResponse<SeniorProject>(res);
}
