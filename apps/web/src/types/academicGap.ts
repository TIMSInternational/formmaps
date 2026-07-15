// ============================================
// Academic Gap Analysis Types (SCRUM-139)
// ============================================

export type GapSeverity = "critical" | "warning" | "info";
export type GapUrgency = "high" | "medium" | "low";
export type StudentAcademicStatus = "on_track" | "at_risk" | "off_track";

export interface CreditGap {
  category: string;
  creditsEarned: number;
  creditsRequired: number;
  deficit: number;
  severity: GapSeverity;
  recommendation: string;
}

export interface CourseGap {
  courseCode: string;
  courseName: string;
  category: string;
  reason: string;
  suggestedSemester: string;
  urgency: GapUrgency;
}

export interface PaceGap {
  metric: string;
  current: number;
  required: number;
  status: "ahead" | "on_pace" | "behind";
  message: string;
}

export interface CareerGap {
  careerPath: string;
  missingSkills: string[];
  recommendedCourses: string[];
}

export interface PrioritizedRecommendation {
  priority: number;
  type: string;
  action: string;
  impact: string;
  urgency: GapUrgency;
}

export interface StudentAcademicGaps {
  studentId: string;
  analysisDate: string;
  graduationTarget: string;
  overallStatus: StudentAcademicStatus;
  creditGaps: CreditGap[];
  courseGaps: CourseGap[];
  paceGaps: PaceGap[];
  careerGaps: CareerGap[];
  prioritizedRecommendations: PrioritizedRecommendation[];
}

export interface AcademicGapSummaryItem {
  studentId: string;
  studentName: string;
  gradeLevel: number | null;
  overallStatus: StudentAcademicStatus;
  creditDeficit: number;
  missingRequiredCourses: number;
  creditsEarned: number;
  creditsRequired: number;
  progressPercent: number;
  topGap: string;
}

export interface AcademicGapSummary {
  summary: {
    totalStudents: number;
    onTrack: number;
    atRisk: number;
    offTrack: number;
  };
  data: AcademicGapSummaryItem[];
}

// ============================================
// AI Course Recommendation Types (SCRUM-140)
// ============================================

export interface CourseRecommendation {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  reason: string;
  priority: GapUrgency;
  source: "career_alignment" | "graduation_requirement" | "assessment_based";
  suggestedGrade?: number;
}

export interface CourseRecommendationsResponse {
  studentId: string;
  generatedAt: string;
  nextSemester: CourseRecommendation[];
  longTerm: CourseRecommendation[];
  reasoning: string;
}
