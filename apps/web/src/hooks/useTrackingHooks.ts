"use client";

import { useCallback, useRef } from "react";
import { telemetry } from "@/services/telemetryService";

/**
 * Hook for tracking search queries with debouncing.
 * Prevents tracking every keystroke, only tracks after user stops typing.
 * 
 * Usage:
 * ```tsx
 * const trackSearch = useSearchTracking("careers");
 * 
 * <input onChange={(e) => {
 *   setSearchValue(e.target.value);
 *   trackSearch(e.target.value, resultsCount);
 * }} />
 * ```
 */
export function useSearchTracking(
  category: string,
  page?: string,
  debounceMs = 1000
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<string>("");

  const trackSearch = useCallback(
    (query: string, resultsCount?: number) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Only track if query is different and meaningful
      if (query.length < 2 || query === lastQueryRef.current) {
        return;
      }

      // Debounce the tracking
      timeoutRef.current = setTimeout(() => {
        lastQueryRef.current = query;
        telemetry.trackSearch(query, category, resultsCount, page);
      }, debounceMs);
    },
    [category, page, debounceMs]
  );

  return trackSearch;
}

/**
 * Hook for tracking course progress.
 * Automatically handles start/progress/complete events.
 */
export function useCourseTracking(courseId: string, courseName?: string) {
  const hasStartedRef = useRef(false);

  const trackStart = useCallback(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      telemetry.trackCourse("start", courseId, courseName);
    }
  }, [courseId, courseName]);

  const trackProgress = useCallback(
    (progress: number, moduleId?: string) => {
      telemetry.trackCourse("progress", courseId, courseName, progress, moduleId);
    },
    [courseId, courseName]
  );

  const trackComplete = useCallback(
    (duration?: number) => {
      telemetry.trackCourse("complete", courseId, courseName, 100, undefined, duration);
    },
    [courseId, courseName]
  );

  return {
    trackStart,
    trackProgress,
    trackComplete,
  };
}

/**
 * Hook for tracking errors manually (beyond auto-captured ones).
 */
export function useErrorTracking() {
  const trackError = useCallback(
    (message: string, source?: string, context?: Record<string, unknown>) => {
      telemetry.trackError(
        message,
        source,
        undefined,
        undefined,
        JSON.stringify(context)
      );
    },
    []
  );

  return trackError;
}
