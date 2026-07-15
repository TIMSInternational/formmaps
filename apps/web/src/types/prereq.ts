// Prerequisite analysis + eligibility types (mirrors api prereq-analysis-service / computeEligibilityMap)

export interface PrereqSuggestion {
  courseId: string;
  courseCode: string;
  prerequisiteCode: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "pattern" | "ai";
}

export interface PrereqApplyUpdate {
  courseId: string;
  addPrerequisites: string[];
}

export interface CourseEligibility {
  courseId: string;
  courseCode: string;
  eligible: boolean;
  missing: string[];
}
