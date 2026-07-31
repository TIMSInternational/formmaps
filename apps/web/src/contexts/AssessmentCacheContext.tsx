'use client';

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { assessmentKeys } from '@/hooks/useAssessmentQueries';

interface AssessmentCacheContextType {
  // Cache invalidation methods
  invalidateUserAssessments: (userId: string) => void;
  invalidateSpecificAssessment: (userId: string, type: 'mil' | 'evaluation' | 'pca') => void;
  refreshAllAssessments: () => void;
  
  // Cache warming methods
  warmAssessmentCache: (userId: string) => void;
  
  // Cache status methods
  getCacheStatus: (userId: string) => {
    hasProgressData: boolean;
    hasDashboardData: boolean;
    hasMILData: boolean;
    hasEvaluationData: boolean;
  };
}

const AssessmentCacheContext = createContext<AssessmentCacheContextType | undefined>(undefined);

interface AssessmentCacheProviderProps {
  children: ReactNode;
}

export function AssessmentCacheProvider({ children }: AssessmentCacheProviderProps) {
  const queryClient = useQueryClient();

  const invalidateUserAssessments = useCallback((userId: string) => {
    // Invalidate all assessment-related queries for a specific user
    queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.enhancedLIA(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
  }, [queryClient]);

  const invalidateSpecificAssessment = useCallback((userId: string, type: 'mil' | 'evaluation' | 'pca') => {
    // Invalidate specific assessment type
    if (type === 'mil') {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milHistory(userId) });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.enhancedLIA(userId) });
      queryClient.invalidateQueries({ queryKey: assessmentKeys.milResults() });
    } else if (type === 'evaluation') {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
    }
    
    // Always invalidate progress summaries when specific assessments change
    queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(userId) });
    queryClient.invalidateQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
  }, [queryClient]);

  const refreshAllAssessments = useCallback(() => {
    // Force refresh all assessment data across all users
    queryClient.invalidateQueries({ queryKey: assessmentKeys.all });
  }, [queryClient]);

  const warmAssessmentCache = useCallback((userId: string) => {
    // Pre-fetch commonly used assessment data
    queryClient.prefetchQuery({
      queryKey: assessmentKeys.dashboardSummary(userId),
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
    
    queryClient.prefetchQuery({
      queryKey: assessmentKeys.progress(userId),
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  }, [queryClient]);

  const getCacheStatus = useCallback((userId: string) => {
    const progressData = queryClient.getQueryData(assessmentKeys.progress(userId));
    const dashboardData = queryClient.getQueryData(assessmentKeys.dashboardSummary(userId));
    const milHistoryData = queryClient.getQueryData(assessmentKeys.milHistory(userId));
    const evaluationData = queryClient.getQueryData(assessmentKeys.evaluationGroups(userId));

    return {
      hasProgressData: !!progressData,
      hasDashboardData: !!dashboardData,
      hasMILData: !!milHistoryData,
      hasEvaluationData: !!evaluationData,
    };
  }, [queryClient]);

  const contextValue: AssessmentCacheContextType = {
    invalidateUserAssessments,
    invalidateSpecificAssessment,
    refreshAllAssessments,
    warmAssessmentCache,
    getCacheStatus,
  };

  return (
    <AssessmentCacheContext.Provider value={contextValue}>
      {children}
    </AssessmentCacheContext.Provider>
  );
}

export function useAssessmentCache() {
  const context = useContext(AssessmentCacheContext);
  if (context === undefined) {
    throw new Error('useAssessmentCache must be used within an AssessmentCacheProvider');
  }
  return context;
}

// Hook for automatic cache warming on user login
export function useAssessmentCacheWarming(userId: string | undefined) {
  const { warmAssessmentCache } = useAssessmentCache();
  
  React.useEffect(() => {
    if (userId) {
      // Warm the cache when user logs in or changes
      const timer = setTimeout(() => {
        warmAssessmentCache(userId);
      }, 1000); // Delay to avoid blocking initial render
      
      return () => clearTimeout(timer);
    }
  }, [userId, warmAssessmentCache]);
}

// Hook for cache cleanup on user logout
export function useAssessmentCacheCleanup() {
  const queryClient = useQueryClient();
  
  const clearUserCache = useCallback((userId: string) => {
    // Remove all cached data for a specific user
    queryClient.removeQueries({ queryKey: assessmentKeys.progress(userId) });
    queryClient.removeQueries({ queryKey: assessmentKeys.dashboardSummary(userId) });
    queryClient.removeQueries({ queryKey: assessmentKeys.milHistory(userId) });
    queryClient.removeQueries({ queryKey: assessmentKeys.enhancedLIA(userId) });
    queryClient.removeQueries({ queryKey: assessmentKeys.evaluationGroups(userId) });
  }, [queryClient]);
  
  const clearAllCache = useCallback(() => {
    // Clear all assessment cache
    queryClient.removeQueries({ queryKey: assessmentKeys.all });
  }, [queryClient]);
  
  return { clearUserCache, clearAllCache };
}