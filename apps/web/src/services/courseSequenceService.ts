import { apiRequest } from "@/lib/api/apiClient";
import type {
  CourseSequence,
  CourseSequenceDetail,
  CourseSequencePayload,
  CourseSequencesResponse,
} from "@/types/curriculum";

const buildPath = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.append(key, String(value));
    }
  });
  const queryString = qs.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
};

export async function getCourseSequences(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<CourseSequencesResponse> {
  const json = await apiRequest(
    buildPath("/api/v1/school-admin/course-sequences", params as Record<string, string | number>)
  );
  return json.data ?? json;
}

export async function getCourseSequenceDetail(id: string): Promise<CourseSequenceDetail> {
  const json = await apiRequest(`/api/v1/school-admin/course-sequences/${id}`);
  return json.data ?? json;
}

export async function createCourseSequence(payload: CourseSequencePayload): Promise<CourseSequenceDetail> {
  const json = await apiRequest("/api/v1/school-admin/course-sequences", {
    method: "POST",
    data: payload,
  });
  return json.data ?? json;
}

export async function updateCourseSequence(
  id: string,
  payload: Partial<CourseSequencePayload>
): Promise<CourseSequenceDetail> {
  const json = await apiRequest(`/api/v1/school-admin/course-sequences/${id}`, {
    method: "PUT",
    data: payload,
  });
  return json.data ?? json;
}

export async function deleteCourseSequence(id: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/course-sequences/${id}`, {
    method: "DELETE",
  });
}

export async function assignSequenceToStudents(
  sequenceId: string,
  studentIds: string[]
): Promise<{ success: boolean; assigned: number }> {
  const json = await apiRequest(
    `/api/v1/school-admin/course-sequences/${sequenceId}/assign`,
    { method: "POST", data: { studentIds } }
  );
  return json.data ?? json;
}

export async function getStudentCourseSequence(studentId: string): Promise<CourseSequenceDetail> {
  const json = await apiRequest(`/api/v1/school-admin/course-sequence/${studentId}`);
  return json.data ?? json;
}

export async function generateCourseSequenceAI(payload: { file?: File; prompt?: string }): Promise<CourseSequencePayload> {
  const formData = new FormData();
  if (payload.file) formData.append("file", payload.file);
  if (payload.prompt) formData.append("prompt", payload.prompt);

  const json = await apiRequest(
    "/api/v1/school-admin/course-sequences/import-ai",
    {
      method: "POST",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return json.data ?? json;
}
