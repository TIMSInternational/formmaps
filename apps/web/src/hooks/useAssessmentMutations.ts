'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assessmentKeys, useInvalidateAssessments } from './useAssessmentQueries';
import {
  invalidateOnAssessmentStart,
  invalidateOnAssessmentComplete,
  invalidateOnProgressUpdate,
  invalidateOnEvaluationInvite,
  optimisticUpdateAssessmentStatus,
  CacheInvalidationOptions
} from '@/utils/assessmentCacheUtils';

// Assessment completion mutation
export function useCompleteAssessment() {
  const queryClient = useQueryClient();
  const { invalidateAll, invalidateProgress } = useInvalidateAssessments();

  return useMutation({
    mutationFn: async ({ userId, assessmentType }: { userId: string; assessmentType: 'mil' | 'evaluation' | 'pca' }) => {
      // This would typically call an API to mark assessment as complete
      // For now, we'll just invalidate the cache
      return { userId, assessmentType };
    },
    onMutate: async ({ userId, assessmentType }) => {
      // Optimistic update
      optimisticUpdateAssessmentStatus(
        queryClient,
        userId,
        assessmentType,
        'completed'
      );
    },
    onSuccess: ({ userId, assessmentType }) => {
      // Use cache utility for efficient invalidation
      invalidateOnAssessmentComplete(queryClient, {
        userId,
        assessmentType,
        refetch: true
      });
    },
    onError: (error, { userId }) => {
      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    },
  });
}

// Assessment start mutation
export function useStartAssessment() {
  const queryClient = useQueryClient();
  const { invalidateProgress } = useInvalidateAssessments();

  return useMutation({
    mutationFn: async ({ userId, assessmentType }: { userId: string; assessmentType: 'mil' | 'evaluation' | 'pca' }) => {
      // This would typically call an API to start assessment
      return { userId, assessmentType };
    },
    onMutate: async ({ userId, assessmentType }) => {
      // Optimistic update
      optimisticUpdateAssessmentStatus(
        queryClient,
        userId,
        assessmentType,
        'in_progress'
      );
    },
    onSuccess: ({ userId, assessmentType }) => {
      // Use cache utility for efficient invalidation
      invalidateOnAssessmentStart(queryClient, {
        userId,
        assessmentType,
        immediate: true
      });
    },
    onError: (error, { userId }) => {
      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    },
  });
}

// Assessment update mutation (for progress updates)
export function useUpdateAssessmentProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, assessmentType, progressData }: { 
      userId: string; 
      assessmentType: 'mil' | 'evaluation' | 'pca';
      progressData: Record<string, unknown>;
    }) => {
      // This would typically call an API to update progress
      return { userId, assessmentType, progressData };
    },
    onSuccess: ({ userId, assessmentType }) => {
      // Use cache utility for efficient invalidation
      invalidateOnProgressUpdate(queryClient, {
        userId,
        assessmentType
      });
    },
    onError: (error) => {
    },
  });
}

// Global cache refresh mutation
export function useRefreshAssessmentData() {
  const { invalidateAll } = useInvalidateAssessments();

  return useMutation({
    mutationFn: async () => {
      // Force refresh all assessment data
      return true;
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: (error) => {
    },
  });
}

// Optimistic update helpers
export function useOptimisticAssessmentUpdate() {
  const queryClient = useQueryClient();

  const updateAssessmentStatus = (userId: string, assessmentType: string, newStatus: string) => {
    // Optimistically update dashboard summary
    queryClient.setQueryData(
      assessmentKeys.dashboardSummary(userId),
      (oldData: unknown) => {
        const data = oldData as { assessments?: { type: string; status: string }[] } | undefined;
        if (!data?.assessments) return oldData;

        return {
          ...data,
          assessments: data.assessments.map((assessment) =>
            assessment.type === assessmentType
              ? { ...assessment, status: newStatus }
              : assessment
          ),
        };
      }
    );
  };

  const updateAssessmentCompletion = (userId: string, assessmentType: string, completion: number) => {
    queryClient.setQueryData(
      assessmentKeys.dashboardSummary(userId),
      (oldData: unknown) => {
        const data = oldData as { assessments?: { type: string; completion: number }[] } | undefined;
        if (!data?.assessments) return oldData;

        return {
          ...data,
          assessments: data.assessments.map((assessment) =>
            assessment.type === assessmentType
              ? { ...assessment, completion }
              : assessment
          ),
        };
      }
    );
  };

  return {
    updateAssessmentStatus,
    updateAssessmentCompletion,
  };
}