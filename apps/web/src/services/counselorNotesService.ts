import type {
  CounselorNote,
  CounselorNotePayload,
  CounselorNotesResponse,
} from "@/types/counselorNotes";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

function getHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// Get notes for a student
export async function getStudentNotes(
  studentId: string,
  params?: { page?: number; limit?: number; type?: string }
): Promise<CounselorNotesResponse> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/students/${studentId}/notes`, params as Record<string, string | number | boolean | undefined>),
    { headers: getHeaders() }
  );
  return handleResponse<CounselorNotesResponse>(res);
}

// Create a note
export async function createNote(
  payload: CounselorNotePayload
): Promise<CounselorNote> {
  const { studentId, ...body } = payload;
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/students/${studentId}/notes`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    }
  );
  return handleResponse<CounselorNote>(res);
}

// Update a note
export async function updateNote(
  noteId: string,
  payload: Partial<CounselorNotePayload>
): Promise<CounselorNote> {
  const res = await fetch(`${API_BASE}/api/v1/school-admin/notes/${noteId}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CounselorNote>(res);
}

// Delete a note
export async function deleteNote(noteId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/school-admin/notes/${noteId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete note");
}

// Mark follow-up as completed
export async function completeFollowUp(noteId: string): Promise<CounselorNote> {
  const res = await fetch(
    `${API_BASE}/api/v1/school-admin/notes/${noteId}/complete-followup`,
    { method: "PUT", headers: getHeaders() }
  );
  return handleResponse<CounselorNote>(res);
}
