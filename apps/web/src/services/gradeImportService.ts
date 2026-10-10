import { apiRequest } from "@/lib/api/apiClient";
import { parseGradeCsv } from "@/lib/gradeCsv";

export interface GradeImportStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  successCount: number;
  failureCount: number;
  message?: string;
  completedAt?: string;
}

export class EmptyGradeCsvError extends Error {}

/**
 * The API takes parsed rows (JSON), not a file: this used to POST multipart and always got a 400.
 * The school comes from the caller's session server-side.
 */
export async function uploadGrades(file: File, _schoolId?: string): Promise<{ jobId: string }> {
  void _schoolId;
  const rows = parseGradeCsv(await file.text());
  if (rows.length === 0) throw new EmptyGradeCsvError("No valid rows");
  const json = await apiRequest(`/api/v1/school-admin/grades/import`, {
    method: "POST",
    data: { rows, filename: file.name },
  });
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
