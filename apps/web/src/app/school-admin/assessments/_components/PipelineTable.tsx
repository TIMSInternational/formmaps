"use client";

import React, { useState } from "react";
import {
  Users, Send, RotateCcw, Filter, Loader2,
  Check, Clock, Minus, Brain,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { PipelineStudent } from "@/services/assessmentCommandService";

const GRADES = [9, 10, 11, 12];
const GRADE_LABELS: Record<number, string> = { 9: "Freshman", 10: "Sophomore", 11: "Junior", 12: "Senior" };
const EXAM_TYPES = ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"];
const EXAM_SHORT: Record<string, string> = {
  PatternRecognition: "Pattern", VerbalReasoning: "Verbal",
  WorkingMemory: "Memory", NumericVelocity: "Numeric", VisualRotation: "Rotation",
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "center", fontWeight: 600,
  color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <Check style={{ width: 14, height: 14, color: "#10b981" }} />;
  if (status === "in_progress") return <Clock style={{ width: 14, height: 14, color: "#f59e0b" }} />;
  return <Minus style={{ width: 14, height: 14, color: "#6b7280" }} />;
}

// ── Student Assessment Detail Dialog ──
function StudentAssessmentDialog({ student, open, onOpenChange }: {
  student: PipelineStudent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!student) return null;

  const pcaEntries = Object.entries(student.pca);
  const pcaDone = pcaEntries.filter(([, v]) => v === "done").length;
  const pcaTotal = pcaEntries.length;

  const statusColor = (s: string) => s === "done" ? "#10b981" : s === "in_progress" ? "#f59e0b" : "#6b7280";
  const statusLabel = (s: string) => s === "done" ? "Completed" : s === "in_progress" ? "In Progress" : "Not Started";
  const statusBg = (s: string) => s === "done" ? "rgba(16,185,129,0.1)" : s === "in_progress" ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)";

  const overallDone = pcaDone + (student.mil === "done" ? 1 : 0) + student.eval360Detail.completed;
  const overallTotal = pcaTotal + 1 + (student.eval360Detail.total || 1);
  const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--admin-border-default)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <Brain style={{ width: 18, height: 18, color: "#065292" }} />
              {student.name}
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
              {student.email} {student.gradeLevel ? `| Grade ${student.gradeLevel}` : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div style={{ padding: 16 }} className="space-y-4">
          {/* Overall Progress */}
          <div style={{ padding: "12px 16px", borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Overall Completion</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: overallPct === 100 ? "#10b981" : "var(--admin-font-primary)" }}>{overallPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${overallPct}%`, borderRadius: 3, background: overallPct === 100 ? "#10b981" : "#065292", transition: "width 0.3s" }} />
            </div>
          </div>

          {/* PCA Exams */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              PCA Cognitive Assessment ({pcaDone}/{pcaTotal})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pcaEntries.map(([name, status]) => (
                <div key={name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                    {EXAM_SHORT[name] || name.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                    background: statusBg(status), color: statusColor(status), textTransform: "uppercase",
                  }}>
                    {statusLabel(status)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* MIL */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              MIL / LIA Assessment
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>Multiple Intelligence Lens</span>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                background: statusBg(student.mil), color: statusColor(student.mil), textTransform: "uppercase",
              }}>
                {statusLabel(student.mil)}
              </span>
            </div>
          </div>

          {/* 360 Evaluation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              360 Evaluation ({student.eval360Detail.completed}/{student.eval360Detail.total || "\u2014"})
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>Evaluator Responses</span>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                background: statusBg(student.eval360), color: statusColor(student.eval360), textTransform: "uppercase",
              }}>
                {statusLabel(student.eval360)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--admin-border-default)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600, background: "transparent",
              color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
            }}
          >
            Close
          </button>
          <a
            href={`/school-admin/users/${student.id}`}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--admin-accent-blue, #065292)", color: "#fff",
              border: "none", cursor: "pointer", textDecoration: "none",
            }}
          >
            View Full Profile
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineTable({ pipeline, onSendReminders, onSetup360, isSendingReminders, isSettingUp360 }: {
  pipeline: PipelineStudent[];
  onSendReminders: (ids: string[], types: string[]) => void;
  onSetup360: (ids: string[]) => void;
  isSendingReminders: boolean;
  isSettingUp360: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<number | null>(null);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [detailStudent, setDetailStudent] = useState<PipelineStudent | null>(null);

  let filtered = pipeline;
  if (gradeFilter) filtered = filtered.filter(s => s.gradeLevel === gradeFilter);
  if (showIncomplete) {
    filtered = filtered.filter(s => {
      const pcaIncomplete = Object.values(s.pca).some(v => v !== "done");
      return pcaIncomplete || s.mil !== "done" || s.eval360 !== "done";
    });
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);
  const pendingTypes: string[] = [];
  if (selectedIds.length > 0) {
    const selectedStudents = filtered.filter(s => selected.has(s.id));
    const hasPcaIncomplete = selectedStudents.some(s => Object.values(s.pca).some(v => v !== "done"));
    const hasMilIncomplete = selectedStudents.some(s => s.mil !== "done");
    const has360Incomplete = selectedStudents.some(s => s.eval360 !== "done");
    if (hasPcaIncomplete) pendingTypes.push("PCA (Cognitive Assessment)");
    if (hasMilIncomplete) pendingTypes.push("MIL (Multiple Intelligence Lens)");
    if (has360Incomplete) pendingTypes.push("360 Evaluation");
  }

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 16, height: 16, color: "#10b981" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            Assessment Pipeline
          </span>
          <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            ({filtered.length} student{filtered.length !== 1 ? "s" : ""})
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Grade filter */}
          <select
            value={gradeFilter || ""}
            onChange={e => setGradeFilter(e.target.value ? parseInt(e.target.value) : null)}
            style={{
              height: 30, borderRadius: 6, padding: "0 8px", fontSize: 11,
              background: "var(--admin-bg-input)", color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)",
            }}
          >
            <option value="">All Grades</option>
            {GRADES.map(g => <option key={g} value={g}>{GRADE_LABELS[g]} ({g})</option>)}
          </select>

          {/* Incomplete filter */}
          <button
            onClick={() => setShowIncomplete(!showIncomplete)}
            style={{
              height: 30, borderRadius: 6, padding: "0 10px", fontSize: 11, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 4,
              background: showIncomplete ? "#f59e0b15" : "transparent",
              color: showIncomplete ? "#f59e0b" : "var(--admin-font-tertiary)",
              border: `1px solid ${showIncomplete ? "#f59e0b40" : "var(--admin-border-default)"}`,
              cursor: "pointer",
            }}
          >
            <Filter style={{ width: 12, height: 12 }} />
            Incomplete Only
          </button>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <>
              <button
                onClick={() => onSendReminders(selectedIds, pendingTypes)}
                disabled={isSendingReminders}
                style={{
                  height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "#065292", color: "#fff", border: "none", cursor: "pointer",
                }}
              >
                {isSendingReminders ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 12, height: 12 }} />}
                Remind ({selected.size})
              </button>
              <button
                onClick={() => onSetup360(selectedIds)}
                disabled={isSettingUp360}
                style={{
                  height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
                }}
              >
                {isSettingUp360 ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <RotateCcw style={{ width: 12, height: 12 }} />}
                Setup 360
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", width: 32 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                  style={{ accentColor: "#065292" }}
                />
              </th>
              <th style={{ ...thStyle, textAlign: "left" }}>Student</th>
              <th style={thStyle}>Grade</th>
              {EXAM_TYPES.map(t => (
                <th key={t} style={thStyle} title={t}>{EXAM_SHORT[t]}</th>
              ))}
              <th style={thStyle}>MIL</th>
              <th style={thStyle}>360</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr
                key={s.id}
                style={{ borderTop: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                onClick={() => setDetailStudent(s)}
              >
                <td style={{ padding: "6px 10px" }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    style={{ accentColor: "#065292" }}
                  />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ fontWeight: 500, color: "var(--admin-accent-blue, #065292)" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
                </td>
                <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--admin-font-secondary)" }}>
                  {s.gradeLevel || "\u2014"}
                </td>
                {EXAM_TYPES.map(t => (
                  <td key={t} style={{ padding: "6px 10px", textAlign: "center" }}>
                    <StatusIcon status={s.pca[t] || "not_started"} />
                  </td>
                ))}
                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                  <StatusIcon status={s.mil} />
                </td>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <StatusIcon status={s.eval360} />
                    {s.eval360Detail.total > 0 && (
                      <span style={{ fontSize: 9, color: "var(--admin-font-tertiary)" }}>
                        {s.eval360Detail.completed}/{s.eval360Detail.total}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "var(--admin-font-tertiary)", fontSize: 13 }}>
                  No students found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <StudentAssessmentDialog
        student={detailStudent}
        open={!!detailStudent}
        onOpenChange={(open) => { if (!open) setDetailStudent(null); }}
      />
    </div>
  );
}
