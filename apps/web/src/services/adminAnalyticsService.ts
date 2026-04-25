import { apiRequest } from "@/lib/api/apiClient";

export interface AnalyticsStats {
  totalUsers: number;
  totalRevenue: number;
  activeCourses: number;
  growthRate: number;
  monthlyGrowth: {
    users: number;
    revenue: number;
    courses: number;
  };
}

export interface RevenueData {
  month: string;
  revenue: number;
  transactions: number;
}

export interface UserGrowthData {
  month: string;
  users: number;
  newUsers: number;
}

export interface TopCoach {
  id: string;
  name: string;
  earnings: number;
  sessions: number;
  rating: number;
}

export interface TopCourse {
  id: string;
  title: string;
  enrollments: number;
  revenue: number;
  rating: number;
}

export interface RecentActivity {
  type: "user" | "transaction" | "course" | "session";
  message: string;
  timestamp?: string;
  date?: string;
}

export interface AnalyticsData {
  stats: AnalyticsStats;
  revenueData: RevenueData[];
  userGrowthData: UserGrowthData[];
  topCoaches: TopCoach[];
  topCourses: TopCourse[];
  recentActivity: RecentActivity[];
}

/**
 * Get comprehensive platform analytics (Admin only)
 */
export async function getAnalytics(
  period: "week" | "month" | "year" = "month"
): Promise<AnalyticsData> {
  const response = await apiRequest(
    `/api/v1/admin/analytics?period=${period}`,
    {
      method: "GET",
    }
  );
  return response.data || response;
}
