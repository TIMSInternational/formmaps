// ============================================
// Senior Project Types
// ============================================

export type SeniorProjectStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "revision_needed";

export interface SeniorProjectAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface SeniorProject {
  id: string;
  title: string;
  description: string;
  status: SeniorProjectStatus;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  counselorNote: string | null;
  attachments: SeniorProjectAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface SeniorProjectPayload {
  title: string;
  description: string;
}

export interface SeniorProjectReviewPayload {
  status: "approved" | "revision_needed";
  counselorNote?: string;
}
