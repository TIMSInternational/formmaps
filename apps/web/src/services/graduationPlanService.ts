import { apiRequest } from "@/lib/api/apiClient";
import type {
  GraduationTarget,
  SetGraduationTargetPayload,
  GraduationPlan,
  GenerateGraduationPlanResult,
  SupplementalCourse,
  StudentGraduationPlanResponse,
  ReviewGraduationPlanPayload,
  ChildCoursePlanResponse,
} from "@/types/graduationPlan";

// ─── Student ─────────────────────────────────────────────────────────────────

export async function getGraduationTarget(): Promise<GraduationTarget | null> {
  const json = await apiRequest("/api/v1/student/graduation-plan/target");
  return json.data ?? null;
}

export async function setGraduationTarget(
  payload: SetGraduationTargetPayload,
): Promise<GraduationTarget> {
  const json = await apiRequest("/api/v1/student/graduation-plan/target", {
    method: "PUT",
    data: payload,
  });
  return json.data ?? json;
}

export async function generateGraduationPlan(opts?: {
  force?: boolean;
}): Promise<GenerateGraduationPlanResult> {
  const path = opts?.force
    ? "/api/v1/student/graduation-plan/generate?force=true"
    : "/api/v1/student/graduation-plan/generate";
  const json = await apiRequest(path, { method: "POST" });
  return json.data ?? json;
}

export async function getMyGraduationPlan(): Promise<GraduationPlan | null> {
  const json = await apiRequest("/api/v1/student/graduation-plan");
  return json.data ?? null;
}

export async function submitGraduationPlan(): Promise<GraduationPlan> {
  const json = await apiRequest("/api/v1/student/graduation-plan/submit", {
    method: "POST",
  });
  return json.data ?? json;
}

export async function discardGraduationDraft(): Promise<void> {
  await apiRequest("/api/v1/student/graduation-plan", { method: "DELETE" });
}

export async function getSupplementalCourses(): Promise<SupplementalCourse[]> {
  const json = await apiRequest("/api/v1/student/graduation-plan/supplemental");
  const items = json.data ?? json;
  return Array.isArray(items) ? items : [];
}

// ─── Counselor (assignment-gated; unassigned students 404) ──────────────────

export async function getStudentGraduationPlan(
  studentId: string,
): Promise<StudentGraduationPlanResponse> {
  const json = await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/graduation-plan`,
  );
  return json.data ?? json;
}

export async function counselorGenerateGraduationPlan(
  studentId: string,
  opts?: { force?: boolean },
): Promise<GraduationPlan> {
  const path = opts?.force
    ? `/api/v1/counselor/me/students/${studentId}/graduation-plan/generate?force=true`
    : `/api/v1/counselor/me/students/${studentId}/graduation-plan/generate`;
  const json = await apiRequest(path, { method: "POST" });
  return json.data ?? json;
}

export async function reviewGraduationPlan(
  studentId: string,
  payload: ReviewGraduationPlanPayload,
): Promise<GraduationPlan> {
  const json = await apiRequest(
    `/api/v1/counselor/me/students/${studentId}/graduation-plan/review`,
    { method: "PUT", data: payload },
  );
  return json.data ?? json;
}

// ─── Parent ──────────────────────────────────────────────────────────────────

export async function getChildCoursePlan(
  studentId: string,
): Promise<ChildCoursePlanResponse> {
  const json = await apiRequest(`/api/v1/parent/children/${studentId}/course-plan`);
  return json.data ?? json;
}
