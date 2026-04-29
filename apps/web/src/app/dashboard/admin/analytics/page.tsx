"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminAreaChart } from "@/components/ui/admin-area-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  DollarSign,
  BookOpen,
  TrendingUp,
  Activity,
  Award,
  Clock,
  Download,
} from "lucide-react";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/ui/skeletons";

const DynamicRevenueChart = dynamic(
  () => import("@/components/dashboard/analytics/AnalyticsRevenueChart"),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

const DynamicUserGrowthChart = dynamic(
  () => import("@/components/dashboard/analytics/AnalyticsUserGrowthChart"),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useTranslation } from "react-i18next";
import { TelemetryDashboard } from "../_components/TelemetryDashboard";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");

  const { data: analytics, isLoading, error, refetch } = useAdminAnalytics(period);

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-8 rounded-2xl text-center max-w-md w-full" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Activity className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Analytics Unavailable</h2>
          <p className="text-gray-500 mb-6">We couldn't load the dashboard data at this time.</p>
          <Button onClick={() => refetch()} variant="outline" className="w-full">Try Again</Button>
        </div>
      </div>
    );
  }

  const statsCards = [
    {
      label: "Total Users",
      value: analytics.stats.totalUsers.toLocaleString(),
      growth: analytics.stats.monthlyGrowth.users,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500"
    },
    {
      label: "Total Revenue",
      value: formatCurrency(analytics.stats.totalRevenue),
      growth: analytics.stats.monthlyGrowth.revenue,
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: "Active Courses",
      value: analytics.stats.activeCourses.toLocaleString(),
      growth: analytics.stats.monthlyGrowth.courses,
      icon: BookOpen,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
      blobColor: "bg-violet-500"
    },
    {
      label: "Platform Growth",
      value: `+${analytics.stats.growthRate}%`,
      growth: analytics.stats.growthRate,
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    },
  ];

  return (
    <div className="space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {t("admin.analytics.title")}
            </h1>
            <p className="text-base text-gray-500 font-medium">
              Overview of your platform limits and performance
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-gray-200 shadow-sm">
              <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                <SelectTrigger className="w-[140px] border-none shadow-none rounded-full bg-transparent hover:bg-gray-50 font-medium h-9 text-sm focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="year">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 bg-white border-gray-200 shadow-sm hover:bg-gray-50 hover:text-gray-900"
              title="Download CSV report"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-8">
          <div className="flex items-center">
            <TabsList className="bg-white border border-gray-200 rounded-full p-1 h-auto gap-1 ">
              <TabsTrigger
                value="overview"
                className="rounded-full px-5 py-2.5 text-sm font-medium data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all data-[state=active]:shadow-md"
              >
                Platform Overview
              </TabsTrigger>
              <TabsTrigger
                value="behavior"
                className="rounded-full px-5 py-2.5 text-sm font-medium data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all data-[state=active]:shadow-md flex items-center gap-2"
              >
                User Behavior
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statsCards.map((stat, index) => (
                <div
                  key={index}
                  style={{
                    borderRadius: "var(--admin-radius-lg, 8px)",
                    border: "1px solid var(--admin-border-default, #2a2a2a)",
                    background: "var(--admin-bg-card, #1e1e1e)",
                    padding: 16,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #333)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 6,
                      background: "var(--admin-bg-icon-box, #2a2a2a)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
                    </div>
                    {stat.growth !== null && stat.growth !== undefined && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 2,
                        fontSize: 11, fontWeight: 500,
                        color: Number(stat.growth) >= 0 ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)",
                      }}>
                        {Number(stat.growth) >= 0 ? "+" : ""}{Math.abs(Number(stat.growth)).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 lg:grid-cols-2">
              <AdminAreaChart
                title="Revenue Analysis"
                subtitle="Monthly revenue vs transaction volume"
                data={analytics.revenueData.map((d: any) => ({
                  label: d.month,
                  revenue: d.revenue,
                  transactions: d.transactions,
                }))}
                series={[
                  { key: "revenue", name: "Revenue ($)", color: "#3b82f6" },
                  { key: "transactions", name: "Transactions", color: "#10b981" },
                ]}
              />
              <AdminAreaChart
                title="User Growth"
                subtitle="New user acquisition over time"
                data={analytics.userGrowthData.map((d: any) => ({
                  label: d.month,
                  users: d.users,
                }))}
                series={[
                  { key: "users", name: "Users", color: "#8b5cf6" },
                ]}
              />
            </div>

            {/* Bottom Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
              {/* Top Coaches Table */}
              <Card className="col-span-4 rounded-2xl border-gray-100 shadow-none overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
                      <Award className="h-5 w-5 text-amber-500" />
                      Top Coaches
                    </CardTitle>
                    <CardDescription>Top performers by revenue & rating</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-50">
                    {analytics.topCoaches.map((coach, index) => (
                      <div
                        key={coach.id}
                        className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`
                                    flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm border
                                    ${index === 0 ? "bg-amber-50 text-amber-700 border-amber-100" :
                              index === 1 ? "bg-slate-100 text-slate-700 border-slate-200" :
                                index === 2 ? "bg-orange-50 text-orange-800 border-orange-100" :
                                  "bg-white text-gray-500 border-gray-100"}
                                    `}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">
                              {coach.name}
                            </p>
                            <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              {coach.sessions} sessions
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 text-sm">
                            {formatCurrency(coach.earnings)}
                          </p>
                          <span className="flex items-center justify-end gap-1 text-xs text-amber-600 font-medium">
                            ★ {coach.rating}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="col-span-3 rounded-2xl border-gray-100 shadow-none overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
                  <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="relative space-y-0 pl-3">
                    <div className="absolute left-[28px] top-2 bottom-6 w-px bg-gray-100" />
                    {analytics.recentActivity.map((activity, index) => (
                      <div key={index} className="relative flex gap-5 pb-8 last:pb-0">
                        <div
                          className={`
                                        relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm ring-4 ring-white
                                        ${activity.type === "user" ? "border-blue-100 text-blue-600" :
                              activity.type === "transaction" ? "border-emerald-100 text-emerald-600" :
                                activity.type === "course" ? "border-violet-100 text-violet-600" :
                                  "border-amber-100 text-amber-600"}
                                        `}
                        >
                          {activity.type === "user" && <Users className="h-3.5 w-3.5" />}
                          {activity.type === "transaction" && <DollarSign className="h-3.5 w-3.5" />}
                          {activity.type === "course" && <BookOpen className="h-3.5 w-3.5" />}
                          {activity.type === "session" && <Clock className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-sm font-medium text-gray-900">
                            {activity.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1 font-medium">
                            {formatTimeAgo(activity.date || activity.timestamp || '')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

          </TabsContent>

          <TabsContent value="behavior" className="animate-in fade-in-50 duration-500">
            <TelemetryDashboard period={period} />
          </TabsContent>
        </Tabs>
    </div>
  );
}
