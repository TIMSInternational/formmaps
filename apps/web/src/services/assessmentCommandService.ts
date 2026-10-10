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

/** Both backends accept at most 100 students per reminder / 360-setup request. */
export const ASSESSMENT_COMMAND_BATCH = 100;

/**
 * audit 2026-10-09 D4: selecting more than 100 students used to send one request the API refused ("Maximum 100
 * students per batch"), shown as a generic error. The selection now goes in batches of 100 and the per-batch
 * counts are added up, so the caller sees one result for the whole selection.
 */
async function postInBatches<T extends Record<string, number>>(path: string, studentIds: string[], extra: Record<string, unknown>): Promise<T> {
  const totals: Record<string, number> = {};
  for (let i = 0; i < studentIds.length; i += ASSESSMENT_COMMAND_BATCH) {
    const res = await apiRequest(path, {
      method: "POST", data: { ...extra, studentIds: studentIds.slice(i, i + ASSESSMENT_COMMAND_BATCH) },
    });
    const data = (res?.data ?? res) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data ?? {})) {
      if (typeof value === "number") totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return totals as T;
}

export async function sendReminders(studentIds: string[], assessmentTypes: string[]) {
  return postInBatches<{ sent: number; failed: number; total: number }>("/api/v1/school-admin/assessments/send-reminders", studentIds, { assessmentTypes });
}

export async function setup360(studentIds?: string[], gradeLevel?: number) {
  if (!studentIds?.length) {
    // A whole grade is resolved on the server, which has no per-request limit for it.
    const res = await apiRequest("/api/v1/school-admin/assessments/setup-360", {
      method: "POST", data: { studentIds, gradeLevel },
    });
    return res.data ?? res;
  }
  return postInBatches<{ created: number; skipped: number; emailsSent: number; studentsProcessed: number }>("/api/v1/school-admin/assessments/setup-360", studentIds, { gradeLevel });
}

export async function getInsights(refresh = false): Promise<InsightsData> {
  const res = await apiRequest(`/api/v1/school-admin/assessments/insights${refresh ? "?refresh=true" : ""}`);
  return (res.data ?? res) as InsightsData;
}
