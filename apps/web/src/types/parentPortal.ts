// ============================================
// Parent Portal Types
// ============================================

export interface ChildProgressSummary {
  studentId: string;
  studentName: string;
  gradeLevel: number;
  gpa: number | null;
  isOnTrack: boolean;
  creditsEarned: number;
  /** null when the school has not configured a graduation rule set — not a zero. */
  creditsRequired: number | null;
  creditPercentage: number | null;
  assessmentStatus: {
    completed: number;
    total: number;
  };
}

/** One assessment as a parent sees it (audit E1): status, date and score summary — never answers. */
export interface ChildAssessmentResult {
  key: string;
  title: string;
  status: "not_started" | "in_progress" | "completed";
  completedAt: string | null;
  summary: { label: string; value: string }[];
}

/** GET /api/v1/parent/children/:studentId/results. */
export interface ChildResults {
  student: { id: string; name: string; gradeLevel: string | null; schoolName: string | null };
  generatedAt: string;
  assessments: ChildAssessmentResult[];
  /** Whether the career report PDF can be downloaded yet. */
  report: { available: boolean };
}

export interface ParentProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  children: ParentChildLink[];
}

export interface ParentChildLink {
  studentId: string;
  studentName: string;
  gradeLevel: number;
  relationship: "mother" | "father" | "sibling" | "guardian" | "other";
}

// ============================================
// Parent Invitation Types
// ============================================

export type ParentRelationship = "mother" | "father" | "sibling" | "guardian" | "other";

export interface ParentInviteRequest {
  studentId: string;
  name: string;
  email: string;
  relationship: ParentRelationship;
  message?: string;
}

export interface StudentParentLink {
  id: string;
  name: string;
  email: string;
  relationship: ParentRelationship;
  status: "pending" | "accepted" | "expired";
  invitedAt: string;
  acceptedAt?: string;
  parentUserId?: string;
}

// Field names are the `notifications` table's, because GET /parent/notifications
// returns the rows unmapped. This used to declare `body` and `createdAt`, neither of
// which the API sends — see the note on getParentNotifications.
export interface ParentNotification {
  id: string;
  title: string;
  message: string;
  /** Free text in the DB; TYPE_CONFIG falls back to `system` for anything unlisted. */
  type: "evaluation" | "grade" | "alert" | "meeting" | "system" | (string & {});
  isRead: boolean;
  createdDate: string;
  relatedEntityId?: string | null;
  relatedEntityType?: string | null;
}
