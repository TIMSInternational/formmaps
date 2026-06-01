"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, Loader2, AlertTriangle, Lightbulb, TrendingUp, BarChart3,
  Users, BookOpen, GraduationCap, Brain, Target, Zap, ChevronRight,
  CheckCircle2, XCircle, RefreshCw,
} from "lucide-react";

export default function AIInsightsPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sa-ai-insights-full"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/ai-insights");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const metrics = data?.metrics || {};
  const insights = data?.insights || [];
  const predictions = data?.predictions || [];
  const recommendations = data?.recommendations || [];
  const urgentActions = data?.urgentActions || [];
  const briefing = data?.weeklyBriefing || "";

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles style={{ width: 22, height: 22, color: "#8b5cf6" }} />
            AI School Insights
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            AI-powered analysis of your school's data, trends, and recommendations
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} style={{
          height: 36, borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: isFetching ? "var(--admin-bg-hover)" : "linear-gradient(135deg, #8b5cf6, #065292)",
          color: isFetching ? "var(--admin-font-tertiary)" : "#fff",
          border: isFetching ? "1px solid var(--admin-border-default)" : "none", cursor: isFetching ? "wait" : "pointer",
        }}>
          {isFetching ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
          {isFetching ? "Analyzing..." : "Regenerate"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" style={{ background: "var(--admin-bg-hover)" }} />
          <div className="grid grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" style={{ background: "var(--admin-bg-hover)" }} />)}</div>
          <Skeleton className="h-[300px]" style={{ background: "var(--admin-bg-hover)" }} />
        </div>
      ) : (
        <>
          {/* AI Briefing */}
          {briefing && (
            <div style={{
              padding: "20px 24px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
              border: "1px solid rgba(139,92,246,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8b5cf6" }}>Executive Summary</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--admin-font-primary)", lineHeight: 1.7 }}>{briefing}</div>
              {data?.generatedAt && (
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 10 }}>Generated {new Date(data.generatedAt).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Students", value: metrics.totalStudents || 0, icon: Users, color: "#065292" },
              { label: "Avg GPA", value: metrics.avgGPA || "—", icon: GraduationCap, color: "#10b981" },
              { label: "MIL Completed", value: `${metrics.milCompleted || 0}/${metrics.totalStudents || 0}`, icon: Brain, color: "#8b5cf6", sub: metrics.milAvg ? `Avg: ${metrics.milAvg}%` : undefined },
              { label: "360° Done", value: `${metrics.evalCompleted || 0}/${metrics.totalStudents || 0}`, icon: Target, color: "#f59e0b" },
            ].map((s) => (
              <div key={s.label} style={{ padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <s.icon style={{ width: 16, height: 16, color: s.color }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                {(s as any).sub && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{(s as any).sub}</div>}
              </div>
            ))}
          </div>

          {/* Urgent Actions */}
          {urgentActions.length > 0 && (
            <div style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap style={{ width: 16, height: 16, color: "#ef4444" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Urgent Actions</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Items requiring immediate attention</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {urgentActions.map((a: any, i: number) => {
                  const color = a.impact === "high" ? "#ef4444" : a.impact === "medium" ? "#f59e0b" : "#065292";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 8, borderLeft: `3px solid ${color}`, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{a.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: `${color}15`, color }}>{a.impact}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{a.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights + Predictions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Insights */}
            <div style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Lightbulb style={{ width: 16, height: 16, color: "#065292" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Key Insights</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Data-driven observations</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {insights.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-tertiary)", fontSize: 12 }}>No insights available</div>
                ) : insights.map((ins: any, i: number) => {
                  const catColor: Record<string, string> = { academic: "#10b981", assessment: "#8b5cf6", graduation: "#065292", staffing: "#f59e0b", engagement: "#ef4444" };
                  return (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{ins.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${catColor[ins.category] || "#6b7280"}15`, color: catColor[ins.category] || "#6b7280", textTransform: "capitalize" }}>{ins.category}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{ins.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Predictions */}
            <div style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendingUp style={{ width: 16, height: 16, color: "#f59e0b" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Predictions</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>AI-projected outcomes</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {predictions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-tertiary)", fontSize: 12 }}>No predictions available</div>
                ) : predictions.map((pred: any, i: number) => {
                  const confColor = pred.confidence === "high" ? "#10b981" : pred.confidence === "medium" ? "#f59e0b" : "#6b7280";
                  return (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{pred.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${confColor}15`, color: confColor }}>{pred.confidence} confidence</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{pred.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 style={{ width: 16, height: 16, color: "#10b981" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Strategic Recommendations</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>AI-suggested improvements for your school</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {recommendations.map((rec: any, i: number) => {
                  const catColor: Record<string, string> = { course_offering: "#10b981", staffing: "#065292", assessment: "#8b5cf6", academic: "#f59e0b" };
                  const catIcon: Record<string, any> = { course_offering: BookOpen, staffing: Users, assessment: Target, academic: GraduationCap };
                  const Icon = catIcon[rec.category] || Lightbulb;
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", display: "flex", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: `${catColor[rec.category] || "#6b7280"}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon style={{ width: 16, height: 16, color: catColor[rec.category] || "#6b7280" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{rec.title}</div>
                        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{rec.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* School Data Summary */}
          {metrics.topCourses?.length > 0 && (
            <div style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <BarChart3 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Data Summary</span>
              </div>
              <div style={{ padding: 16 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Top Enrolled Courses</div>
                    <div className="space-y-2">
                      {metrics.topCourses.map((c: any, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 6, background: "var(--admin-bg-hover)" }}>
                          <span style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{c.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.count} students</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Students by Grade</div>
                    <div className="space-y-2">
                      {Object.entries(metrics.byGrade || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, count]) => (
                        <div key={grade} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 6, background: "var(--admin-bg-hover)" }}>
                          <span style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>Grade {grade}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{count as number} students</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
