// ============================================
// Counselor Notes Types
// ============================================

export type NoteType = "general" | "meeting" | "follow_up" | "academic" | "career" | "personal";

// These field names are the API's, not a guess. `GET /counselor/students/:id/notes`
// returns the counselor_notes row plus an `authorName` join; the row's author column is
// `authorId` and its creation column is `createdDate`. This interface used to declare
// `counselorId` / `counselorName` / `createdAt`, none of which the API has ever sent —
// which is why the date rendered blank on every note in both notes panels.
export interface CounselorNote {
  id: string;
  studentId: string;
  authorId: string;
  /** Joined in by the read endpoints; may be absent on a row echoed back from a write. */
  authorName?: string;
  type: NoteType;
  content: string;
  isPrivate: boolean;
  followUpDate?: string | null;
  followUpCompleted?: boolean;
  followUpCompletedAt?: string | null;
  tags: string[];
  createdDate: string;
  updatedAt: string;
}

export interface CounselorNotePayload {
  studentId: string;
  type: NoteType;
  content: string;
  isPrivate: boolean;
  followUpDate?: string;
  tags?: string[];
}

export interface CounselorNotesResponse {
  data: CounselorNote[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
