"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAssessmentConfig,
  updateAssessmentConfig,
  getAssessmentStatus,
} from "@/services/assessmentConfigService";
import type { AssessmentConfigPayload } from "@/types/assessmentConfig";

// ============================================
// Query Keys
// ============================================

export const assessmentConfigKeys = {
  all: ["assessment-config"] as const,
  config: () => [...assessmentConfigKeys.all, "config"] as const,
  status: () => [...assessmentConfigKeys.all, "status"] as const,
};

// ============================================
// Assessment Config Hooks (SCRUM-143)
// ============================================

export function useAssessmentConfig() {
  return useQuery({
    queryKey: assessmentConfigKeys.config(),
    queryFn: getAssessmentConfig,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });
}

export function useUpdateAssessmentConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssessmentConfigPayload) => updateAssessmentConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assessmentConfigKeys.config() });
      queryClient.invalidateQueries({ queryKey: assessmentConfigKeys.status() });
    },
  });
}

export function useAssessmentStatus() {
  return useQuery({
    queryKey: assessmentConfigKeys.status(),
    queryFn: getAssessmentStatus,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
