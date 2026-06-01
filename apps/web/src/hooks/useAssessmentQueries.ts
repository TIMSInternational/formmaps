"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserAssessmentProgress,
  getDashboardAssessmentSummary,
  AssessmentOverallProgress,
} from "@/services/assessmentProgressService";
import {
  getUserExamHistory,
  getAllUserExamResults,
} from "@/services/milService";
import { getUserEvaluationGroups } from "@/services/evaluationService";
import { useGlobalStore } from "@/store/useGlobalStore";

// Query Keys
export const assessmentKeys = {
  all: ["assessments"] as const,
  progress: (userId: string) =>
    [...assessmentKeys.all, "progress", userId] as const,
  dashboardSummary: (userId: string) =>
    [...assessmentKeys.all, "dashboard-summary", userId] as const,
  milHistory: (userId: string) =>
    [...assessmentKeys.all, "mil-history", userId] as const,
  milResults: () => [...assessmentKeys.all, "mil-results"] as const,
  evaluationGroups: (userId: string) =>
    [...assessmentKeys.all, "evaluation-groups", userId] as const,
  enhancedLIA: (userId: string) =>
    [...assessmentKeys.all, "enhanced-lia", userId] as const,
};

// Assessment Progress Hook
export function useAssessmentProgress(userId: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.progress(userId),
    queryFn: () => getUserAssessmentProgress(userId, language),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}

// Dashboard Assessment Summary Hook
export function useDashboardAssessmentSummary(userId: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.dashboardSummary(userId),
    queryFn: () => getDashboardAssessmentSummary(userId, language),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}

// MIL History Hook
export function useMILHistory(userId: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.milHistory(userId),
    queryFn: () => getUserExamHistory(userId, language),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// All MIL Results Hook
export function useAllMILResults() {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.milResults(),
    queryFn: () => getAllUserExamResults(language),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Evaluation Groups Hook
export function useEvaluationGroups(userId: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.evaluationGroups(userId),
    queryFn: () => getUserEvaluationGroups(userId, language),
    enabled: !!userId,
    staleTime: 3 * 60 * 1000, // 3 minutes
  });
}

// Enhanced LIA Data Hook
export function useEnhancedLIAData(userId: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: assessmentKeys.enhancedLIA(userId),
    queryFn: () => getUserExamHistory(userId, language),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1, // Enhanced data might not always be available
  });
}

// Invalidation helpers
export function useInvalidateAssessments() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: assessmentKeys.all }),
    invalidateProgress: (userId: string) => {
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.progress(userId),
      });
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.dashboardSummary(userId),
      });
    },
    invalidateMILData: (userId: string) => {
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.milHistory(userId),
      });
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.enhancedLIA(userId),
      });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milResults() });
      // Also invalidate progress when MIL data changes
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.progress(userId),
      });
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.dashboardSummary(userId),
      });
    },
    invalidateEvaluations: (userId: string) => {
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.evaluationGroups(userId),
      });
      // Also invalidate progress when evaluation data changes
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.progress(userId),
      });
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.dashboardSummary(userId),
      });
    },
    // Selective invalidation for specific assessment types
    invalidateAssessmentType: (
      userId: string,
      type: "mil" | "evaluation" | "pca"
    ) => {
      if (type === "mil") {
        queryClient.invalidateQueries({
          queryKey: assessmentKeys.milHistory(userId),
        });
        queryClient.invalidateQueries({
          queryKey: assessmentKeys.enhancedLIA(userId),
        });
        queryClient.invalidateQueries({
          queryKey: assessmentKeys.milResults(),
        });
      } else if (type === "evaluation") {
        queryClient.invalidateQueries({
          queryKey: assessmentKeys.evaluationGroups(userId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.progress(userId),
      });
      queryClient.invalidateQueries({
        queryKey: assessmentKeys.dashboardSummary(userId),
      });
    },
  };
}

// Prefetch helpers
export function usePrefetchAssessments() {
  const queryClient = useQueryClient();
  const { language } = useGlobalStore();

  return {
    prefetchProgress: (userId: string) =>
      queryClient.prefetchQuery({
        queryKey: assessmentKeys.progress(userId),
        queryFn: () => getUserAssessmentProgress(userId, language),
        staleTime: 2 * 60 * 1000,
      }),
    prefetchMILHistory: (userId: string) =>
      queryClient.prefetchQuery({
        queryKey: assessmentKeys.milHistory(userId),
        queryFn: () => getUserExamHistory(userId, language),
        staleTime: 5 * 60 * 1000,
      }),
  };
}
