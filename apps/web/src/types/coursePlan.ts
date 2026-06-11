// ============================================
// Student Course Plan Types (Student-facing trajectory)
// ============================================

export type CourseEnrollmentStatus = "completed" | "in_progress" | "planned" | "dropped" | "pending_add" | "pending_remove" | "draft_proposed";

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

// GET /student/course-plan/recommendations actually returns scored GLOBAL
// courses (Course model) and, until assessments are done, a locked envelope.
export interface GlobalCourseRecommendation {
  id: string;
  title: string;
  shortDescription?: string | null;
  category?: string | null;
  provider?: string | null;
  rating?: number | string | null;
  matchScore: number;
}

export interface MyCourseRecommendationsResponse {
  data: GlobalCourseRecommendation[];
  locked: boolean;
  completion?: import("./graduationPlan").AssessmentCompletion;
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
