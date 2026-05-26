"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Radar, Users, CheckCircle2, Clock, AlertTriangle, Search, ChevronRight, RefreshCw, TimerReset, Send, MoreHorizontal } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";

async function extendEvaluationToken(groupId: string) {
  return apiRequest(`/evaluation/extend-token/${groupId}`, { method: "PATCH" });
}
async function resetEvaluationCompletion(groupId: string) {
  return apiRequest(`/evaluation/reset-completion/${groupId}`, { method: "PATCH" });
}
async function resendEvaluationEmail(groupId: string) {
  return apiRequest(`/evaluation/resend-email/${groupId}`, { method: "POST" });
}

interface EvalStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel: number | null;
  totalEvaluators: number;
  completedEvaluators: number;
  selfCompleted: boolean;
  status: "completed" | "in_progress" | "not_started";
}

const statusConfig = {
  completed: { label: "Completed", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  not_started: { label: "Not Started", color: "var(--admin-font-tertiary)", bg: "var(--admin-bg-hover)" },
};

export default function SchoolAdminEvaluationsPage() {
  const [students, setStudents] = useState<EvalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        // Fetch all students in school
        const res = await apiRequest("/api/v1/school-admin/students?limit=200", { method: "GET" });
        const studentList = res?.data?.data ?? res?.data ?? [];

        // Fetch evaluation groups for all students
        const evalRes = await apiRequest("/api/v1/school-admin/evaluations/overview", { method: "GET" }).catch(() => null);
        const evalMap = new Map<string, { totalEvaluators: number; completedEvaluators: number; selfCompleted: boolean }>();
        if (evalRes?.data) {
          for (const e of evalRes.data) {
            evalMap.set(e.studentId, { totalEvaluators: e.totalEvaluators, completedEvaluators: e.completedEvaluators, selfCompleted: e.selfCompleted });
          }
        }

        const mapped: EvalStudent[] = studentList.map((s: any) => {
          const eval_ = evalMap.get(s.id);
          const total = eval_?.totalEvaluators ?? 0;
          const completed = eval_?.completedEvaluators ?? 0;
          const status = total === 0 ? "not_started" : completed >= total && eval_?.selfCompleted ? "completed" : "in_progress";
          return { id: s.id, name: s.name, email: s.email, gradeLevel: s.gradeLevel, totalEvaluators: total, completedEvaluators: completed, selfCompleted: eval_?.selfCompleted ?? false, status };
        });

        setStudents(mapped);
      } catch {
        toast.error("Failed to load evaluation data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = students.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const completedCount = students.filter((s) => s.status === "completed").length;
  const inProgressCount = students.filter((s) => s.status === "in_progress").length;
  const notStartedCount = students.filter((s) => s.status === "not_started").length;
  const completionRate = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
          360° Evaluations
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          School-wide overview of student evaluation completion and progress.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "TOTAL STUDENTS", value: students.length, icon: Users, color: "var(--admin-font-primary)" },
          { label: "COMPLETED", value: completedCount, icon: CheckCircle2, color: "#10b981" },
          { label: "IN PROGRESS", value: inProgressCount, icon: Clock, color: "#f59e0b" },
          { label: "NOT STARTED", value: notStartedCount, icon: AlertTriangle, color: "var(--admin-font-tertiary)" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{loading ? "—" : stat.value}</span>
          </div>
        ))}
      </motion.div>

      {/* Completion bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Overall Completion</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{completionRate}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, width: `${completionRate}%`, background: "linear-gradient(90deg, #10b981, #059669)", transition: "width 0.5s" }} />
        </div>
      </motion.div>

      {/* Filter + Search */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", flex: "1 1 240px", maxWidth: 360 }}>
          <Search style={{ width: 14, height: 14, color: "var(--admin-font-light)", flexShrink: 0 }} />
          <input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["all", "completed", "in_progress", "not_started"].map((f) => (
            <button key={f} onClick={() => setFilterStatus(f)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid var(--admin-border-default)",
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s",
                background: filterStatus === f ? "var(--admin-font-primary)" : "var(--admin-bg-card)",
                color: filterStatus === f ? "var(--admin-bg-card)" : "var(--admin-font-secondary)",
              }}>
              {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f === "not_started" ? "Not Started" : "Completed"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "10px 16px", borderBottom: "1px solid var(--admin-border-light)", background: "var(--admin-bg-hover)" }}>
          {["STUDENT", "GRADE", "EVALUATORS", "SELF", "STATUS", "ACTIONS"].map((h) => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(6)].map((_, i) => <div key={i} style={{ height: 44, borderRadius: 6, background: "var(--admin-bg-hover)" }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Radar style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No students match your filter.</p>
          </div>
        ) : (
          filtered.map((s, i) => {
            const cfg = statusConfig[s.status];
            return (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 16px", alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--admin-border-light)" : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{s.email}</p>
                </div>
                <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                  {s.gradeLevel ? `Grade ${s.gradeLevel}` : "—"}
                </span>
                <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                  {s.completedEvaluators}/{s.totalEvaluators}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.selfCompleted ? "#10b981" : "var(--admin-font-light)" }}>
                  {s.selfCompleted ? "Done" : "Pending"}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                  padding: "3px 10px", borderRadius: 6, width: "fit-content",
                  background: cfg.bg, color: cfg.color,
                }}>
                  {cfg.label}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button title="Resend invitation emails" onClick={async () => {
                    try {
                      await apiRequest(`/evaluation/send-email-invitations/${s.id}`, { method: "POST" });
                      toast.success(`Invitations resent for ${s.name}`);
                    } catch { toast.error("Failed to resend"); }
                  }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Send style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
