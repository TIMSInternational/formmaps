export type SchoolStatus = "active" | "inactive" | "invited" | "pending";

export interface School {
  id: string;
  name: string;
  adminEmail: string;
  maxStudents: number;
  studentCount?: number;
  status: SchoolStatus;
  details?: string;
  contractStart?: string;
  contractEnd?: string;
  videoCallsEnabled?: boolean;
  createdDate?: string;
  updatedAt?: string;
}

export interface SchoolInvitePayload {
  name: string;
  adminEmail: string;
  maxStudents: number;
  details?: string;
  contractStart?: string;
  contractEnd?: string;
}

export interface SchoolsResponse {
  data: School[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SchoolStats {
  totalSchools: number;
  activeSchools: number;
  pendingInvites: number;
  totalStudents: number;
}

// ============================================
// School Admin Onboarding Types
// ============================================

export interface SchoolAdminOnboardingStatus {
  userId: string;
  email: string;
  schoolName: string;
  adminName?: string;
  maxStudents: number;
  contractStart?: string;
  contractEnd?: string;
  isValid: boolean;
  status: "pending" | "completed" | "expired";
}

export interface SchoolAdminOnboardingData {
  adminInfo: {
    name: string;
    phone?: string;
    position?: string;
  };
  schoolSettings: {
    notifyOnStudentSignup: boolean;
    notifyOnAssessmentComplete: boolean;
    allowStudentSelfRegistration: boolean;
  };
  password: string;
}

export const INITIAL_SCHOOL_ADMIN_ONBOARDING_DATA: SchoolAdminOnboardingData = {
  adminInfo: {
    name: "",
    phone: "",
    position: "",
  },
  schoolSettings: {
    notifyOnStudentSignup: true,
    notifyOnAssessmentComplete: true,
    allowStudentSelfRegistration: false,
  },
  password: "",
};
