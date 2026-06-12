// Shared local types for the student course-plan page sections.

export interface SchoolCourse {
  id: string;
  code: string;
  name: string;
  department?: string;
  credits?: string | number;
  gradeLevels?: number[];
  isHonors?: boolean;
}

export interface PlanEnrollment {
  id: string;
  courseId: string;
  term?: string | null;
  status: string;
}
