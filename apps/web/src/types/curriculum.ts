// ============================================
// Curriculum Framework Types (SCRUM-131)
// ============================================

export type FrameworkType = "AP" | "IB" | "NATIONAL" | "CUSTOM";

export interface CurriculumFramework {
  id: string;
  type: FrameworkType;
  label: string;
  enabled: boolean;
  courseCount: number;
  configuredAt: string | null;
}

export interface FrameworkCourse {
  id: string;
  code: string;
  name: string;
  frameworkType: FrameworkType;
  department: string;
  credits: number;
  gradeLevel: number[];
  description?: string;
  isCustomized: boolean;
}

export interface FrameworkCourseOverride {
  credits?: number;
  gradeLevel?: number[];
  localName?: string;
}

export interface FrameworkTogglePayload {
  frameworks: { type: FrameworkType; enabled: boolean }[];
}

export interface FrameworkCoursesResponse {
  data: FrameworkCourse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// School Course Types (SCRUM-135)
// ============================================

export type CourseStatus = "active" | "inactive" | "archived";

export interface SchoolCourse {
  id: string;
  code: string;
  name: string;
  department: string;
  credits: number;
  gradeLevels: number[];
  prerequisites: string[];
  corequisites?: string[];
  frameworkType?: FrameworkType;
  description?: string;
  enrollmentCount: number;
  status: CourseStatus;
}

export interface SchoolCoursePayload {
  code: string;
  name: string;
  department: string;
  credits: number;
  gradeLevels: number[];
  prerequisites?: string[];
  corequisites?: string[];
  frameworkType?: FrameworkType;
  description?: string;
}

export interface SchoolCoursesResponse {
  data: SchoolCourse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CourseImportResult {
  success: boolean;
  jobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  validationErrors: { row: number; message: string }[];
}

// ============================================
// Prerequisite Types (SCRUM-137)
// ============================================

export type PrerequisiteRuleType = "AND" | "OR";

export interface PrerequisiteRule {
  type: PrerequisiteRuleType;
  courseIds: string[];
}

export interface PrerequisitePayload {
  prerequisiteRules: PrerequisiteRule[];
  corequisites: string[];
}

export interface PrerequisiteCheckResult {
  courseId: string;
  studentId: string;
  eligible: boolean;
  requirements: {
    type: PrerequisiteRuleType;
    courses: { code: string; name: string; completed: boolean }[];
    satisfied: boolean;
  }[];
  corequisites: { code: string; name: string; enrolled: boolean }[];
}

export interface PrerequisiteChain {
  courseId: string;
  courseName: string;
  chain: {
    level: number;
    courses: { code: string; name: string; type?: PrerequisiteRuleType }[];
  }[];
}

// ============================================
// Course Sequence Types (SCRUM-138)
// ============================================

export interface CourseSequenceNode {
  id: string;
  type: string;
  data: {
    courseId: string;
    courseCode: string;
    courseName: string;
    credits: number;
    gradeLevel: number;
    semester: string;
    status: "required" | "elective" | "recommended";
  };
  position: { x: number; y: number };
}

export interface CourseSequenceEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated?: boolean;
}

export interface CourseSequence {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  studentCount: number;
  lastModified: string;
}

export interface CourseSequenceDetail extends CourseSequence {
  nodes: CourseSequenceNode[];
  edges: CourseSequenceEdge[];
  columns: { gradeLevel: number; label: string }[];
}

export interface CourseSequencePayload {
  name: string;
  description?: string;
  nodes: CourseSequenceNode[];
  edges: CourseSequenceEdge[];
  columns: { gradeLevel: number; label: string }[];
}

export interface CourseSequencesResponse {
  data: CourseSequence[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// AI Course Recognition Types (SCRUM-136)
// ============================================

export interface AISuggestion {
  equivalentCode: string;
  equivalentName: string;
  frameworkType: FrameworkType;
  confidenceScore: number;
  reasoning: string;
  matchedTopics?: string[];
}

export interface AIRecognitionResult {
  courseId: string;
  courseName: string;
  courseCode: string;
  suggestions: AISuggestion[];
}

export interface AIRecognitionResponse {
  results: AIRecognitionResult[];
}

export interface AIMappingAction {
  equivalentCode: string;
  frameworkType: FrameworkType;
  action: "approve" | "reject";
  counselorNotes?: string;
}
