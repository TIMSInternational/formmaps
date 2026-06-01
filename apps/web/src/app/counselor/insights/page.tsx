"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, GraduationCap, AlertTriangle, ClipboardCheck,
  Sparkles, RefreshCw, Loader2, Zap, BarChart3,
} from "lucide-react";

export default function CounselorInsightsPage() {
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ["counselor-insights"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/insights");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 15,
    retry: false,
  });

  const { data: briefingData, isLoading: briefingLoading, isFetching: briefingFetching, refetch: refetchBriefing } = useQuery({
    queryKey: ["counselor-ai-briefing"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/ai-briefing");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const metrics = insightsData?.metrics || {};
  const gpaDistribution = insightsData?.gpaDistribution || {};
  const assessments = insightsData?.assessments || {};
  const topClusters = insightsData?.topCareerClusters || [];
  const briefing = briefingData?.briefing || "";
  const urgentActions = briefingData?.urgentActions || [];

  const total = metrics.totalStudents || 0;
  const pcaComplete = assessments.pcaComplete || 0;
  const milComplete = assessments.milComplete || 0;
  const eval360Complete = assessments.eval360Complete || 0;
  const assessmentRate = total > 0
    ? Math.round(((pcaComplete + milComplete + eval360Complete) / (total * 3)) * 100)
    : 0;

  const isLoading = insightsLoading || briefingLoading;

  // GPA distribution config
  const gpaRanges = [
    { key: "4.0+", label: "4.0+", color: "#10b981" },
    { key: "3.5-3.9", label: "3.5 - 3.9", color: "#065292" },
    { key: "3.0-3.4", label: "3.0 - 3.4", color: "#f59e0b" },
    { key: "2.5-2.9", label: "2.5 - 2.9", color: "#f97316" },
    { key: "below2.5", label: "Below 2.5", color: "#ef4444" },
  ];

  const maxGpaCount = Math.max(1, ...gpaRanges.map((r) => gpaDistribution[r.key] || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>
          Analytics
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          Caseload Insights
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          A comprehensive view of your caseload metrics, assessment progress, and student analytics.
        </p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
          </div>
          <Skeleton className="h-40" style={{ background: "var(--admin-bg-hover)" }} />
          <Skeleton className="h-48" style={{ background: "var(--admin-bg-hover)" }} />
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}
          >
            {[
              { label: "TOTAL STUDENTS", value: total, icon: Users, color: "#065292" },
              { label: "AVERAGE GPA", value: metrics.avgGPA != null ? Number(metrics.avgGPA).toFixed(2) : "--", icon: GraduationCap, color: "#10b981" },
              { label: "AT-RISK STUDENTS", value: metrics.atRiskCount || 0, icon: AlertTriangle, color: "#ef4444" },
              { label: "ASSESSMENT COMPLETION", value: `${assessmentRate}%`, icon: ClipboardCheck, color: "#065292" },
            ].map((stat) => (
              <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
                  <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
                </div>
                <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</span>
              </div>
            ))}
          </motion.div>

          {/* AI Briefing Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div style={{
              borderRadius: 12, overflow: "hidden",
              background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.04))",
              border: "1px solid rgba(99,102,241,0.15)",
            }}>
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: "#065292" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#065292" }}>AI Briefing</span>
                </div>
                <button onClick={() => refetchBriefing()} disabled={briefingFetching} style={{
                  height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  background: briefingFetching ? "var(--admin-bg-hover)" : "#065292",
                  color: briefingFetching ? "var(--admin-font-tertiary)" : "#fff",
                  border: briefingFetching ? "1px solid var(--admin-border-default)" : "none",
                  cursor: briefingFetching ? "wait" : "pointer",
                }}>
                  {briefingFetching
                    ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                    : <RefreshCw style={{ width: 13, height: 13 }} />}
                  {briefingFetching ? "Generating..." : "Regenerate"}
                </button>
              </div>

              {briefing ? (
                <div style={{ padding: "0 20px 16px 20px" }}>
                  <div style={{ fontSize: 14, color: "var(--admin-font-primary)", lineHeight: 1.7 }}>{briefing}</div>
                </div>
              ) : (
                <div style={{ padding: "0 20px 16px 20px", fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  No briefing available yet. Click Regenerate to create one.
                </div>
              )}

              {urgentActions.length > 0 && (
                <div style={{ padding: "0 20px 16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Zap style={{ width: 13, height: 13, color: "#ef4444" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#ef4444" }}>Urgent Actions</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {urgentActions.map((a: any, i: number) => {
                      const impactColor = a.impact === "high" ? "#ef4444" : a.impact === "medium" ? "#f59e0b" : "#065292";
                      return (
                        <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--admin-border-default)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{a.title}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: `${impactColor}15`, color: impactColor }}>{a.impact}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{a.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {briefingData?.generatedAt && (
                <div style={{ padding: "0 20px 12px 20px", fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                  Generated {new Date(briefingData.generatedAt).toLocaleString()}
                </div>
              )}
            </div>
          </motion.div>

          {/* GPA Distribution */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
              <BarChart3 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>GPA Distribution</span>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {gpaRanges.map((range) => {
                const count = gpaDistribution[range.key] || 0;
                const pct = maxGpaCount > 0 ? (count / maxGpaCount) * 100 : 0;
                return (
                  <div key={range.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", width: 72, textAlign: "right", flexShrink: 0 }}>{range.label}</span>
                    <div style={{ flex: 1, height: 24, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden", position: "relative" }}>
                      <div style={{
                        height: "100%", borderRadius: 4, width: `${pct}%`,
                        background: range.color, transition: "width 0.5s ease",
                        minWidth: count > 0 ? 8 : 0,
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: range.color, width: 32, textAlign: "right", flexShrink: 0 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Assessment Completion Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}
          >
            {[
              { label: "PCA Complete", complete: pcaComplete, color: "#8b5cf6" },
              { label: "MIL Complete", complete: milComplete, color: "#065292" },
              { label: "360° Complete", complete: eval360Complete, color: "#14b8a6" },
            ].map((item) => {
              const pct = total > 0 ? Math.round((item.complete / total) * 100) : 0;
              return (
                <div key={item.label} style={{ padding: 20, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 12 }}>
                    {item.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.complete}</span>
                    <span style={{ fontSize: 14, color: "var(--admin-font-tertiary)" }}>/ {total}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 4, width: `${pct}%`,
                      background: item.color, transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: item.color, textAlign: "right" }}>{pct}%</div>
                </div>
              );
            })}
          </motion.div>

          {/* Top Career Clusters */}
          {topClusters.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Top Career Clusters</span>
              </div>
              <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topClusters.slice(0, 5).map((cluster: any, i: number) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                    borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{cluster.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: "rgba(139,92,246,0.1)", color: "#8b5cf6",
                    }}>{cluster.count}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
