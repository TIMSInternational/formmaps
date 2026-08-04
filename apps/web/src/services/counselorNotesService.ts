import { apiRequest } from "@/lib/api/apiClient";
import type {
  CounselorNote,
  CounselorNotePayload,
  CounselorNotesResponse,
} from "@/types/counselorNotes";

// Get notes for a student
export async function getStudentNotes(
  studentId: string,
  params?: { page?: number; limit?: number; type?: string }
): Promise<CounselorNotesResponse> {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const qs = query.toString();
  const res = await apiRequest(
    `/api/v1/counselor/students/${studentId}/notes${qs ? `?${qs}` : ""}`
  );
  return res.data ?? res;
}

// Create a note
export async function createNote(
  payload: CounselorNotePayload
): Promise<CounselorNote> {
  const { studentId, ...body } = payload;
  const res = await apiRequest(
    `/api/v1/counselor/students/${studentId}/notes`,
    { method: "POST", data: body }
  );
  return res.data ?? res;
}

// Update a note
export async function updateNote(
  noteId: string,
  payload: Partial<CounselorNotePayload>
): Promise<CounselorNote> {
  const res = await apiRequest(`/api/v1/counselor/notes/${noteId}`, {
    method: "PUT",
    data: payload,
  });
  return res.data ?? res;
}

// Delete a note
export async function deleteNote(noteId: string): Promise<void> {
  await apiRequest(`/api/v1/counselor/notes/${noteId}`, {
    method: "DELETE",
  });
}

// Mark follow-up as completed.
// This route answers with a PARTIAL row, not the whole note, so callers must merge it
// into what they already hold rather than substituting it.
export async function completeFollowUp(
  noteId: string
): Promise<Pick<CounselorNote, "id" | "followUpCompleted" | "followUpCompletedAt">> {
  const res = await apiRequest(
    `/api/v1/counselor/notes/${noteId}/complete-followup`,
    { method: "PUT" }
  );
  return res.data ?? res;
}
