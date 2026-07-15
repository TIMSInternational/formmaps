import { apiRequest } from "@/lib/api/apiClient";

// School-admin Gradebook — per-student overall grade CRUD.
// Backend: /api/v1/school-admin/gradebook/* (school-scoped).

export interface GradebookGrade {
  id: string;
  courseId: string;
  courseCode: string | null;
  grade: string | null;
  credits: number | string;
  courseLevel: string | null;
  semester: string | null;
  academicYear: string | null;
  status: string;
}

export interface StudentGradebook {
  byYear: Record<string, GradebookGrade[]>;
  gpaUnweighted: number | null;
  gpaWeighted: number | null;
  totalCredits: number;
}

export interface GradeInput {
  studentId?: string;
  courseId?: string;
  courseCode?: string;
  grade: string;
  credits?: number;
  semester?: string | null;
  academicYear?: string | null;
  courseLevel?: string | null;
}

export async function getStudentGradebook(studentId: string): Promise<StudentGradebook> {
  const res = await apiRequest(`/api/v1/school-admin/gradebook/students/${studentId}`, { method: "GET" });
  return (res?.data ?? res) as StudentGradebook;
}

export async function createGrade(input: GradeInput): Promise<GradebookGrade> {
  const res = await apiRequest("/api/v1/school-admin/gradebook/grades", { method: "POST", data: input });
  return (res?.data ?? res) as GradebookGrade;
}

export async function updateGrade(gradeId: string, input: Partial<GradeInput>): Promise<GradebookGrade> {
  const res = await apiRequest(`/api/v1/school-admin/gradebook/grades/${gradeId}`, { method: "PUT", data: input });
  return (res?.data ?? res) as GradebookGrade;
}

export async function deleteGrade(gradeId: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/gradebook/grades/${gradeId}`, { method: "DELETE" });
}
