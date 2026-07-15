import { QueryClient } from '@tanstack/react-query';
import { assessmentKeys } from '@/hooks/useAssessmentQueries';

/**
 * Utility functions for managing assessment cache invalidation
 * These functions provide granular control over cache invalidation
 * based on specific assessment actions and user interactions
 */

export interface CacheInvalidationOptions {
  userId: string;
  assessmentType?: 'mil' | 'pca' | 'evaluation' | 'lia';
  immediate?: boolean; // Whether to invalidate immediately or batch
  refetch?: boolean; // Whether to refetch data after invalidation
}

/**
 * Invalidates cache when an assessment is started
 */
export function invalidateOnAssessmentStart(
  queryClient: QueryClient,
  options: CacheInvalidationOptions
) {
  const { userId, assessmentType, immediate = true } = options;
  
  if (immediate) {
    // Invalidate progress summaries immediately
    queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    
    // Invalidate specific assessment data
    if (assessmentType === 'mil') {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.enhancedLIA(userId) });
    } else if (assessmentType === 'evaluation') {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
    }
  }
}

/**
 * Invalidates cache when an assessment is completed
 */
export function invalidateOnAssessmentComplete(
  queryClient: QueryClient,
  options: CacheInvalidationOptions
) {
  const { userId, assessmentType, refetch = true } = options;
  
  // Always invalidate progress summaries on completion
  const progressQuery = { queryKey: assessmentKeys.progress(userId) };
  const dashboardQuery = { queryKey: assessmentKeys.dashboardSummary(userId) };
  
  if (refetch) {
    queryClient.refetchQueries(progressQuery);
    queryClient.refetchQueries(dashboardQuery);
  } else {
    queryClient.invalidateQueries(progressQuery);
    queryClient.invalidateQueries(dashboardQuery);
  }
  
  // Invalidate specific assessment results
  if (assessmentType === 'mil') {
    queryClient.invalidateQueries({ queryKey: assessmentKeys.milResults() });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
  } else if (assessmentType === 'evaluation') {
    queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
  }
}

/**
 * Invalidates cache when assessment progress is updated
 */
export function invalidateOnProgressUpdate(
  queryClient: QueryClient,
  options: CacheInvalidationOptions
) {
  const { userId, assessmentType } = options;
  
  // Update progress data
  queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(userId) });
  queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
  
  // Update specific assessment data if needed
  if (assessmentType === 'mil') {
    queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
  }
}

/**
 * Invalidates cache when evaluation invitations are sent
 */
export function invalidateOnEvaluationInvite(
  queryClient: QueryClient,
  options: CacheInvalidationOptions
) {
  const { userId } = options;
  
  // Invalidate evaluation-related queries
  queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
  queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
}

/**
 * Batch invalidation for multiple assessment actions
 */
export function batchInvalidateAssessments(
  queryClient: QueryClient,
  actions: Array<{
    type: 'start' | 'complete' | 'progress' | 'invite';
    options: CacheInvalidationOptions;
  }>
) {
  // Group invalidations by query key to avoid duplicate calls
  const invalidationMap = new Map<string, boolean>();
  
  actions.forEach(({ type, options }) => {
    const { userId, assessmentType } = options;
    
    // Mark queries for invalidation
    invalidationMap.set(`progress-${userId}`, true);
    invalidationMap.set(`dashboard-${userId}`, true);
    
    if (assessmentType === 'mil') {
      invalidationMap.set(`mil-history-${userId}`, true);
      if (type === 'complete') {
        invalidationMap.set('mil-results', true);
      }
    } else if (assessmentType === 'evaluation') {
      invalidationMap.set(`evaluation-groups-${userId}`, true);
    }
  });
  
  // Execute invalidations
  invalidationMap.forEach((_, key) => {
    if (key.startsWith('progress-')) {
      const userId = key.replace('progress-', '');
      queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(userId) });
    } else if (key.startsWith('dashboard-')) {
      const userId = key.replace('dashboard-', '');
      queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    } else if (key.startsWith('mil-history-')) {
      const userId = key.replace('mil-history-', '');
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
    } else if (key.startsWith('evaluation-groups-')) {
      const userId = key.replace('evaluation-groups-', '');
      queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
    } else if (key === 'mil-results') {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milResults() });
    }
  });
}

/**
 * Optimistic update helper for assessment status changes
 */
export function optimisticUpdateAssessmentStatus(
  queryClient: QueryClient,
  userId: string,
  assessmentType: string,
  newStatus: 'in_progress' | 'completed',
  rollback?: () => void
) {
  // Update dashboard summary optimistically
  queryClient.setQueryData(
    assessmentKeys.dashboardSummary(userId),
    (oldData: any) => {
      if (!oldData) return oldData;
      
      return {
        ...oldData,
        assessments: oldData.assessments?.map((assessment: any) => 
          assessment.type === assessmentType
            ? { ...assessment, status: newStatus }
            : assessment
        ) || []
      };
    }
  );
  
  // Set up rollback if provided
  if (rollback) {
    // Store rollback function for potential use
    setTimeout(() => {
      // Auto-rollback after 5 seconds if not confirmed
      const currentData = queryClient.getQueryData(assessmentKeys.dashboardSummary(userId));
      if (currentData) {
        rollback();
      }
    }, 5000);
  }
}

/**
 * Cache warming for assessment data
 */
export function warmAssessmentCache(
  queryClient: QueryClient,
  userId: string,
  assessmentTypes: Array<'mil' | 'pca' | 'evaluation'> = ['mil', 'pca', 'evaluation']
) {
  // Pre-fetch commonly accessed data
  queryClient.prefetchQuery({
    queryKey: assessmentKeys.dashboardSummary(userId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
  
  queryClient.prefetchQuery({
    queryKey: assessmentKeys.progress(userId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
  
  // Pre-fetch specific assessment data based on types
  assessmentTypes.forEach(type => {
    if (type === 'mil') {
      queryClient.prefetchQuery({
        queryKey: assessmentKeys.milHistory(userId),
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    } else if (type === 'evaluation') {
      queryClient.prefetchQuery({
        queryKey: assessmentKeys.evaluationGroups(userId),
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    }
  });
}