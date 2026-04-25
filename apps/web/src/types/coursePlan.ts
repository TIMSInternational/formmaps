// ============================================
// Student Course Plan Types (Student-facing trajectory)
// ============================================

export type CourseEnrollmentStatus = "completed" | "in_progress" | "planned" | "dropped" | "pending_add" | "pending_remove";

export interface StudentCourseEnrollment {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  category: string;
  credits: number;
  gradeLevel: number;
  semester: string;
  status: CourseEnrollmentStatus;
  grade?: string;
  gpa?: number;
}

export interface StudentCoursePlan {
  studentId: string;
  gradeLevel: number;
  enrollments: StudentCourseEnrollment[];
  graduationProgress: {
    totalCreditsEarned: number;
    totalCreditsRequired: number;
    percentage: number;
    isOnTrack: boolean;
  };
  byGrade: Record<number, StudentCourseEnrollment[]>;
}

export interface RecommendedCourse {
  courseId: string;
  courseCode: string;
  courseName: string;
  category: string;
  credits: number;
  reason: string;
  priority: "high" | "medium" | "low";
  source: "career_alignment" | "graduation_requirement" | "assessment_based";
  semester?: string;
  gradeLevel?: number;
}

export interface StudentCoursePlanResponse {
  plan: StudentCoursePlan;
  recommendations: RecommendedCourse[];
}

// ============================================
// Course Change Requests (student → counselor approval)
// ============================================

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ChangeRequestAction = "add" | "remove";

export interface CourseChangeRequest {
  id: string;
  studentId: string;
  studentName?: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  gradeLevel: number;
  semester: string;
  action: ChangeRequestAction;
  status: ChangeRequestStatus;
  studentNote?: string;
  counselorNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface CourseChangeRequestPayload {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  gradeLevel: number;
  semester: string;
  action: ChangeRequestAction;
  studentNote?: string;
}

export interface ChangeRequestReviewPayload {
  status: "approved" | "rejected";
  counselorNote?: string;
}

export interface CourseChangeRequestsResponse {
  data: CourseChangeRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
