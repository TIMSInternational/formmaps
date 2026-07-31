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
  period: "week" | "month" | "year" = "month",
  summary: boolean = false
): Promise<AnalyticsData> {
  const response = await apiRequest(
    `/api/v1/admin/analytics?period=${period}${summary ? "&summary=true" : ""}`,
    {
      method: "GET",
    }
  );
  const raw = response.data || response;
  // Normalize PascalCase (from .NET) to camelCase
  if (raw.Stats && !raw.stats) {
    raw.stats = raw.Stats;
  }
  if (raw.stats) {
    const s = raw.stats;
    if (s.TotalUsers !== undefined && s.totalUsers === undefined) s.totalUsers = s.TotalUsers;
    if (s.TotalRevenue !== undefined && s.totalRevenue === undefined) s.totalRevenue = s.TotalRevenue;
    if (s.ActiveCourses !== undefined && s.activeCourses === undefined) s.activeCourses = s.ActiveCourses;
    if (s.GrowthRate !== undefined && s.growthRate === undefined) s.growthRate = s.GrowthRate;
    if (s.ActiveSchools !== undefined && s.activeSchools === undefined) s.activeSchools = s.ActiveSchools;
    if (s.ActiveCoaches !== undefined && s.activeCoaches === undefined) s.activeCoaches = s.ActiveCoaches;
    if (s.PendingInvites !== undefined && s.pendingInvites === undefined) s.pendingInvites = s.PendingInvites;
    if (s.MonthlyGrowth && !s.monthlyGrowth) {
      s.monthlyGrowth = { users: s.MonthlyGrowth.Users ?? 0, revenue: s.MonthlyGrowth.Revenue ?? 0, courses: s.MonthlyGrowth.Courses ?? 0 };
    }
  }
  if (raw.RevenueData && !raw.revenueData) raw.revenueData = raw.RevenueData;
  if (raw.UserGrowthData && !raw.userGrowthData) raw.userGrowthData = raw.UserGrowthData;
  if (raw.TopCoaches && !raw.topCoaches) raw.topCoaches = raw.TopCoaches;
  if (raw.TopCourses && !raw.topCourses) raw.topCourses = raw.TopCourses;
  if (raw.RecentActivity && !raw.recentActivity) raw.recentActivity = raw.RecentActivity;
  return raw;
}

export async function getAnalyticsSummary(
  period: "week" | "month" | "year" = "month"
): Promise<AnalyticsData> {
  return getAnalytics(period, true);
}
