"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import {
  getTimelineEvents,
  getTimelineStats,
  exportTimeline,
} from "@/services/timelineService";
import {
  TimelineFilters,
  TimelineEventsResponse,
  TimelineStats,
  TimelineExportConfig,
  AssessmentType,
  TimelineEventStatus,
} from "@/types/timeline";
import { useGlobalStore } from "@/store/useGlobalStore";

// Query Keys
export const timelineKeys = {
  all: ["timeline"] as const,
  events: (userId: string, filters?: TimelineFilters) =>
    [...timelineKeys.all, "events", userId, filters] as const,
  stats: (userId: string) => [...timelineKeys.all, "stats", userId] as const,
};

/**
 * Hook to manage timeline filters state
 */
export function useTimelineFilters(initialFilters: TimelineFilters = {}) {
  const [filters, setFilters] = useState<TimelineFilters>(initialFilters);

  const updateFilters = useCallback((newFilters: Partial<TimelineFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  const toggleType = useCallback((type: AssessmentType) => {
    setFilters((prev) => {
      const currentTypes = prev.types || [];
      const newTypes = currentTypes.includes(type)
        ? currentTypes.filter((t) => t !== type)
        : [...currentTypes, type];
      return { ...prev, types: newTypes.length > 0 ? newTypes : undefined };
    });
  }, []);

  const toggleStatus = useCallback((status: TimelineEventStatus) => {
    setFilters((prev) => {
      const currentStatus = prev.status || [];
      const newStatus = currentStatus.includes(status)
        ? currentStatus.filter((s) => s !== status)
        : [...currentStatus, status];
      return { ...prev, status: newStatus.length > 0 ? newStatus : undefined };
    });
  }, []);

  const setDateRange = useCallback((startDate?: string, endDate?: string) => {
    setFilters((prev) => ({
      ...prev,
      dateRange: startDate || endDate ? { startDate, endDate } : undefined,
    }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => ({
      ...prev,
      search: search || undefined,
    }));
  }, []);

  const hasActiveFilters = useMemo(() => {
    return !!(
      (filters.types && filters.types.length > 0) ||
      (filters.status && filters.status.length > 0) ||
      filters.dateRange?.startDate ||
      filters.dateRange?.endDate ||
      filters.search
    );
  }, [filters]);

  return {
    filters,
    updateFilters,
    resetFilters,
    toggleType,
    toggleStatus,
    setDateRange,
    setSearch,
    hasActiveFilters,
  };
}

/**
 * Hook to fetch timeline events
 */
export function useTimelineEvents(
  userId: string,
  filters: TimelineFilters = {}
) {
  const { language } = useGlobalStore();
  const langCode = language === "spanish" ? "sp" : "en";

  return useQuery<TimelineEventsResponse, Error>({
    queryKey: timelineKeys.events(userId, filters),
    queryFn: () => getTimelineEvents(userId, filters, langCode),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch timeline statistics
 */
export function useTimelineStats(userId: string) {
  const { language } = useGlobalStore();
  const langCode = language === "spanish" ? "sp" : "en";

  return useQuery<TimelineStats, Error>({
    queryKey: timelineKeys.stats(userId),
    queryFn: () => getTimelineStats(userId, langCode),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to export timeline data
 */
export function useTimelineExport(userId: string) {
  const { language } = useGlobalStore();
  const langCode = language === "spanish" ? "sp" : "en";
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useCallback(
    async (config: Omit<TimelineExportConfig, "language">) => {
      setIsExporting(true);
      try {
        await exportTimeline(userId, { ...config, language: langCode });
      } finally {
        setIsExporting(false);
      }
    },
    [userId, langCode]
  );

  return {
    exportData,
    isExporting,
  };
}

/**
 * Hook to invalidate timeline data
 */
export function useInvalidateTimeline() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: timelineKeys.all }),
    invalidateEvents: (userId: string) =>
      queryClient.invalidateQueries({
        queryKey: [...timelineKeys.all, "events", userId],
      }),
    invalidateStats: (userId: string) =>
      queryClient.invalidateQueries({ queryKey: timelineKeys.stats(userId) }),
  };
}

/**
 * Combined hook for complete timeline functionality
 */
export function useTimeline(userId: string, initialFilters?: TimelineFilters) {
  const filterState = useTimelineFilters(initialFilters);
  const eventsQuery = useTimelineEvents(userId, filterState.filters);
  const statsQuery = useTimelineStats(userId);
  const exportState = useTimelineExport(userId);
  const invalidate = useInvalidateTimeline();

  return {
    // Filter state
    filters: filterState.filters,
    updateFilters: filterState.updateFilters,
    resetFilters: filterState.resetFilters,
    toggleType: filterState.toggleType,
    toggleStatus: filterState.toggleStatus,
    setDateRange: filterState.setDateRange,
    setSearch: filterState.setSearch,
    hasActiveFilters: filterState.hasActiveFilters,

    // Events data
    events: eventsQuery.data?.events || [],
    summary: eventsQuery.data?.summary,
    pagination: eventsQuery.data?.pagination,
    isLoading: eventsQuery.isLoading,
    isError: eventsQuery.isError,
    error: eventsQuery.error,
    refetch: eventsQuery.refetch,

    // Stats data
    stats: statsQuery.data,
    isStatsLoading: statsQuery.isLoading,

    // Export
    exportData: exportState.exportData,
    isExporting: exportState.isExporting,

    // Invalidation
    invalidate: invalidate.invalidateAll,
  };
}
