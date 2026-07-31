import { apiRequest } from "@/lib/api/apiClient";

// Types
export interface AssessmentSchedule {
  id: string;
  schoolId: string;
  gradeLevel: number;
  assessmentType: string;
  startDate: string;
  endDate: string;
}

export interface PipelineStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel: number | null;
  pca: Record<string, "done" | "in_progress" | "not_started">;
  mil: "done" | "in_progress" | "not_started";
  eval360: "done" | "in_progress" | "not_started";
  eval360Detail: { total: number; completed: number };
  personality: "done" | "not_started";
}

export interface InsightsData {
  hasEnoughData: boolean;
  message?: string;
  completion?: {
    total: number;
    complete: number;
    byComponent: { lia: number; disc: number; eval360: number };
  };
  aggregates?: {
    totalStudents: number;
    profilesComplete: number;
    pcaAverages: Record<string, number>;
    discDistribution: { D: number; I: number; S: number; C: number };
    milAverages: Record<string, number> | null;
    topCareerClusters: { name: string; count: number }[];
    eval360Count: number;
  };
  narrative?: string;
  cached?: boolean;
}

// API calls
export async function getSchedules(): Promise<AssessmentSchedule[]> {
  const res = await apiRequest("/api/v1/school-admin/assessments/schedule");
  return (res.data ?? res) as AssessmentSchedule[];
}

export async function saveSchedules(schedules: { gradeLevel: number; assessmentType: string; startDate: string; endDate: string }[]) {
  const res = await apiRequest("/api/v1/school-admin/assessments/schedule", { method: "PUT", data: { schedules } });
  return res.data ?? res;
}

export async function getPipeline(grade?: number, status?: string): Promise<PipelineStudent[]> {
  const params = new URLSearchParams();
  if (grade) params.set("grade", String(grade));
  if (status) params.set("status", status);
  const res = await apiRequest(`/api/v1/school-admin/assessments/pipeline?${params}`);
  return (res.data ?? res) as PipelineStudent[];
}

export async function sendReminders(studentIds: string[], assessmentTypes: string[]) {
  const res = await apiRequest("/api/v1/school-admin/assessments/send-reminders", {
    method: "POST", data: { studentIds, assessmentTypes },
  });
  return res.data ?? res;
}

export async function setup360(studentIds?: string[], gradeLevel?: number) {
  const res = await apiRequest("/api/v1/school-admin/assessments/setup-360", {
    method: "POST", data: { studentIds, gradeLevel },
  });
  return res.data ?? res;
}

export async function getInsights(refresh = false): Promise<InsightsData> {
  const res = await apiRequest(`/api/v1/school-admin/assessments/insights${refresh ? "?refresh=true" : ""}`);
  return (res.data ?? res) as InsightsData;
}
