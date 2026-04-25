// ============================================
// Counselor Notes Types
// ============================================

export type NoteType = "general" | "meeting" | "follow_up" | "academic" | "career" | "personal";

export interface CounselorNote {
  id: string;
  studentId: string;
  counselorId: string;
  counselorName: string;
  type: NoteType;
  content: string;
  isPrivate: boolean;
  followUpDate?: string;
  followUpCompleted?: boolean;
  tags: string[];
  createdAt: string;
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
