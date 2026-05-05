import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAnalytics, AnalyticsData } from "@/services/adminAnalyticsService";

/**
 * Hook to fetch admin analytics dashboard data
 */
export function useAdminAnalytics(period: "week" | "month" | "year" = "month") {
  return useQuery<AnalyticsData>({
    queryKey: ["adminAnalytics", period],
    queryFn: () => getAnalytics(period),
    staleTime: 30 * 60 * 1000, // 30 minutes — analytics don't change frequently
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    placeholderData: keepPreviousData, // Show previous data instantly while refetching
  });
}
