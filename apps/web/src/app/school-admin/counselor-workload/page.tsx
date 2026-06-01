"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import {
  Users, Mail, CalendarCheck, FileText, ChevronDown, ChevronUp,
  User, GraduationCap, Plus, X, ArrowRightLeft,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

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

interface SearchStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string | null;
}

function AssignStudentsModal({
  counselorId,
  counselorName,
  alreadyAssignedIds,
  onClose,
  onSuccess,
}: {
  counselorId: string;
  counselorName: string;
  alreadyAssignedIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load all students on mount, filter on search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const searchParam = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
        const res = await apiRequest(`/api/v1/school-admin/students?limit=50${searchParam}`);
        setResults(res?.data ?? res ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, search.trim() ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      await apiRequest(`/api/v1/school-admin/counselors/${counselorId}/assign-students`, {
        method: "POST",
        data: { studentIds: Array.from(selected) },
      });
      toast.success(`Assigned ${selected.size} student(s) to ${counselorName}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error("Failed to assign students", { description: err?.message });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxHeight: "80vh", borderRadius: 12, overflow: "hidden",
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--admin-border-light)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>Assign Students</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>to {counselorName}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px" }}>
          <input
            type="text"
            placeholder="Search students by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
              color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>Loading students...</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>
              {search.trim() ? "No students match your search" : "No students in this school"}
            </div>
          ) : (
            results.map((s) => {
              const alreadyAssigned = alreadyAssignedIds.has(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8, cursor: alreadyAssigned ? "default" : "pointer",
                    background: selected.has(s.id) ? "var(--admin-bg-hover)" : "transparent",
                    opacity: alreadyAssigned ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => { if (!alreadyAssigned) toggleStudent(s.id); }}
                    disabled={alreadyAssigned}
                    style={{ accentColor: "#065292" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
                  </div>
                  {alreadyAssigned && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                      Assigned
                    </span>
                  )}
                  {s.gradeLevel && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                      Gr {s.gradeLevel}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--admin-border-light)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
            {selected.size} selected
          </span>
          <button
            onClick={handleAssign}
            disabled={selected.size === 0 || assigning}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: selected.size === 0 || assigning ? "var(--admin-bg-hover)" : "#065292",
              color: selected.size === 0 || assigning ? "var(--admin-font-tertiary)" : "#fff",
              border: "none", cursor: selected.size === 0 || assigning ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {assigning ? "Assigning..." : "Assign Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReassignDropdown({
  studentId,
  studentName,
  currentCounselorId,
  counselors,
  onSuccess,
}: {
  studentId: string;
  studentName: string;
  currentCounselorId: string;
  counselors: CounselorWorkload[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleReassign = async (newCounselorId: string) => {
    setReassigning(true);
    try {
      await apiRequest(`/api/v1/school-admin/counselors/${currentCounselorId}/assign-students`, {
        method: "DELETE",
        data: { studentIds: [studentId] },
      });
      await apiRequest(`/api/v1/school-admin/counselors/${newCounselorId}/assign-students`, {
        method: "POST",
        data: { studentIds: [studentId] },
      });
      const target = counselors.find((c) => c.id === newCounselorId);
      toast.success(`Reassigned ${studentName} to ${target?.name ?? "new counselor"}`);
      onSuccess();
    } catch (err: any) {
      toast.error("Failed to reassign student", { description: err?.message });
    } finally {
      setReassigning(false);
      setOpen(false);
    }
  };

  const otherCounselors = counselors.filter((c) => c.id !== currentCounselorId);
  if (otherCounselors.length === 0) return null;

  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownHeight = (otherCounselors.length * 52) + 36; // estimate
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < dropdownHeight + 8;
      setDropdownPos({
        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 220),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        title="Reassign to another counselor"
        onClick={handleOpen}
        disabled={reassigning}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center",
          opacity: reassigning ? 0.5 : 1,
        }}
      >
        <ArrowRightLeft style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <div style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          borderRadius: 8, minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          padding: 4,
        }}>
          <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Reassign to
          </div>
          {otherCounselors.map((c) => (
            <button
              key={c.id}
              onClick={() => handleReassign(c.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                borderRadius: 6, fontSize: 13, color: "var(--admin-font-primary)",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.studentCount} students</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CounselorCard({
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
    } catch (err: any) {
      toast.error("Failed to unassign student", { description: err?.message });
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
                  {/* Action buttons — visible on hover */}
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

export default function CounselorWorkloadPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<CounselorWorkload[]>({
    queryKey: ["counselor-workload"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/counselor-workload");
      return res?.data ?? res ?? [];
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["counselor-workload"] });
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
          <Users style={{ width: 22, height: 22, color: "#065292" }} />
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
          { label: "Counselors", value: counselors.length, color: "#065292" },
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
            <CounselorCard key={c.id} counselor={c} index={i} allCounselors={counselors} onRefetch={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
