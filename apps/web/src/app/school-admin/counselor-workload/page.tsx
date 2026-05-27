"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import {
  Users, Mail, CalendarCheck, FileText, ChevronDown, ChevronUp,
  User, GraduationCap,
} from "lucide-react";
import { useState } from "react";

interface AssignedStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel: string | null;
  isActive: boolean;
}

interface CounselorWorkload {
  id: string;
  name: string;
  email: string;
  studentCount: number;
  sessionCount: number;
  noteCount: number;
  assignedStudents: AssignedStudent[];
}

const MAX_STUDENT_LOAD = 25;

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function LoadBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: color }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", minWidth: 50, textAlign: "right" }}>
        {current}/{max}
      </span>
    </div>
  );
}

function CounselorCard({ counselor, index }: { counselor: CounselorWorkload; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        borderRadius: 12,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 24px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, flexShrink: 0,
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>
            {getInitials(counselor.name || "?")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>{counselor.name}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Mail style={{ width: 11, height: 11 }} />
              {counselor.email}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { icon: Users, label: "Students", value: counselor.studentCount, color: "#6366f1" },
            { icon: CalendarCheck, label: "Sessions", value: counselor.sessionCount, color: "#14b8a6" },
            { icon: FileText, label: "Notes", value: counselor.noteCount, color: "#f59e0b" },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: "10px 12px", borderRadius: 8,
              background: "var(--admin-bg-hover)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <stat.icon style={{ width: 14, height: 14, color: stat.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Load bar */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Student Load
          </div>
          <LoadBar current={counselor.studentCount} max={MAX_STUDENT_LOAD} />
        </div>

        {/* Expand button */}
        {counselor.assignedStudents.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 14,
              fontSize: 12, fontWeight: 600, color: "var(--admin-accent-blue, #3b82f6)",
              background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
            }}
          >
            {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
            {expanded ? "Hide" : "Show"} assigned students ({counselor.assignedStudents.length})
          </button>
        )}
      </div>

      {/* Student list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--admin-border-light)", padding: "8px 12px" }}>
              {counselor.assignedStudents.map((student) => (
                <div
                  key={student.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8,
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 15, flexShrink: 0,
                    background: "var(--admin-bg-hover)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <User style={{ width: 13, height: 13, color: "var(--admin-font-tertiary)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{student.name}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{student.email}</div>
                  </div>
                  {student.gradeLevel && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <GraduationCap style={{ width: 10, height: 10 }} />
                      {student.gradeLevel}
                    </span>
                  )}
                  <span style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: student.isActive ? "#22c55e" : "#94a3b8",
                  }} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function CounselorWorkloadPage() {
  const { data, isLoading } = useQuery<CounselorWorkload[]>({
    queryKey: ["counselor-workload"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/counselor-workload");
      return res?.data ?? res ?? [];
    },
  });

  const counselors = data ?? [];
  const totalStudents = counselors.reduce((s, c) => s + c.studentCount, 0);
  const totalSessions = counselors.reduce((s, c) => s + c.sessionCount, 0);

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>
          Administration
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <Users style={{ width: 22, height: 22, color: "#6366f1" }} />
          Counselor Workload
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Overview of each counselor's caseload, sessions, and notes
        </p>
      </motion.div>

      {/* Summary stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
      >
        {[
          { label: "Counselors", value: counselors.length, color: "#6366f1" },
          { label: "Total Students Assigned", value: totalStudents, color: "#14b8a6" },
          { label: "Total Sessions", value: totalSessions, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "16px 20px", borderRadius: 10,
            background: "var(--admin-bg-card)",
            border: "1px solid var(--admin-border-default)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Counselor cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" style={{ background: "var(--admin-bg-hover)", borderRadius: 12 }} />
          ))}
        </div>
      ) : counselors.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center", borderRadius: 12,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
        }}>
          <Users style={{ width: 36, height: 36, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)" }}>No counselors found in your school.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {counselors.map((c, i) => (
            <CounselorCard key={c.id} counselor={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
