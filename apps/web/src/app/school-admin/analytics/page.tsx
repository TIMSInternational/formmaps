"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { AdminAreaChart } from "@/components/ui/admin-area-chart";
import { MiniChart } from "@/components/ui/mini-chart";
import {
  Users,
  Target,
  BarChart3,
  Clock,
  Award,
  Activity,
  Download,
} from "lucide-react";
import { useSchoolAdminStats, useAnalyticsOverview, usePerformanceTrends, useTopPerformers } from "@/hooks/useSchoolAdmin";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");

  const { data: stats, isLoading: statsLoading } = useSchoolAdminStats();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview(period);
  const { data: trends } = usePerformanceTrends(period, "score");
  const { data: topPerformers } = useTopPerformers(5);

  if (statsLoading && overviewLoading) return <DashboardSkeleton />;

  const s = stats as any;
  const o = overview as any;

  // Build chart data from trends
  const chartData = trends?.labels?.map((label: string, i: number) => ({
    label,
    score: trends.datasets?.[0]?.data?.[i] || 0,
  })) || [];

  // Mini chart for assessment activity
  const miniData = chartData.length > 0
    ? chartData.map((d: any) => ({ label: d.label, value: d.score }))
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            Analytics
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Student performance and engagement insights
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
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button
            title="Export"
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

      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard
          label="Total Students"
          value={s?.totalStudents?.toLocaleString() || "0"}
          icon={Users}
          sub="enrolled in school"
          trend={0}
        />
        <AdminStatCard
          label="Completion Rate"
          value={o?.assessmentCompletion ? `${o.assessmentCompletion.completionRate?.toFixed(1) || 0}%` : "0%"}
          icon={Target}
          sub={o?.assessmentCompletion ? `${o.assessmentCompletion.completed || 0} completed` : "across assessments"}
          trend={0}
        />
        <AdminStatCard
          label="Avg. Score"
          value={o?.averagePerformance ? `${o.averagePerformance.score?.toFixed(1) || 0}%` : `${(s?.averageScore || 0).toFixed(1)}%`}
          icon={BarChart3}
          sub="across all assessments"
          trend={o?.averagePerformance?.trend || 0}
        />
        <AdminStatCard
          label="Avg. Time Spent"
          value={o?.timeSpent ? `${o.timeSpent.averageHours?.toFixed(1) || 0}h` : "0h"}
          icon={Clock}
          sub={o?.timeSpent ? `${o.timeSpent.totalHours || 0} total hours` : "per student"}
          trend={o?.timeSpent?.trend || 0}
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {chartData.length > 0 ? (
            <AdminAreaChart
              title="Performance Trends"
              subtitle="Score over time"
              data={chartData}
              series={[{ key: "score", name: "Avg Score", color: "#14b8a6" }]}
            />
          ) : (
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", padding: 40, textAlign: "center",
              minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <Activity style={{ width: 32, height: 32, color: "var(--admin-font-tertiary)", marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginBottom: 4 }}>
                No trend data yet
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                Performance trends will appear as students complete assessments
              </div>
            </div>
          )}
        </div>
        <MiniChart
          data={miniData}
          title="Assessment Activity"
          unit="%"
        />
      </div>

      {/* Row 3: Top Performers + Completion Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Performers */}
        <div className="lg:col-span-2" style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", overflow: "hidden",
        }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Award style={{ width: 14, height: 14, color: "#f59e0b" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Top Performers</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>By assessment scores</span>
          </div>
          <div>
            {topPerformers?.data && topPerformers.data.length > 0 ? (
              topPerformers.data.map((student: any, index: number) => (
                <div key={student.id || index} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 18px",
                  borderBottom: index < (topPerformers.data?.length || 0) - 1 ? "1px solid var(--admin-border-default)" : "none",
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
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{student.name}</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                        {student.completedAssessments || 0} assessments
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#14b8a6" }}>
                      {(student.averageScore || 0).toFixed(1)}%
                    </div>
                    {student.gradeLevel && (
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Grade {student.gradeLevel}</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                <Activity style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4 }} />
                No performance data yet
              </div>
            )}
          </div>
        </div>

        {/* Completion Breakdown */}
        <div style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", padding: 20,
          display: "flex", flexDirection: "column", height: "100%",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#14b8a6" }} />
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-tertiary)" }}>
              Completion Status
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "space-between" }}>
            {[
              { label: "Completed", value: o?.assessmentCompletion?.completed || 0, color: "#10b981", icon: Target },
              { label: "In Progress", value: o?.assessmentCompletion?.inProgress || 0, color: "#f59e0b", icon: Clock },
              { label: "Not Started", value: o?.assessmentCompletion?.notStarted || 0, color: "#6b7280", icon: BarChart3 },
              { label: "Total Students", value: s?.totalStudents || 0, color: "#3b82f6", icon: Users },
            ].map((row) => (
              <div key={row.label} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
                background: "var(--admin-bg-hover, #252525)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: `${row.color}15`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <row.icon style={{ width: 16, height: 16, color: row.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 500 }}>{row.label}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
