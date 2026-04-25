export interface GradeImportStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  successCount: number;
  failureCount: number;
  message?: string;
  completedAt?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = (): Record<string, string> => {
  const token = getToken();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
};

export async function uploadGrades(file: File, schoolId: string): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append("file", file);

  const url = `${API_BASE_URL}/api/v1/school-admin/grades/import?schoolId=${encodeURIComponent(schoolId)}`;
  const res = await fetch(url, { method: "POST", headers: getHeaders(), body: form });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Grade import failed");
  }

  const json = await res.json();
  return json.data ?? json;
}

export async function getGradeImportStatus(jobId: string): Promise<GradeImportStatus> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/school-admin/grades/import/${jobId}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to fetch import status");
  const json = await res.json();
  return json.data ?? json;
}

export async function downloadGradeImportFailures(jobId: string): Promise<Blob> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/school-admin/grades/import/${jobId}/download-failures`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error("Failed to download failure report");
  return res.blob();
}
