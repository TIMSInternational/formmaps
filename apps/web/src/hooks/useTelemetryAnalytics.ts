"use client";

import { useQuery } from "@tanstack/react-query";

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
    avgSessionDuration: number;
    
    // Active user metrics
    dau: number; // Daily Active Users
    wau: number; // Weekly Active Users
    mau: number; // Monthly Active Users
    
    // User behavior
    bounceRate: number; // Percentage (0-1)
    newUsers: number;
    returningUsers: number;
    retentionRate: number; // Percentage (0-1)
    
    // Engagement
    sessionsPerUser: number;
    pagesPerSession: number;
    
    // Top content
    topPages: Array<{ page: string; views: number }>;
    
    // Event tracking
    eventBreakdown: Record<string, number>;
    
    // Funnel completions
    completionRates: {
      resumeBuilder: number;
      assessments: number;
      coachOnboarding: number;
      profileSetup: number;
    };
    
    // Trends (for charts)
    dailyActiveUsersTrend?: Array<{ date: string; users: number }>;
    weeklyTrend?: Array<{ week: string; pageViews: number; users: number }>;
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Fetch telemetry analytics from the backend
 */
async function getTelemetryAnalytics(
  period: "day" | "week" | "month" | "year"
): Promise<TelemetryAnalytics> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/analytics/summary?period=${period}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch telemetry analytics: ${response.status}`);
  }

  const json = await response.json();
  // API returns { data: { period, metrics }, success, message }
  // Extract the inner data object
  return json.data || json;
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
