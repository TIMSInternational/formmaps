import type {
  SeniorProject,
  SeniorProjectPayload,
  SeniorProjectReviewPayload,
  SeniorProjectAttachment,
} from "@/types/seniorProject";
import { apiRequest } from "@/lib/api/apiClient";

interface ApiError extends Error {
  response?: { status?: number };
}

// ─── Student: own senior project ──────────────────────────────────

export async function getMySeniorProject(): Promise<SeniorProject | null> {
  try {
    const res = await apiRequest("/api/v1/student/senior-project");
    return (res.data ?? res) as SeniorProject;
  } catch (err: unknown) {
    if ((err as ApiError)?.response?.status === 404) return null;
    throw err;
  }
}

export async function createSeniorProject(
  payload: SeniorProjectPayload
): Promise<SeniorProject> {
  const res = await apiRequest("/api/v1/student/senior-project", {
    method: "POST",
    data: payload,
  });
  return (res.data ?? res) as SeniorProject;
}

export async function updateSeniorProject(
  payload: Partial<SeniorProjectPayload & { status: "submitted" }>
): Promise<SeniorProject> {
  const res = await apiRequest("/api/v1/student/senior-project", {
    method: "PUT",
    data: payload,
  });
  return (res.data ?? res) as SeniorProject;
}

export async function uploadSeniorProjectAttachment(
  file: File
): Promise<SeniorProjectAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiRequest("/api/v1/student/senior-project/attachments", {
    method: "POST",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
  return (res.data ?? res) as SeniorProjectAttachment;
}

// ─── Admin/Counselor: view & review student senior project ────────

export async function getStudentSeniorProject(
  studentId: string
): Promise<SeniorProject | null> {
  try {
    const res = await apiRequest(
      `/api/v1/school-admin/students/${studentId}/senior-project`
    );
    return (res.data ?? res) as SeniorProject;
  } catch (err: unknown) {
    if ((err as ApiError)?.response?.status === 404) return null;
    throw err;
  }
}

export async function reviewStudentSeniorProject(
  studentId: string,
  payload: SeniorProjectReviewPayload
): Promise<SeniorProject> {
  const res = await apiRequest(
    `/api/v1/school-admin/students/${studentId}/senior-project/review`,
    { method: "PUT", data: payload }
  );
  return (res.data ?? res) as SeniorProject;
}
