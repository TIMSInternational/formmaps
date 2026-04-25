import type {
  CourseSequence,
  CourseSequenceDetail,
  CourseSequencePayload,
  CourseSequencesResponse,
} from "@/types/curriculum";

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

export async function getCourseSequences(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<CourseSequencesResponse> {
  const res = await fetch(
    buildUrl("/api/v1/school-admin/course-sequences", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<CourseSequencesResponse>(res);
}

export async function getCourseSequenceDetail(id: string): Promise<CourseSequenceDetail> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/course-sequences/${id}`), {
    headers: getHeaders(),
  });
  return handleResponse<CourseSequenceDetail>(res);
}

export async function createCourseSequence(payload: CourseSequencePayload): Promise<CourseSequenceDetail> {
  const res = await fetch(buildUrl("/api/v1/school-admin/course-sequences"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CourseSequenceDetail>(res);
}

export async function updateCourseSequence(
  id: string,
  payload: Partial<CourseSequencePayload>
): Promise<CourseSequenceDetail> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/course-sequences/${id}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CourseSequenceDetail>(res);
}

export async function deleteCourseSequence(id: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/course-sequences/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete sequence");
}

export async function assignSequenceToStudents(
  sequenceId: string,
  studentIds: string[]
): Promise<{ success: boolean; assigned: number }> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/course-sequences/${sequenceId}/assign`), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ studentIds }),
  });
  return handleResponse<{ success: boolean; assigned: number }>(res);
}

export async function getStudentCourseSequence(studentId: string): Promise<CourseSequenceDetail> {
  const res = await fetch(buildUrl(`/api/v1/students/${studentId}/course-sequence`), {
    headers: getHeaders(),
  });
  return handleResponse<CourseSequenceDetail>(res);
}

export async function generateCourseSequenceAI(payload: { file?: File; prompt?: string }): Promise<CourseSequencePayload> {
  const formData = new FormData();
  if (payload.file) formData.append("file", payload.file);
  if (payload.prompt) formData.append("prompt", payload.prompt);

  const res = await fetch(buildUrl("/api/v1/school-admin/course-sequences/import-ai"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    body: formData,
  });
  return handleResponse<CourseSequencePayload>(res);
}
