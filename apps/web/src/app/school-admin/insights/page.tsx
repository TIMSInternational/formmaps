"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, Loader2, Lightbulb, TrendingUp, BarChart3,
  Users, BookOpen, GraduationCap, Brain, Target, Zap,
  CheckCircle2, RefreshCw, Lock,
} from "lucide-react";

export default function AIInsightsPage() {
  const { t } = useTranslation("school_admin");
  const queryClient = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["sa-ai-insights-full"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/ai-insights");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const gating = data?.gating;
  const eligible = gating ? gating.eligible : true;

  // Header action. When eligible (≥90%) it manually regenerates (?refresh=true bypasses
  // the once-per-milestone cadence). Below 90% it stays enabled as a progress refresh —
  // a plain re-fetch re-evaluates the gate and lets the backend auto-generate the moment
  // completion crosses 90% (otherwise a stale 30-min cache could hide the unlock).
  const handleHeaderAction = async () => {
    setRegenerating(true);
    try {
      if (eligible) {
        const res = await apiRequest("/api/v1/school-admin/ai-insights?refresh=true");
        queryClient.setQueryData(["sa-ai-insights-full"], res?.data ?? res);
        toast.success(t("insights.regeneratedSuccess"));
      } else {
        await queryClient.invalidateQueries({ queryKey: ["sa-ai-insights-full"] });
      }
    } catch {
      toast.error(eligible ? t("insights.regenerateFailed") : t("insights.refreshFailed"));
    } finally {
      setRegenerating(false);
    }
  };
  const isFetching = regenerating;

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
            {t("insights.title")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {t("insights.subtitle")}
          </p>
        </div>
        <button onClick={handleHeaderAction} disabled={isLoading || isFetching}
          title={!eligible ? "AI regeneration unlocks at 90% assessment completion — refreshes progress for now" : undefined}
          style={{
            height: 36, borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: isLoading || isFetching || !eligible ? "var(--admin-bg-hover)" : "linear-gradient(135deg, #8b5cf6, #065292)",
            color: isLoading || isFetching || !eligible ? "var(--admin-font-tertiary)" : "#fff",
            border: isLoading || isFetching || !eligible ? "1px solid var(--admin-border-default)" : "none",
            cursor: isLoading || isFetching ? "wait" : "pointer",
          }}>
          {isFetching ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
            : !eligible ? <Lock style={{ width: 14, height: 14 }} />
            : <RefreshCw style={{ width: 14, height: 14 }} />}
          {isFetching ? (eligible ? t("insights.analyzing") : t("insights.refreshing")) : eligible ? t("insights.regenerate") : t("insights.checkProgress")}
        </button>
      </div>

      {/* Completion gate banner — AI narrative unlocks at 90% class completion */}
      {!isLoading && gating && !eligible && (
        <div style={{
          padding: "16px 20px", borderRadius: 12, display: "flex", alignItems: "center", gap: 14,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lock style={{ width: 18, height: 18, color: "#d97706" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {t("insights.gateTitle")}
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
              {t("insights.gateSubtitle", { completed: gating.completed, total: gating.total, rate: gating.completionRate })}
            </div>
            <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, gating.completionRate)}%`, background: "#d97706", borderRadius: 3 }} />
            </div>
          </div>
        </div>
      )}

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
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8b5cf6" }}>{t("insights.executiveSummary")}</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--admin-font-primary)", lineHeight: 1.7 }}>{briefing}</div>
              {data?.generatedAt && (
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 10 }}>{t("insights.generatedAt", { date: new Date(data.generatedAt).toLocaleString() })}</div>
              )}
            </div>
          )}

          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: t("insights.metrics.students"), value: metrics.totalStudents || 0, icon: Users, color: "#065292" },
              { label: t("insights.metrics.avgGpa"), value: metrics.avgGPA || "—", icon: GraduationCap, color: "#10b981" },
              { label: t("insights.metrics.milCompleted"), value: `${metrics.milCompleted || 0}/${metrics.totalStudents || 0}`, icon: Brain, color: "#8b5cf6", sub: metrics.milAvg ? t("insights.metrics.milAvg", { pct: metrics.milAvg }) : undefined },
              { label: t("insights.metrics.eval360Done"), value: `${metrics.evalCompleted || 0}/${metrics.totalStudents || 0}`, icon: Target, color: "#f59e0b" },
            ].map((s) => (
              <div key={s.label} style={{ padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <s.icon style={{ width: 16, height: 16, color: s.color }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                {"sub" in s && s.sub && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.sub}</div>}
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.urgentActions.title")}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("insights.urgentActions.subtitle")}</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {urgentActions.map((a: Record<string, unknown>, i: number) => {
                  const impact = String(a.impact ?? "");
                  const color = impact === "high" ? "#ef4444" : impact === "medium" ? "#f59e0b" : "#065292";
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 8, borderLeft: `3px solid ${color}`, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{String(a.title ?? "")}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: `${color}15`, color }}>{impact}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{String(a.description ?? "")}</div>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.keyInsights.title")}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("insights.keyInsights.subtitle")}</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {insights.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-tertiary)", fontSize: 12 }}>{t("insights.keyInsights.noInsights")}</div>
                ) : insights.map((ins: Record<string, unknown>, i: number) => {
                  const catColor: Record<string, string> = { academic: "#10b981", assessment: "#8b5cf6", graduation: "#065292", staffing: "#f59e0b", engagement: "#ef4444" };
                  const category = String(ins.category ?? "");
                  return (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{String(ins.title ?? "")}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${catColor[category] || "#6b7280"}15`, color: catColor[category] || "#6b7280", textTransform: "capitalize" }}>{category}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{String(ins.description ?? "")}</div>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.predictions.title")}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("insights.predictions.subtitle")}</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {predictions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-tertiary)", fontSize: 12 }}>{t("insights.predictions.noPredictions")}</div>
                ) : predictions.map((pred: Record<string, unknown>, i: number) => {
                  const confidence = String(pred.confidence ?? "");
                  const confColor = confidence === "high" ? "#10b981" : confidence === "medium" ? "#f59e0b" : "#6b7280";
                  return (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{String(pred.title ?? "")}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${confColor}15`, color: confColor }}>{t("insights.predictions.confidence", { level: confidence })}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{String(pred.description ?? "")}</div>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.recommendations.title")}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("insights.recommendations.subtitle")}</div>
                </div>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {recommendations.map((rec: Record<string, unknown>, i: number) => {
                  const catColor: Record<string, string> = { course_offering: "#10b981", staffing: "#065292", assessment: "#8b5cf6", academic: "#f59e0b" };
                  const catIcon: Record<string, typeof BookOpen> = { course_offering: BookOpen, staffing: Users, assessment: Target, academic: GraduationCap };
                  const category = String(rec.category ?? "");
                  const Icon = catIcon[category] || Lightbulb;
                  return (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", display: "flex", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: `${catColor[category] || "#6b7280"}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon style={{ width: 16, height: 16, color: catColor[category] || "#6b7280" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{String(rec.title ?? "")}</div>
                        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{String(rec.description ?? "")}</div>
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
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.dataSummary.title")}</span>
              </div>
              <div style={{ padding: 16 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>{t("insights.dataSummary.topCourses")}</div>
                    <div className="space-y-2">
                      {metrics.topCourses.map((c: { name: string; count: number }, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 6, background: "var(--admin-bg-hover)" }}>
                          <span style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{c.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.dataSummary.students", { count: c.count })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>{t("insights.dataSummary.byGrade")}</div>
                    <div className="space-y-2">
                      {Object.entries(metrics.byGrade || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, count]) => (
                        <div key={grade} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 6, background: "var(--admin-bg-hover)" }}>
                          <span style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{t("insights.dataSummary.gradeLabel", { grade })}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("insights.dataSummary.students", { count: count as number })}</span>
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
