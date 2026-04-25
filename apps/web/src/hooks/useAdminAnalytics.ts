import { useQuery } from "@tanstack/react-query";
import { getAnalytics, AnalyticsData } from "@/services/adminAnalyticsService";

/**
 * Hook to fetch admin analytics dashboard data
 */
export function useAdminAnalytics(period: "week" | "month" | "year" = "month") {
  return useQuery<AnalyticsData>({
    queryKey: ["adminAnalytics", period],
    queryFn: () => getAnalytics(period),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
