"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Users, BarChart3, BookOpen, GraduationCap, TrendingUp,
  ClipboardCheck, AlertTriangle, CheckCircle2, ArrowRight,
  UserPlus, Target, Activity, Bell, Sparkles, Loader2,
  FileText, Brain, Lightbulb, Zap, ChevronRight,
} from "lucide-react";
import { useSchoolAdminStats, useStudents } from "@/hooks/useSchoolAdmin";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useState } from "react";

// ─── AI BRIEFING ───
function AIBriefing() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sa-ai-insights"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/ai-insights");
      return res?.data ?? res;
    },
    enabled: false,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (!data && !isLoading) {
    return (
      <div style={{
        gridColumn: "1 / -1", padding: "24px 28px", borderRadius: 10,
        background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
        border: "1px solid rgba(139,92,246,0.15)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles style={{ width: 22, height: 22, color: "#8b5cf6" }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary)" }}>AI School Briefing</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Get an AI-generated analysis of your school's current state, risks, and recommendations</div>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} style={{
          height: 40, borderRadius: 8, padding: "0 24px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff",
          border: "none", cursor: "pointer", flexShrink: 0,
        }}>
          <Sparkles style={{ width: 15, height: 15 }} /> Generate Briefing
        </button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div style={{
        gridColumn: "1 / -1", padding: "32px", borderRadius: 10,
        background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", textAlign: "center",
      }}>
        <Loader2 style={{ width: 24, height: 24, color: "#8b5cf6", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#8b5cf6" }}>Analyzing your school data...</div>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Reviewing students, assessments, grades, and graduation progress</div>
      </div>
    );
  }

  const urgentActions = data?.urgentActions || [];
  const briefing = data?.weeklyBriefing || "";

  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Briefing Summary */}
      {briefing && (
        <div style={{
          padding: "16px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
          border: "1px solid rgba(139,92,246,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Sparkles style={{ width: 14, height: 14, color: "#8b5cf6" }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8b5cf6" }}>AI Briefing</span>
            <Link href="/school-admin/insights" style={{ marginLeft: "auto", fontSize: 11, color: "#8b5cf6", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              Full Analysis <ChevronRight style={{ width: 10, height: 10 }} />
            </Link>
          </div>
          <div style={{ fontSize: 13, color: "var(--admin-font-primary)", lineHeight: 1.6 }}>{briefing}</div>
        </div>
      )}

      {/* Urgent Actions */}
      {urgentActions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(urgentActions.length, 3)}, 1fr)`, gap: 10 }}>
          {urgentActions.slice(0, 3).map((action: any, i: number) => {
            const color = action.impact === "high" ? "#ef4444" : action.impact === "medium" ? "#f59e0b" : "#3b82f6";
            return (
              <div key={i} style={{
                padding: "14px 16px", borderRadius: 8, borderLeft: `3px solid ${color}`,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Zap style={{ width: 12, height: 12, color }} />
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color, letterSpacing: "0.06em" }}>{action.impact} impact</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{action.title}</div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{action.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AT-RISK STUDENTS ───
function AtRiskWidget() {
  const { data } = useQuery({
    queryKey: ["sa-pipeline-summary"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/assessments/pipeline?status=incomplete");
      return res?.data ?? res ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const students = Array.isArray(data) ? data : [];
  const atRisk = students.filter((s: any) => {
    const pcaIncomplete = Object.values(s.pca || {}).filter(v => v !== "done").length;
    return pcaIncomplete >= 3 || (s.mil !== "done" && s.eval360 !== "done");
  });

  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "#ef4444" }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#ef4444" }}>Needs Attention</span>
        </div>
        <Link href="/school-admin/assessments" style={{ fontSize: 11, color: "var(--admin-font-tertiary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          View all <ArrowRight style={{ width: 10, height: 10 }} />
        </Link>
      </div>
      {atRisk.length === 0 ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          <CheckCircle2 style={{ width: 24, height: 24, color: "#10b981", margin: "0 auto 8px" }} />
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>All students on track</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {atRisk.slice(0, 5).map((s: any) => {
            const pcaMissing = Object.values(s.pca || {}).filter(v => v !== "done").length;
            return (
              <Link key={s.id} href={`/school-admin/users/${s.id}`} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6,
                background: "var(--admin-bg-hover)", textDecoration: "none",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444" }}>{s.name?.charAt(0)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>
                    {pcaMissing} PCA missing{s.mil !== "done" ? " · MIL incomplete" : ""}{s.eval360 !== "done" ? " · 360 pending" : ""}
                  </div>
                </div>
              </Link>
            );
          })}
          {atRisk.length > 5 && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", textAlign: "center", paddingTop: 4 }}>+{atRisk.length - 5} more</div>}
        </div>
      )}
    </div>
  );
}

// ─── ASSESSMENT PROGRESS ───
function AssessmentProgress() {
  const { data } = useQuery({
    queryKey: ["sa-assess-status"],
    queryFn: async () => { const res = await apiRequest("/api/v1/school-admin/assessments/status"); return res?.data ?? res ?? {}; },
    staleTime: 5 * 60 * 1000,
  });
  const d = data as any;
  const rate = d?.completionRate ?? 0;
  const bars = [
    { label: "Completed", value: d?.completed ?? 0, color: "#10b981", pct: d?.totalStudents ? Math.round(((d?.completed ?? 0) / d.totalStudents) * 100) : 0 },
    { label: "In Progress", value: d?.inProgress ?? 0, color: "#f59e0b", pct: d?.totalStudents ? Math.round(((d?.inProgress ?? 0) / d.totalStudents) * 100) : 0 },
    { label: "Not Started", value: d?.notStarted ?? 0, color: "#6b7280", pct: d?.totalStudents ? Math.round(((d?.notStarted ?? 0) / d.totalStudents) * 100) : 0 },
  ];

  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Target style={{ width: 14, height: 14, color: "#8b5cf6" }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)" }}>Assessment Progress</span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444" }}>{rate}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden", marginBottom: 12, display: "flex" }}>
        {bars.map((b) => <div key={b.label} style={{ height: "100%", width: `${b.pct}%`, background: b.color }} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
              <span style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>{b.label}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ACTION ITEMS ───
function ActionItems() {
  const { data: alertsData } = useQuery({
    queryKey: ["sa-alerts-summary"],
    queryFn: async () => { const res = await apiRequest("/api/v1/alerts/summary"); return res?.data ?? res ?? {}; },
    staleTime: 5 * 60 * 1000,
  });
  const alerts = alertsData as any;
  const items = [
    alerts?.critical > 0 && { label: `${alerts.critical} critical alert${alerts.critical > 1 ? "s" : ""}`, color: "#ef4444", icon: AlertTriangle, href: "/school-admin/messages?tab=alerts" },
    alerts?.high > 0 && { label: `${alerts.high} high priority`, color: "#f59e0b", icon: Bell, href: "/school-admin/messages?tab=alerts" },
    alerts?.newSinceLogin > 0 && { label: `${alerts.newSinceLogin} new since login`, color: "#3b82f6", icon: Activity, href: "/school-admin/messages?tab=alerts" },
  ].filter(Boolean);

  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <ClipboardCheck style={{ width: 14, height: 14, color: "#3b82f6" }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)" }}>Action Items</span>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <CheckCircle2 style={{ width: 20, height: 20, color: "#10b981", margin: "0 auto 6px" }} />
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>All clear</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item: any, i) => (
            <Link key={i} href={item.href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "var(--admin-bg-hover)", textDecoration: "none" }}>
              <item.icon style={{ width: 14, height: 14, color: item.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{item.label}</span>
              <ArrowRight style={{ width: 10, height: 10, color: "var(--admin-font-tertiary)", marginLeft: "auto" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RECENT STUDENTS ───
function RecentStudents() {
  const { data } = useStudents({ limit: 20, sortBy: "createdAt", sortOrder: "desc" });
  const students = (data?.data || []).filter((s: any) => {
    const r = (s.role || s.roleName || "").toLowerCase();
    return r === "student" || r === "students";
  }).slice(0, 5);

  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <UserPlus style={{ width: 14, height: 14, color: "#10b981" }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)" }}>Recent Students</span>
        </div>
        <Link href="/school-admin/users" style={{ fontSize: 11, color: "var(--admin-font-tertiary)", textDecoration: "none" }}>View all</Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {students.length > 0 ? students.map((s: any) => (
          <Link key={s.id} href={`/school-admin/users/${s.id}`} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6,
            background: "var(--admin-bg-hover)", textDecoration: "none",
          }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg, #14b8a6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 600 }}>
              {s.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.name}</div>
            </div>
            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{s.gradeLevel ? `G${s.gradeLevel}` : "—"}</span>
          </Link>
        )) : (
          <div style={{ textAlign: "center", padding: 20, color: "var(--admin-font-tertiary)", fontSize: 12 }}>No students yet</div>
        )}
      </div>
    </div>
  );
}

// ─── NAV CARDS ───
const navCards = [
  { label: "Students", sub: "Roster, invites, staff", icon: Users, href: "/school-admin/users", color: "#3b82f6" },
  { label: "Academics", sub: "Courses, GPA, graduation", icon: BookOpen, href: "/school-admin/academics", color: "#10b981" },
  { label: "Assessments", sub: "Pipeline, schedule, 360", icon: ClipboardCheck, href: "/school-admin/assessments", color: "#8b5cf6" },
  { label: "AI Insights", sub: "School-wide analysis", icon: Sparkles, href: "/school-admin/insights", color: "#f59e0b" },
];

// ─── MAIN DASHBOARD ───
export default function SchoolAdminDashboard() {
  const { t } = useTranslation();
  const { data: stats } = useSchoolAdminStats();

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, color: "var(--admin-font-primary)" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--admin-font-primary)" }}>School Dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Real-time overview of your school&apos;s performance and AI-powered insights</p>
        </div>

        {/* Top Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {[
            { label: "Students", value: stats?.totalStudents?.toLocaleString() || "—", icon: Users, color: "#3b82f6" },
            { label: "Assessments", value: stats?.completedAssessments?.toLocaleString() || "—", icon: ClipboardCheck, color: "#8b5cf6" },
            { label: "Avg Score", value: stats ? `${(stats.averageScore || 0).toFixed(0)}%` : "—", icon: TrendingUp, color: "#10b981" },
            { label: "Courses", value: (stats as any)?.totalCourses?.toLocaleString() || "—", icon: GraduationCap, color: "#f59e0b" },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)" }}>{s.label}</span>
                <s.icon style={{ width: 14, height: 14, color: s.color }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
            </motion.div>
          ))}
        </div>

        {/* AI Briefing */}
        <AIBriefing />

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <AtRiskWidget />
          <AssessmentProgress />
          <ActionItems />
        </div>

        {/* Bottom: Quick Nav + Recent */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)", marginBottom: 8 }}>Quick Navigation</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {navCards.map((c) => (
                <Link key={c.href} href={c.href} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 8,
                  border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                  textDecoration: "none", transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${c.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <c.icon style={{ width: 18, height: 18, color: c.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <RecentStudents />
        </div>
      </div>
    </ErrorBoundary>
  );
}
