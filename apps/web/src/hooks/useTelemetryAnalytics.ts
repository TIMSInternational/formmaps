"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";

/**
 * Telemetry analytics data structure
 * Includes DAU/WAU/MAU, retention, bounce rate, and engagement metrics
 */
export interface TelemetryAnalytics {
  period: string;
  metrics: {
    // Core traffic metrics
    totalPageViews: number;
    uniqueVisitors: number;
    // null = not derivable from the events the client sends (no session id) — shown as "—", never 0.
    avgSessionDuration: number | null;
    
    // Active user metrics
    dau: number; // Daily Active Users
    wau: number; // Weekly Active Users
    mau: number; // Monthly Active Users
    
    // User behavior
    bounceRate: number | null; // Percentage (0-1)
    newUsers: number;
    returningUsers: number;
    retentionRate: number | null; // Percentage (0-1)
    
    // Engagement
    sessionsPerUser: number | null;
    pagesPerSession: number | null;
    
    // Top content
    topPages: Array<{ page: string; views: number }>;
    
    // Event tracking
    eventBreakdown: Record<string, number>;
    
    // Funnel completions
    completionRates: {
      resumeBuilder?: number | null;
      assessments?: number | null;
      coachOnboarding?: number | null;
      profileSetup?: number | null;
    };
    
    // Trends (for charts)
    dailyActiveUsersTrend?: Array<{ date: string; users: number }>;
    weeklyTrend?: Array<{ week: string; pageViews: number; users: number }>;
  };
}

/**
 * Fetch telemetry analytics (GET /api/v1/admin/analytics/summary → { period, metrics }).
 * Through apiRequest, so the Bearer fallback and error mapping apply like every other admin call.
 */
async function getTelemetryAnalytics(
  period: "day" | "week" | "month" | "year"
): Promise<TelemetryAnalytics> {
  const json = await apiRequest<{ data?: TelemetryAnalytics } & Partial<TelemetryAnalytics>>(
    `/api/v1/admin/analytics/summary?period=${period}`
  );
  return (json.data || json) as TelemetryAnalytics;
}

/**
 * Hook to fetch telemetry analytics for admin dashboard
 */
export function useTelemetryAnalytics(
  period: "day" | "week" | "month" | "year" = "week"
) {
  return useQuery<TelemetryAnalytics>({
    queryKey: ["telemetryAnalytics", period],
    queryFn: () => getTelemetryAnalytics(period),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
