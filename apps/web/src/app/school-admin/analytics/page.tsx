"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users, Target, BarChart3, Clock, Award, Activity, Download,
  AlertTriangle, UserCheck, Brain, Compass, TrendingUp, GraduationCap,
  ShieldAlert, Sparkles, ChevronRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useSchoolAdminStats, useAnalyticsOverview, useTopPerformers } from "@/hooks/useSchoolAdmin";
import { getPipeline, getInsights, type PipelineStudent, type InsightsData } from "@/services/assessmentCommandService";

export default function AnalyticsPage() {
  const { data: stats, isLoading: statsLoading } = useSchoolAdminStats();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview("month");
  const { data: topPerformers } = useTopPerformers(10);
  const { data: pipeline } = useQuery({ queryKey: ["analytics-pipeline"], queryFn: () => getPipeline(), staleTime: 1000 * 60 * 5 });
  const { data: insights } = useQuery<InsightsData>({ queryKey: ["analytics-insights"], queryFn: () => getInsights(), staleTime: 1000 * 60 * 10 });

  const s = stats as any;
  const o = overview as any;
  const students = (pipeline || []) as PipelineStudent[];

  // Computed metrics
  const totalStudents = s?.totalStudents || students.length || 0;
  const atRisk = o?.studentsAtRisk ?? 0;
  const counselorCoverage = o?.counselorCoverage ?? 0;
  const completionRate = o?.assessmentCompletionRate ?? 0;
  const avgGpa = o?.averageProgressScore > 0 ? (o.averageProgressScore / 25).toFixed(2) : "\u2014";

  // Pipeline analysis by grade
  const gradeStats: Record<number, { total: number; pcaDone: number; milDone: number; evalDone: number }> = {};
  for (const st of students) {
    const g = st.gradeLevel || 0;
    if (!gradeStats[g]) gradeStats[g] = { total: 0, pcaDone: 0, milDone: 0, evalDone: 0 };
    gradeStats[g].total++;
    if (Object.values(st.pca).every(v => v === "done")) gradeStats[g].pcaDone++;
    if (st.mil === "done") gradeStats[g].milDone++;
    if (st.eval360 === "done") gradeStats[g].evalDone++;
  }
  const gradeLabels: Record<number, string> = { 0: "Unassigned", 9: "Freshman", 10: "Sophomore", 11: "Junior", 12: "Senior" };

  // Overall pipeline counts
  const pcaFullDone = students.filter(st => Object.values(st.pca).every(v => v === "done")).length;
  const milDone = students.filter(st => st.mil === "done").length;
  const evalDone = students.filter(st => st.eval360 === "done").length;
  const fullyComplete = students.filter(st =>
    Object.values(st.pca).every(v => v === "done") && st.mil === "done" && st.eval360 === "done"
  ).length;

  // Insights data
  const agg = insights?.aggregates;

  // Safely extract top performers array from any response shape
  const performersList: any[] = (() => {
    if (!topPerformers) return [];
    if (Array.isArray(topPerformers)) return topPerformers;
    const tp = topPerformers as any;
    if (Array.isArray(tp.data?.data)) return tp.data.data;
    if (Array.isArray(tp.data)) return tp.data;
    return [];
  })();

  const handleExport = useCallback(() => {
    try {
      const rows = [
        ["Metric", "Value"],
        ["Total Students", totalStudents],
        ["At-Risk Students", atRisk],
        ["Counselor Coverage", `${counselorCoverage}%`],
        ["Assessment Completion", `${completionRate}%`],
        ["Avg GPA", avgGpa],
        ["PCA Complete", pcaFullDone],
        ["MIL Complete", milDone],
        ["360 Complete", evalDone],
        ["Fully Complete", fullyComplete],
      ];
      const csv = rows.map(r => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Analytics exported");
    } catch { toast.error("Export failed"); }
  }, [totalStudents, atRisk, counselorCoverage, completionRate, avgGpa, pcaFullDone, milDone, evalDone, fullyComplete]);

  if (statsLoading && overviewLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-64" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            Analytics & Insights
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Actionable intelligence across assessments, grades, and student readiness
          </p>
        </div>
        <button onClick={handleExport} style={{
          height: 32, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
          background: "transparent", color: "var(--admin-font-primary)",
          border: "1px solid var(--admin-border-default)", cursor: "pointer",
        }}>
          <Download style={{ width: 12, height: 12 }} /> Export CSV
        </button>
      </div>

      {/* Row 1: Action Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "At-Risk Students", value: atRisk, icon: ShieldAlert, color: "#ef4444", sub: atRisk > 0 ? "GPA below 2.0" : "No at-risk students" },
          { label: "Counselor Coverage", value: `${Math.round(counselorCoverage)}%`, icon: UserCheck, color: counselorCoverage >= 80 ? "#10b981" : "#f59e0b", sub: counselorCoverage >= 80 ? "Good coverage" : "Assign more students" },
          { label: "Fully Assessed", value: `${totalStudents > 0 ? Math.round((fullyComplete / totalStudents) * 100) : 0}%`, icon: Target, color: "#065292", sub: `${fullyComplete}/${totalStudents} students` },
          { label: "Avg GPA", value: avgGpa, icon: GraduationCap, color: "#065292", sub: "Weighted average" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: `${stat.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
              </div>
              {stat.label === "At-Risk Students" && atRisk > 0 && (
                <a href="/school-admin/users" style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                  View <ChevronRight style={{ width: 10, height: 10 }} />
                </a>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>{stat.value}</div>
            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Assessment Completion by Grade + Pipeline Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Completion by Grade */}
        <div className="lg:col-span-2" style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", overflow: "hidden",
        }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart3 style={{ width: 14, height: 14, color: "#065292" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Assessment Completion by Grade</span>
          </div>
          <div style={{ padding: 16 }}>
            {Object.keys(gradeStats).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(gradeStats).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, data]) => {
                  const g = Number(grade);
                  return (
                    <div key={grade}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                          {gradeLabels[g] || `Grade ${grade}`} ({data.total} students)
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        {[
                          { label: "PCA", done: data.pcaDone, color: "#8b5cf6" },
                          { label: "MIL/LIA", done: data.milDone, color: "#065292" },
                          { label: "360°", done: data.evalDone, color: "#14b8a6" },
                        ].map((a) => {
                          const pct = data.total > 0 ? Math.round((a.done / data.total) * 100) : 0;
                          return (
                            <div key={a.label} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: a.color }}>{a.label}</span>
                                <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{a.done}/{data.total}</span>
                              </div>
                              <div style={{ height: 4, borderRadius: 2, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: a.color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                No assessment data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Summary */}
        <div style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", padding: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <Target style={{ width: 14, height: 14, color: "#14b8a6" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Pipeline Summary</span>
          </div>
          <div className="space-y-3">
            {[
              { label: "PCA Complete", done: pcaFullDone, total: totalStudents, color: "#8b5cf6" },
              { label: "MIL/LIA Complete", done: milDone, total: totalStudents, color: "#065292" },
              { label: "360° Complete", done: evalDone, total: totalStudents, color: "#14b8a6" },
              { label: "Fully Assessed", done: fullyComplete, total: totalStudents, color: "#10b981" },
            ].map((item) => {
              const pct = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
              return (
                <div key={item.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)" }}>{item.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: item.color, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{item.done} of {item.total} students</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Cognitive Profile + Career Clusters + AI Insights */}
      {agg && insights?.hasEnoughData && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Cognitive Strengths */}
          <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8 }}>
              <Brain style={{ width: 14, height: 14, color: "#065292" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>School Cognitive Profile</span>
            </div>
            <div style={{ padding: 16 }} className="space-y-2">
              {agg.pcaAverages && Object.entries(agg.pcaAverages).map(([key, val]) => {
                const v = Number(val) || 0;
                const isStrong = v >= 70;
                const isWeak = v < 50;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <div style={{ width: 100, fontSize: 11, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${v}%`, borderRadius: 3, background: isWeak ? "#ef4444" : isStrong ? "#10b981" : "#065292" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isWeak ? "#ef4444" : isStrong ? "#10b981" : "var(--admin-font-primary)", width: 35, textAlign: "right" }}>
                      {v.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Career Clusters */}
          <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8 }}>
              <Compass style={{ width: 14, height: 14, color: "#f59e0b" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Top Career Interests</span>
            </div>
            <div style={{ padding: 16 }} className="space-y-2">
              {agg.topCareerClusters?.length > 0 ? agg.topCareerClusters.map((cluster: any, i: number) => (
                <div key={cluster.name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      background: i === 0 ? "rgba(245,158,11,0.12)" : "var(--admin-bg-hover)",
                      color: i === 0 ? "#f59e0b" : "var(--admin-font-tertiary)",
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{cluster.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-font-primary)" }}>{cluster.count} students</span>
                </div>
              )) : (
                <div style={{ textAlign: "center", padding: 16, color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                  Career data will appear after profile analysis.
                </div>
              )}
            </div>
          </div>

          {/* AI Insights */}
          <div style={{ borderRadius: 8, border: "1px solid rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.03)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(20,184,166,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles style={{ width: 14, height: 14, color: "#14b8a6" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>AI Insights</span>
              {insights?.cached && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>CACHED</span>}
            </div>
            <div style={{ padding: 16 }}>
              {insights?.narrative ? (
                <div className="space-y-3">
                  {insights.narrative.split(/\n+/).filter(Boolean).map((line, i) => {
                    const trimmed = line.trim();
                    // Skip markdown headings — use first line as visual header
                    if (trimmed.startsWith("# ")) {
                      return (
                        <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "var(--admin-font-primary)", paddingBottom: 4, borderBottom: "1px solid rgba(20,184,166,0.15)" }}>
                          {trimmed.replace(/^#+\s*/, "")}
                        </div>
                      );
                    }
                    // Render bold (**text**) and regular text
                    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "var(--admin-font-secondary)", margin: 0 }}>
                        {parts.map((part, j) =>
                          part.startsWith("**") && part.endsWith("**")
                            ? <strong key={j} style={{ color: "var(--admin-font-primary)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>
                            : <span key={j}>{part}</span>
                        )}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                  AI analysis will be available once enough students complete their assessments.
                </p>
              )}
              {agg.discDistribution && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(20,184,166,0.15)" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>DISC Distribution</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {Object.entries(agg.discDistribution).map(([type, count]) => (
                      <div key={type} style={{
                        flex: 1, padding: "6px 0", borderRadius: 6, textAlign: "center",
                        background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{Number(count)}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Top Performers */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Award style={{ width: 14, height: 14, color: "#f59e0b" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Top Performers</span>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>By GPA score</span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--admin-bg-hover)" }}>
                {["#", "Student", "Grade", "GPA", "Assessments"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: h === "#" ? "center" : "left", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(performersList).slice(0, 10).map((student: any, i: number) => (
                <tr key={student.studentId || i} style={{ borderTop: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                  onClick={() => window.location.href = `/school-admin/users/${student.studentId}`}>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      background: i < 3 ? "rgba(245,158,11,0.12)" : "var(--admin-bg-hover)",
                      color: i < 3 ? "#f59e0b" : "var(--admin-font-tertiary)",
                    }}>
                      {i + 1}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontWeight: 600, color: "var(--admin-accent-blue, #065292)" }}>{student.name}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--admin-font-tertiary)" }}>
                    {student.gradeLevel ? `Grade ${student.gradeLevel}` : "\u2014"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontWeight: 700, color: student.progressScore > 0 ? "#10b981" : "var(--admin-font-tertiary)" }}>
                      {student.progressScore > 0 ? (student.progressScore / 25).toFixed(2) : "\u2014"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                      background: student.assessmentStatus === "completed" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                      color: student.assessmentStatus === "completed" ? "#10b981" : "#6b7280",
                    }}>
                      {student.assessmentStatus || "not started"}
                    </span>
                  </td>
                </tr>
              ))}
              {performersList.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--admin-font-tertiary)" }}>
                    <Activity style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4 }} />
                    No performance data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
