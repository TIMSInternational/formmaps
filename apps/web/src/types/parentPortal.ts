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
  creditsRequired: number;
  creditPercentage: number;
  assessmentStatus: {
    completed: number;
    total: number;
  };
  careerPath: string;
  recentActivity: ParentActivityItem[];
  pendingActions: ParentPendingAction[];
}

export interface ParentActivityItem {
  id: string;
  date: string;
  type: "grade" | "assessment" | "portfolio" | "career" | "course";
  description: string;
}

export interface ParentPendingAction {
  id: string;
  type: "360_evaluation" | "consent" | "meeting";
  title: string;
  description: string;
  deadline?: string;
  actionUrl?: string;
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
