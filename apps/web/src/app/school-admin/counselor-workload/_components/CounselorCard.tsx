"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users, Mail, CalendarCheck, FileText, ChevronDown, ChevronUp,
  User, GraduationCap, Plus, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";
import { LoadBar } from "./LoadBar";
import { AssignStudentsModal } from "./AssignStudentsModal";
import { ReassignDropdown } from "./ReassignDropdown";
import type { CounselorWorkload } from "./ReassignDropdown";

const MAX_STUDENT_LOAD = 25;

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export type { CounselorWorkload };

export function CounselorCard({
  counselor,
  index,
  allCounselors,
  onRefetch,
}: {
  counselor: CounselorWorkload;
  index: number;
  allCounselors: CounselorWorkload[];
  onRefetch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  const handleUnassign = async (studentId: string) => {
    setUnassigning(true);
    try {
      await apiRequest(`/api/v1/school-admin/counselors/${counselor.id}/assign-students`, {
        method: "DELETE",
        data: { studentIds: [studentId] },
      });
      const student = counselor.assignedStudents.find((s) => s.id === studentId);
      toast.success(`Unassigned ${student?.name ?? "student"} from ${counselor.name}`);
      onRefetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast.error("Failed to unassign student", { description: message });
    } finally {
      setUnassigning(false);
      setConfirmUnassign(null);
    }
  };

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
            background: "#065292",
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
          <button
            onClick={() => setShowAssignModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: "#065292", color: "#fff",
              border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            Assign Students
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { icon: Users, label: "Students", value: counselor.studentCount, color: "#065292" },
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
              fontSize: 12, fontWeight: 600, color: "var(--admin-accent-blue, #065292)",
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
                  className="group"
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8, position: "relative",
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
                  {/* Action buttons */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                    <ReassignDropdown
                      studentId={student.id}
                      studentName={student.name}
                      currentCounselorId={counselor.id}
                      counselors={allCounselors}
                      onSuccess={onRefetch}
                    />
                    {confirmUnassign === student.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          onClick={() => handleUnassign(student.id)}
                          disabled={unassigning}
                          style={{
                            padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: "#ef4444", color: "#fff",
                            border: "none", cursor: "pointer", fontFamily: "inherit",
                            opacity: unassigning ? 0.5 : 1,
                          }}
                        >
                          {unassigning ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmUnassign(null)}
                          style={{
                            padding: "2px 6px", borderRadius: 6, fontSize: 11,
                            background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)",
                            border: "none", cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        title="Unassign student"
                        onClick={() => setConfirmUnassign(student.id)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 4,
                          color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center",
                        }}
                      >
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAssignModal && (
        <AssignStudentsModal
          counselorId={counselor.id}
          counselorName={counselor.name}
          alreadyAssignedIds={new Set(counselor.assignedStudents.map(s => s.id))}
          onClose={() => setShowAssignModal(false)}
          onSuccess={onRefetch}
        />
      )}
    </motion.div>
  );
}
