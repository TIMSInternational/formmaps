// ============================================
// Assessment Configuration Types (SCRUM-143)
// ============================================

import type { AssessmentType } from "./calendar";

// Matches actual backend shape: PUT/GET /api/v1/school-admin/assessments/config
export interface AssessmentConfigItem {
  assessmentType: string;
  isEnabled: boolean;
  description: string;
}

export interface AssessmentConfigResponse {
  configs: AssessmentConfigItem[];
}

export interface AssessmentConfigPayload {
  configs: AssessmentConfigItem[];
}

export interface AssessmentStatusSummary {
  summary: Record<
    AssessmentType,
    { completed: number; inProgress: number; notStarted: number; total: number }
  >;
}

// ============================================
// Counselor Types (SCRUM-145)
// ============================================

export interface CounselorStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel: number;
  status: string;
  assessmentStatus: Record<AssessmentType, "completed" | "in_progress" | "not_started">;
  creditProgress: { earned: number; required: number; percentage: number };
  gpa: number;
  alertCount: number;
  careerPath: string;
  lastActive: string;
  createdAt?: string;
  joinedAt?: string;
}

export interface CounselorStudentsResponse {
  data: CounselorStudent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// School User / Role Types (SCRUM-134)
// ============================================

export type SchoolRole = "school_admin" | "counselor" | "staff" | "student";
export type SchoolUserStatus = "active" | "pending" | "inactive";

export interface SchoolUser {
  id: string;
  name: string;
  email: string;
  role: SchoolRole;
  status: SchoolUserStatus;
  assignedStudentCount?: number;
  /** Counselor assignment scope (optional) */
  accessScope?: "all" | "selective";
  /** When accessScope === 'selective' the assigned IDs */
  assignedStudentIds?: string[];
  joinedAt: string;
  lastActive: string;
}

export interface SchoolUsersResponse {
  data: SchoolUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StaffInvitePayload {
  email: string;
  name: string;
  /**
   * Wire field name must stay `roleName` — that is what POST
   * /api/v1/school-admin/staff/invite validates. Sending `role` instead made
   * zod strip the key and silently default every invite to counselor, granting
   * student-record access to teachers, staff and coaches (formmaps#79).
   */
  roleName: "counselor" | "teacher" | "staff" | "coach";
}

export interface BulkStaffInvitePayload {
  users: StaffInvitePayload[];
}

export interface StudentAssignPayload {
  studentIds: string[];
}

// ============================================
// School Profile Types (SCRUM-130)
// ============================================

export interface SchoolAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface SchoolProfile {
  id: string;
  name: string;
  logo: string | null;
  logoUrl?: string | null;
  address: SchoolAddress;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  maxStudents: number;
  currentStudents: number;
  contractStart: string;
  contractEnd: string;
  status: "active" | "suspended" | "expired";
}

export interface SchoolProfilePayload {
  name?: string;
  address?: Partial<SchoolAddress>;
  phone?: string;
  email?: string;
  website?: string;
  timezone?: string;
}
