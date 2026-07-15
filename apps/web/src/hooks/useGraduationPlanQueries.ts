"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGraduationTarget,
  setGraduationTarget,
  generateGraduationPlan,
  getMyGraduationPlan,
  submitGraduationPlan,
  discardGraduationDraft,
  getSupplementalCourses,
  getStudentGraduationPlan,
  counselorGenerateGraduationPlan,
  reviewGraduationPlan,
  getChildCoursePlan,
} from "@/services/graduationPlanService";
import { coursePlanKeys } from "@/hooks/useCoursePlanQueries";
import {
  getPlanErrorCode,
  isLockedResult,
  type SetGraduationTargetPayload,
  type ReviewGraduationPlanPayload,
} from "@/types/graduationPlan";

export const graduationPlanKeys = {
  all: ["graduation-plan"] as const,
  target: () => [...graduationPlanKeys.all, "target"] as const,
  myPlan: () => [...graduationPlanKeys.all, "my-plan"] as const,
  supplemental: () => [...graduationPlanKeys.all, "supplemental"] as const,
  studentPlan: (studentId: string) =>
    [...graduationPlanKeys.all, "student", studentId] as const,
  childPlan: (studentId: string) =>
    [...graduationPlanKeys.all, "child", studentId] as const,
};

const PLAN_ERROR_COPY: Record<string, string> = {
  NO_TARGET: "Pick a graduation goal first.",
  NO_SCHOOL: "Graduation plans need a school account.",
  NO_CURRENT_YEAR: "Your school hasn't opened the current academic year yet.",
  NO_RULESET: "Your school hasn't published its graduation requirements yet.",
  NO_CATALOG: "Your school hasn't published its course catalog yet.",
  PLAN_PROPOSED: "Your plan is already with your counselor — regenerating will replace it.",
  NO_DRAFT: "There's no draft plan to act on.",
};

function planErrorMessage(err: unknown, fallback: string): string {
  const code = getPlanErrorCode(err);
  return (code && PLAN_ERROR_COPY[code]) || fallback;
}

// ─── Student ─────────────────────────────────────────────────────────────────

export function useGraduationTarget() {
  return useQuery({
    queryKey: graduationPlanKeys.target(),
    queryFn: getGraduationTarget,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetGraduationTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetGraduationTargetPayload) => setGraduationTarget(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.target() });
      qc.invalidateQueries({ queryKey: graduationPlanKeys.supplemental() });
      toast.success("Graduation goal saved");
    },
    onError: () => toast.error("Failed to save your goal"),
  });
}

export function useGenerateGraduationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) => generateGraduationPlan(opts),
    onSuccess: (result) => {
      if (isLockedResult(result)) {
        toast.info("Complete your assessments to unlock plan generation");
        return;
      }
      qc.invalidateQueries({ queryKey: graduationPlanKeys.all });
      toast.success("Draft plan generated");
    },
    onError: (err) => toast.error(planErrorMessage(err, "Failed to generate a plan")),
  });
}

export function useMyGraduationPlan() {
  return useQuery({
    queryKey: graduationPlanKeys.myPlan(),
    queryFn: getMyGraduationPlan,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitGraduationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitGraduationPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.myPlan() });
      toast.success("Plan sent to your counselor for review");
    },
    onError: (err) => toast.error(planErrorMessage(err, "Failed to submit your plan")),
  });
}

export function useDiscardGraduationDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: discardGraduationDraft,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.myPlan() });
      toast.success("Draft discarded");
    },
    onError: () => toast.error("Failed to discard the draft"),
  });
}

export function useSupplementalCourses(enabled = true) {
  return useQuery({
    queryKey: graduationPlanKeys.supplemental(),
    queryFn: getSupplementalCourses,
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Counselor ───────────────────────────────────────────────────────────────

export function useStudentGraduationPlan(studentId?: string) {
  return useQuery({
    queryKey: graduationPlanKeys.studentPlan(studentId ?? ""),
    queryFn: () => getStudentGraduationPlan(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCounselorGeneratePlan(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) =>
      counselorGenerateGraduationPlan(studentId, opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.studentPlan(studentId) });
      toast.success("Draft plan generated for student");
    },
    onError: (err) => toast.error(planErrorMessage(err, "Failed to generate a plan")),
  });
}

export function useReviewGraduationPlan(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReviewGraduationPlanPayload) =>
      reviewGraduationPlan(studentId, payload),
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.studentPlan(studentId) });
      // Approval materializes current-grade rows into the official course plan.
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success(payload.status === "approved" ? "Plan approved" : "Plan rejected");
    },
    onError: () => toast.error("Failed to review the plan"),
  });
}

// ─── Parent ──────────────────────────────────────────────────────────────────

export function useChildCoursePlan(studentId?: string) {
  return useQuery({
    queryKey: graduationPlanKeys.childPlan(studentId ?? ""),
    queryFn: () => getChildCoursePlan(studentId!),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}
