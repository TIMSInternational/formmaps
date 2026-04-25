// ============================================
// Academic Calendar Types (SCRUM-133)
// ============================================

export type HolidayType = "national" | "school" | "custom";
export type AssessmentType = "MIL" | "PCA" | "360" | "TIMS";

export interface AcademicTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sortOrder?: number;
}

export interface AcademicTermPayload {
  name: string;
  startDate: string;
  endDate: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: AcademicTerm[];
}

export interface AcademicYearPayload {
  name: string;
  startDate: string;
  endDate: string;
  terms: AcademicTermPayload[];
}

export interface AssessmentPeriod {
  id: string;
  name: string;
  termId: string;
  startDate: string;
  endDate: string;
  assessmentTypes: AssessmentType[];
}

export interface AssessmentPeriodPayload {
  name: string;
  termId: string;
  startDate: string;
  endDate: string;
  assessmentTypes: AssessmentType[];
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: HolidayType;
}

export interface HolidayPayload {
  holidays: { name: string; date: string; type: HolidayType }[];
}
