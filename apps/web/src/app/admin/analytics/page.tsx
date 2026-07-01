"use client";

import { useState } from "react";
import { AdminAreaChart } from "@/components/ui/admin-area-chart";
import { AdminStatCard } from "../_components/AdminStatCard";
import { MiniChart } from "@/components/ui/mini-chart";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  Star,
  Zap,
  BarChart3,
  Download,
  Activity,
} from "lucide-react";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useTranslation } from "react-i18next";
import { TelemetryDashboard } from "../_components/TelemetryDashboard";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

export default function AnalyticsPage() {
  const { t } = useTranslation("platform_owner");
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const { data: analytics, isLoading, error, refetch } = useAdminAnalytics(period);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  if (isLoading) return <DashboardSkeleton />;

  if (error || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-8 rounded-xl text-center max-w-md w-full" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
          <Activity className="h-8 w-8 mx-auto mb-4" style={{ color: "var(--admin-accent-red)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>{t("analytics.unavailableTitle")}</h2>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginBottom: 16 }}>{t("analytics.unavailableDesc")}</p>
          <Button onClick={() => refetch()} variant="outline" size="sm">{t("analytics.tryAgain")}</Button>
        </div>
      </div>
    );
  }

  const { stats } = analytics;

  // ── Computed insights (NOT on dashboard) ──
  const revenuePerUser = stats.totalUsers > 0 ? stats.totalRevenue / stats.totalUsers : 0;
  const totalTransactions = analytics.revenueData.reduce((sum: number, d: any) => sum + (d.transactions || 0), 0);
  const avgTransactionValue = totalTransactions > 0 ? stats.totalRevenue / totalTransactions : 0;
  const avgCoachRating = analytics.topCoaches.length > 0
    ? analytics.topCoaches.reduce((sum: number, c: any) => sum + (c.rating || 0), 0) / analytics.topCoaches.length
    : 0;
  const totalCoachSessions = analytics.topCoaches.reduce((sum: number, c: any) => sum + (c.sessions || 0), 0);

  // Weekly chart data from revenue
  const weeklyChartData = analytics.revenueData.slice(-7).map((d: any, i: number) => ({
    label: d.month?.substring(0, 3) || `W${i + 1}`,
    value: d.transactions || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            {t("analytics.title")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {t("analytics.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            style={{
              background: "var(--admin-bg-icon-box)", border: "1px solid var(--admin-border-default)",
              borderRadius: 6, padding: "6px 10px", fontSize: 12,
              color: "var(--admin-font-secondary)", outline: "none",
            }}
          >
            <option value="week">{t("analytics.period.last7Days")}</option>
            <option value="month">{t("analytics.period.last30Days")}</option>
            <option value="year">{t("analytics.period.last12Months")}</option>
          </select>
          <button
            title={t("analytics.exportCsv")}
            style={{
              width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--admin-bg-icon-box)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-tertiary)", cursor: "pointer",
            }}
          >
            <Download style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList style={{
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          borderRadius: 6, padding: 2, display: "inline-flex",
        }}>
          <TabsTrigger value="overview" className="rounded px-4 py-1.5 text-xs font-medium">
            {t("analytics.tabs.performance")}
          </TabsTrigger>
          <TabsTrigger value="behavior" className="rounded px-4 py-1.5 text-xs font-medium">
            {t("analytics.tabs.userBehavior")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Row 1: Computed Insights — UNIQUE to analytics, not on dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <AdminStatCard
              label={t("analytics.stats.revenuePerUser")}
              value={formatCurrency(revenuePerUser)}
              icon={DollarSign}
              sub={t("analytics.stats.avgLifetimeValue")}
            />
            <AdminStatCard
              label={t("analytics.stats.avgTransaction")}
              value={formatCurrency(avgTransactionValue)}
              icon={BarChart3}
              sub={t("analytics.stats.totalTransactions", { count: totalTransactions })}
            />
            <AdminStatCard
              label={t("analytics.stats.coachRating")}
              value={avgCoachRating.toFixed(1)}
              icon={Star}
              sub={t("analytics.stats.coachesCount", { count: analytics.topCoaches.length })}
            />
            <AdminStatCard
              label={t("analytics.stats.coachSessions")}
              value={totalCoachSessions.toLocaleString()}
              icon={Zap}
              sub={t("analytics.stats.totalSessionsDelivered")}
            />
          </div>

          {/* Row 2: Charts — the core of analytics */}
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminAreaChart
              title={t("analytics.charts.revenueVsTransactions")}
              subtitle={t("analytics.charts.monthlyComparison")}
              data={analytics.revenueData.map((d: any) => ({
                label: d.month,
                revenue: d.revenue,
                transactions: d.transactions,
              }))}
              series={[
                { key: "revenue", name: t("analytics.charts.revenueSeriesLabel"), color: "#2E9098" },
                { key: "transactions", name: t("analytics.charts.transactionsSeriesLabel"), color: "#10b981" },
              ]}
            />
            <AdminAreaChart
              title={t("analytics.charts.userGrowth")}
              subtitle={t("analytics.charts.newRegistrations")}
              data={analytics.userGrowthData.map((d: any) => ({
                label: d.month,
                users: d.users,
              }))}
              series={[
                { key: "users", name: t("analytics.charts.newUsersSeriesLabel"), color: "#8b5cf6" },
              ]}
            />
          </div>

          {/* Row 3: Top Coaches + Transaction Volume */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Top Coaches */}
            <div className="lg:col-span-2" style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Star style={{ width: 14, height: 14, color: "#f59e0b" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("analytics.charts.topCoaches")}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("analytics.charts.byRevenueAndRating")}</span>
              </div>
              <div>
                {analytics.topCoaches.map((coach: any, index: number) => (
                  <div key={coach.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 18px",
                    borderBottom: index < analytics.topCoaches.length - 1 ? "1px solid var(--admin-border-default)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700,
                        background: index === 0 ? "rgba(245,158,11,0.12)" : "var(--admin-bg-icon-box)",
                        color: index === 0 ? "#f59e0b" : "var(--admin-font-tertiary)",
                      }}>
                        {index + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{coach.name}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("analytics.charts.coachSessions", { count: coach.sessions })}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{formatCurrency(coach.earnings)}</div>
                      <div style={{ fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                        ★ {coach.rating}
                      </div>
                    </div>
                  </div>
                ))}
                {analytics.topCoaches.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("analytics.charts.noCoachData")}</div>
                )}
              </div>
            </div>

            {/* Transaction Volume Mini Chart */}
            <MiniChart
              data={weeklyChartData.length > 0 ? weeklyChartData : undefined}
              title={t("analytics.charts.transactionVolume")}
              unit=""
            />
          </div>

          {/* Row 4: Top Courses */}
          {(
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("analytics.charts.topCourses")}</span>
              </div>
              {analytics.topCourses && analytics.topCourses.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 1, background: "var(--admin-border-default)" }}>
                  {analytics.topCourses.slice(0, 6).map((course: any, i: number) => (
                    <div key={course.id || i} style={{ background: "var(--admin-bg-card)", padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)", marginBottom: 4 }}>
                        {course.title || course.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                        {t("analytics.charts.courseEnrolled", { count: course.students || course.enrollments || 0 })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--admin-font-tertiary)", fontSize: 13 }}>
                  {t("analytics.charts.noCourseData")}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="behavior" className="animate-in fade-in-50 duration-500">
          <TelemetryDashboard period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
