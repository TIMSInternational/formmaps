// ============================================
// Graduation Rules Types (SCRUM-132)
// ============================================

export type SpecialRequirementType = "hours" | "completion" | "assessment" | "custom";
export type ProgressStatus = "completed" | "in_progress" | "not_started";
export type TrackStatus = "on_track" | "at_risk" | "off_track";

export interface CategoryRequirement {
  id?: string;
  category: string;
  minCredits: number;
  requiredCourses: string[];
  electivesAllowed: boolean;
}

export interface SpecialRequirement {
  id?: string;
  name: string;
  type: SpecialRequirementType;
  value: number;
  unit: string;
  description: string;
}

export interface GraduationRuleSet {
  schoolId: string;
  academicYearId: string;
  totalCreditsRequired: number;
  categoryRequirements: CategoryRequirement[];
  specialRequirements: SpecialRequirement[];
}

export interface GraduationRuleSetWithId extends GraduationRuleSet {
  id: string;
}

export interface CategoryProgress {
  category: string;
  creditsEarned: number;
  creditsRequired: number;
  progress: number;
  completedCourses: string[];
  remainingRequired: string[];
  status: ProgressStatus;
}

export interface SpecialRequirementProgress {
  name: string;
  completed: number;
  required: number;
  progress: number;
  completedItems?: string[];
  remainingItems?: string[];
  status: ProgressStatus;
}

export interface StudentGraduationProgress {
  studentId: string;
  studentName: string;
  ruleSetId: string;
  totalCreditsEarned: number;
  totalCreditsRequired: number;
  overallProgress: number;
  onTrack: boolean;
  expectedGraduation: string;
  categoryProgress: CategoryProgress[];
  specialRequirementProgress: SpecialRequirementProgress[];
}

export interface GraduationProgressSummary {
  studentId: string;
  studentName: string;
  overallStatus: TrackStatus;
  creditDeficit: number;
  missingRequiredCourses: number;
  topGap: string;
}

export interface GraduationProgressResponse {
  data: GraduationProgressSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
