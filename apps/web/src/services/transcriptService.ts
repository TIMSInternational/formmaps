import { apiRequest } from "@/lib/api/apiClient";

export interface StudentGpa {
  gpaUnweighted: number | null;
  gpaWeighted: number | null;
  totalCredits: number;
  classRank: number | null;
  classSize: number | null;
  rankPercentile: number | null;
  yearlyBreakdown: Record<string, { unweighted: number; weighted: number; credits: number }>;
  computedAt: string;
}

export interface TranscriptData {
  grades: Record<string, Array<{
    id: string;
    courseId: string;
    courseCode: string | null;
    grade: string | null;
    credits: number;
    courseLevel: string | null;
    semester: string | null;
    status: string;
  }>>;
  gpa: StudentGpa | null;
}

export interface GpaConfig {
  id: string;
  schoolId: string;
  scale: number;
  unweightedMap: Record<string, number>;
  weightBonuses: Record<string, number>;
}

export async function getTranscript(): Promise<TranscriptData> {
  const res = await apiRequest("/api/v1/transcript", { method: "GET" });
  return res?.data ?? res;
}

export async function getGpa(): Promise<StudentGpa | null> {
  const res = await apiRequest("/api/v1/transcript/gpa", { method: "GET" });
  return res?.data ?? res;
}

export async function computeGpa(): Promise<StudentGpa> {
  const res = await apiRequest("/api/v1/transcript/compute-gpa", { method: "POST" });
  return res?.data ?? res;
}

export async function getStudentTranscript(studentId: string): Promise<TranscriptData> {
  const res = await apiRequest(`/api/v1/transcript/students/${studentId}/transcript`, { method: "GET" });
  return res?.data ?? res;
}

export async function getStudentGpa(studentId: string): Promise<StudentGpa | null> {
  const res = await apiRequest(`/api/v1/transcript/students/${studentId}/gpa`, { method: "GET" });
  return res?.data ?? res;
}

export async function getGpaConfig(): Promise<GpaConfig | null> {
  const res = await apiRequest("/api/v1/transcript/school-admin/gpa-config", { method: "GET" });
  return res?.data ?? res;
}

export async function updateGpaConfig(config: Partial<GpaConfig>): Promise<GpaConfig> {
  const res = await apiRequest("/api/v1/transcript/school-admin/gpa-config", { method: "PUT", data: config });
  return res?.data ?? res;
}

export async function computeClassRanks(): Promise<{ updated: number }> {
  const res = await apiRequest("/api/v1/transcript/school-admin/class-ranks", { method: "POST" });
  return res?.data ?? res;
}
