"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGraduationRules,
  createGraduationRules,
  updateGraduationRules,
  getStudentGraduationProgress,
  getAllGraduationProgress,
} from "@/services/graduationService";
import type { GraduationRuleSet } from "@/types/graduation";

// ============================================
// Query Keys
// ============================================

export const graduationKeys = {
  all: ["graduation"] as const,
  rules: () => [...graduationKeys.all, "rules"] as const,
  progress: () => [...graduationKeys.all, "progress"] as const,
  studentProgress: (studentId: string) =>
    [...graduationKeys.progress(), "student", studentId] as const,
  progressList: (params?: object) =>
    [...graduationKeys.progress(), "list", params] as const,
};

// ============================================
// Rules Hooks (SCRUM-132)
// ============================================

export function useGraduationRules() {
  return useQuery({
    queryKey: graduationKeys.rules(),
    queryFn: getGraduationRules,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateGraduationRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GraduationRuleSet) => createGraduationRules(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graduationKeys.rules() });
    },
  });
}

export function useUpdateGraduationRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ruleSetId,
      payload,
    }: {
      ruleSetId: string;
      payload: Partial<GraduationRuleSet>;
    }) => updateGraduationRules(ruleSetId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graduationKeys.rules() });
      queryClient.invalidateQueries({ queryKey: graduationKeys.progress() });
    },
  });
}

// ============================================
// Progress Hooks
// ============================================

export function useStudentGraduationProgress(studentId: string) {
  return useQuery({
    queryKey: graduationKeys.studentProgress(studentId),
    queryFn: () => getStudentGraduationProgress(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAllGraduationProgress(params?: {
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
}) {
  return useQuery({
    queryKey: graduationKeys.progressList(params),
    queryFn: () => getAllGraduationProgress(params),
    staleTime: 1000 * 60 * 5,
  });
}
