"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Radar, Users, CheckCircle2, Clock, AlertTriangle, Search, Send, FileText,
} from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";
import Link from "next/link";
import { Student360Dialog, type EvalStudent } from "./_components/Student360Dialog";

export default function CounselorEvaluationsPage() {
  const { t } = useTranslation("counselor");
  const [students, setStudents] = useState<EvalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [detailStudent, setDetailStudent] = useState<EvalStudent | null>(null);

  const statusConfig = {
    completed: { label: t("evaluations.statusCompleted", "Completed"), color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    in_progress: { label: t("evaluations.statusInProgress", "In Progress"), color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    not_started: { label: t("evaluations.statusNotStarted", "Not Started"), color: "var(--admin-font-tertiary)", bg: "var(--admin-bg-hover)" },
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/v1/counselor/evaluations/overview");
        const data = res?.data ?? [];
        setStudents(data);
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

  const filterLabels: Record<string, string> = {
    all: t("evaluations.filterAll", "All"),
    completed: t("evaluations.filterCompleted", "Completed"),
    in_progress: t("evaluations.filterInProgress", "In Progress"),
    not_started: t("evaluations.filterNotStarted", "Not Started"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>{t("evaluations.badge", "Student Assessments")}</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          {t("evaluations.title", "360° Evaluations")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          {t("evaluations.subtitle", "Track evaluation progress for your assigned students, manage evaluators, and send invitation reminders.")}
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: t("evaluations.statMyStudents", "MY STUDENTS"), value: students.length, icon: Users, color: "var(--admin-font-primary)" },
          { label: t("evaluations.statCompleted", "COMPLETED"), value: completedCount, icon: CheckCircle2, color: "#10b981" },
          { label: t("evaluations.statInProgress", "IN PROGRESS"), value: inProgressCount, icon: Clock, color: "#f59e0b" },
          { label: t("evaluations.statNotStarted", "NOT STARTED"), value: notStartedCount, icon: AlertTriangle, color: "var(--admin-font-tertiary)" },
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
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("evaluations.overallCompletion", "Overall Completion")}</span>
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
          <input placeholder={t("students.searchPlaceholder", "Search students...")} value={search} onChange={(e) => setSearch(e.target.value)}
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
              {filterLabels[f]}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "10px 16px", borderBottom: "1px solid var(--admin-border-light)", background: "var(--admin-bg-hover)" }}>
          {[
            t("evaluations.colStudent", "STUDENT"),
            t("evaluations.colGrade", "GRADE"),
            t("evaluations.colEvaluators", "EVALUATORS"),
            t("evaluations.colSelf", "SELF"),
            t("evaluations.colStatus", "STATUS"),
            t("evaluations.colActions", "ACTIONS"),
          ].map((h) => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(5)].map((_, i) => <div key={i} style={{ height: 44, borderRadius: 6, background: "var(--admin-bg-hover)" }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Radar style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
              {search || filterStatus !== "all" ? t("evaluations.noStudentsFilter", "No students match your filter.") : t("evaluations.noStudentsYet", "No students assigned to you yet.")}
            </p>
          </div>
        ) : (
          filtered.map((s, i) => {
            const cfg = statusConfig[s.status as keyof typeof statusConfig] ?? statusConfig.not_started;
            return (
              <div key={s.studentId} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 16px", alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--admin-border-light)" : "none",
                transition: "background 0.1s", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              onClick={() => setDetailStudent(s)}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-accent-blue, #065292)" }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{s.email}</p>
                </div>
                <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                  {s.gradeLevel ? t("evaluations.gradeN", { n: s.gradeLevel }) : "—"}
                </span>
                <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                  {s.completedEvaluators}/{s.totalEvaluators}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.selfCompleted ? "#10b981" : "var(--admin-font-light)" }}>
                  {s.selfCompleted ? t("evaluations.selfDone", "Done") : t("evaluations.selfPending", "Pending")}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                  padding: "3px 10px", borderRadius: 6, width: "fit-content",
                  background: cfg.bg, color: cfg.color,
                }}>
                  {cfg.label}
                </span>
                <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button title="Resend invitation emails" onClick={async () => {
                    try {
                      await apiRequest(`/evaluation/send-email-invitations/${s.studentId}`, { method: "POST" });
                      toast.success(`Invitations resent for ${s.name}`);
                    } catch { toast.error("Failed to resend"); }
                  }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Send style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                  </button>
                  <Link href={`/counselor/evaluations/${s.studentId}/report`} title="View vocational report"
                    style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </motion.div>

      <Student360Dialog
        student={detailStudent}
        open={!!detailStudent}
        onOpenChange={(open) => { if (!open) setDetailStudent(null); }}
      />
    </div>
  );
}
