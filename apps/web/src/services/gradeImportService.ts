import { apiRequest } from "@/lib/api/apiClient";

export interface GradeImportStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  successCount: number;
  failureCount: number;
  message?: string;
  completedAt?: string;
}

export async function uploadGrades(file: File, schoolId: string): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append("file", file);

  const json = await apiRequest(
    `/api/v1/school-admin/grades/import?schoolId=${encodeURIComponent(schoolId)}`,
    {
      method: "POST",
      data: form,
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return json.data ?? json;
}

export async function getGradeImportStatus(jobId: string): Promise<GradeImportStatus> {
  const json = await apiRequest(`/api/v1/school-admin/grades/import/${jobId}`);
  return json.data ?? json;
}

export async function downloadGradeImportFailures(jobId: string): Promise<Blob> {
  // Blob download requires raw fetch — apiRequest returns parsed JSON
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(
    `${baseUrl}/api/v1/school-admin/grades/import/${jobId}/download-failures`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error("Failed to download failure report");
  return res.blob();
}
