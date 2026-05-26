"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardCheck, RotateCcw, Shield, Brain, Send, Users,
  Calendar, RefreshCw, Check, Clock, Minus, ChevronDown,
  Sparkles, Loader2, Filter, FileText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTabBar } from "../_components/AdminTabBar";
import { EvaluationsPanel } from "./_components/EvaluationsPanel";
import { ResultsPanel } from "./_components/ResultsPanel";
import {
  getSchedules, saveSchedules, getPipeline, sendReminders,
  setup360, getInsights,
  type PipelineStudent, type AssessmentSchedule, type InsightsData,
} from "@/services/assessmentCommandService";

const GRADES = [9, 10, 11, 12];
const GRADE_LABELS: Record<number, string> = { 9: "Freshman", 10: "Sophomore", 11: "Junior", 12: "Senior" };
const ASSESSMENT_TYPES = ["PCA", "MIL", "360"] as const;
const EXAM_TYPES = ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"];
const EXAM_SHORT: Record<string, string> = {
  PatternRecognition: "Pattern", VerbalReasoning: "Verbal",
  WorkingMemory: "Memory", NumericVelocity: "Numeric", VisualRotation: "Rotation",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <Check style={{ width: 14, height: 14, color: "#10b981" }} />;
  if (status === "in_progress") return <Clock style={{ width: 14, height: 14, color: "#f59e0b" }} />;
  return <Minus style={{ width: 14, height: 14, color: "#6b7280" }} />;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS CARD
// ─────────────────────────────────────────────────────────────────────────────
function InsightsCard({ insights, onRefresh, isRefreshing }: {
  insights: InsightsData | undefined;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (!insights?.hasEnoughData) {
    return (
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>School Insights</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
          {insights?.message || "Insights will appear once enough students complete assessments."}
        </p>
      </div>
    );
  }

  const agg = insights.aggregates!;
  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>AI School Insights</span>
          {insights.cached && (
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>Cached</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            height: 30, borderRadius: 6, padding: "0 10px", fontSize: 11, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", color: "var(--admin-font-tertiary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
          }}
        >
          <RefreshCw style={{ width: 12, height: 12, animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Narrative */}
      {insights.narrative && (
        <p style={{ fontSize: 13, color: "var(--admin-font-secondary)", lineHeight: 1.6, marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--admin-bg-hover)" }}>
          {insights.narrative}
        </p>
      )}

      {/* Metric chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <MetricChip label="Students" value={agg.totalStudents} color="#3b82f6" />
        <MetricChip label="Profiles" value={agg.profilesComplete} color="#10b981" />
        <MetricChip label="360° Reviews" value={agg.eval360Count} color="#f59e0b" />
        {Object.entries(agg.pcaAverages).map(([k, v]) => (
          <MetricChip key={k} label={EXAM_SHORT[k] || k} value={`${v}%`} color="#8b5cf6" />
        ))}
      </div>

      {/* DISC + Career */}
      {(agg.discDistribution || agg.topCareerClusters?.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14 }}>
          {agg.discDistribution && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>DISC Distribution</div>
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(agg.discDistribution).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {agg.topCareerClusters?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>Top Career Clusters</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {agg.topCareerClusters.map(c => (
                  <span key={c.name} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                    {c.name} ({c.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 6, background: `${color}10`,
      border: `1px solid ${color}20`,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE GRID
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleGrid({ schedules, onSave, isSaving }: {
  schedules: AssessmentSchedule[];
  onSave: (s: { gradeLevel: number; assessmentType: string; startDate: string; endDate: string }[]) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, { startDate: string; endDate: string }>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const map: Record<string, { startDate: string; endDate: string }> = {};
    for (const s of schedules) {
      map[`${s.gradeLevel}-${s.assessmentType}`] = {
        startDate: s.startDate.split("T")[0],
        endDate: s.endDate.split("T")[0],
      };
    }
    setDraft(map);
  }, [schedules]);

  const update = (grade: number, type: string, field: "startDate" | "endDate", val: string) => {
    const key = `${grade}-${type}`;
    setDraft(prev => ({ ...prev, [key]: { ...prev[key] || { startDate: "", endDate: "" }, [field]: val } }));
    setDirty(true);
  };

  const handleSave = () => {
    const items = Object.entries(draft)
      .filter(([, v]) => v.startDate && v.endDate)
      .map(([k, v]) => {
        const [grade, type] = k.split("-");
        return { gradeLevel: parseInt(grade), assessmentType: type, startDate: v.startDate, endDate: v.endDate };
      });
    onSave(items);
    setDirty(false);
  };

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar style={{ width: 16, height: 16, color: "#3b82f6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Assessment Schedule</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !dirty}
          style={{
            height: 30, borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 600,
            background: dirty ? "#3b82f6" : "var(--admin-bg-hover)",
            color: dirty ? "#fff" : "var(--admin-font-tertiary)",
            border: dirty ? "none" : "1px solid var(--admin-border-default)",
            cursor: dirty ? "pointer" : "default",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {isSaving ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
          {dirty ? "Save Schedule" : "Saved"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Grade</th>
              {ASSESSMENT_TYPES.map(t => (
                <th key={t} colSpan={2} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>{t}</th>
              ))}
            </tr>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th />
              {ASSESSMENT_TYPES.map(t => (
                <React.Fragment key={t}>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>Start</th>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>End</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRADES.map(g => (
              <tr key={g} style={{ borderTop: "1px solid var(--admin-border-default)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {g} <span style={{ fontWeight: 400, color: "var(--admin-font-tertiary)" }}>({GRADE_LABELS[g]})</span>
                </td>
                {ASSESSMENT_TYPES.map(t => {
                  const key = `${g}-${t}`;
                  const val = draft[key] || { startDate: "", endDate: "" };
                  return (
                    <React.Fragment key={t}>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="date"
                          value={val.startDate}
                          onChange={e => update(g, t, "startDate", e.target.value)}
                          style={{
                            width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 4,
                            border: "1px solid var(--admin-border-default)",
                            background: "var(--admin-bg-input)", color: "var(--admin-font-primary)",
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="date"
                          value={val.endDate}
                          onChange={e => update(g, t, "endDate", e.target.value)}
                          style={{
                            width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 4,
                            border: "1px solid var(--admin-border-default)",
                            background: "var(--admin-bg-input)", color: "var(--admin-font-primary)",
                          }}
                        />
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE TABLE
// ─────────────────────────────────────────────────────────────────────────────
function PipelineTable({ pipeline, onSendReminders, onSetup360, isSendingReminders, isSettingUp360 }: {
  pipeline: PipelineStudent[];
  onSendReminders: (ids: string[], types: string[]) => void;
  onSetup360: (ids: string[]) => void;
  isSendingReminders: boolean;
  isSettingUp360: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<number | null>(null);
  const [showIncomplete, setShowIncomplete] = useState(false);

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
    if (has360Incomplete) pendingTypes.push("360° Evaluation");
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
                  background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer",
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
                Setup 360°
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
                  style={{ accentColor: "#3b82f6" }}
                />
              </th>
              <th style={{ ...thStyle, textAlign: "left" }}>Student</th>
              <th style={thStyle}>Grade</th>
              {EXAM_TYPES.map(t => (
                <th key={t} style={thStyle} title={t}>{EXAM_SHORT[t]}</th>
              ))}
              <th style={thStyle}>MIL</th>
              <th style={thStyle}>360°</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderTop: "1px solid var(--admin-border-default)" }}>
                <td style={{ padding: "6px 10px" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    style={{ accentColor: "#3b82f6" }}
                  />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
                </td>
                <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--admin-font-secondary)" }}>
                  {s.gradeLevel || "—"}
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
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "center", fontWeight: 600,
  color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.04em",
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export default function AssessmentCommandCenter() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("command-center");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "evaluations" || tab === "results" || tab === "command-center") setActiveTab(tab);
  }, [searchParams]);

  // Queries
  const insightsQuery = useQuery({ queryKey: ["assessment-insights"], queryFn: () => getInsights(), staleTime: 1000 * 60 * 10 });
  const schedulesQuery = useQuery({ queryKey: ["assessment-schedules"], queryFn: getSchedules, staleTime: 1000 * 60 * 5 });
  const pipelineQuery = useQuery({ queryKey: ["assessment-pipeline"], queryFn: () => getPipeline(), staleTime: 1000 * 60 * 2 });

  // Mutations
  const refreshInsights = useMutation({
    mutationFn: () => getInsights(true),
    onSuccess: (data) => {
      insightsQuery.refetch();
      toast.success("Insights refreshed");
    },
    onError: () => toast.error("Failed to refresh insights"),
  });

  const saveSchedulesMut = useMutation({
    mutationFn: (s: { gradeLevel: number; assessmentType: string; startDate: string; endDate: string }[]) => saveSchedules(s),
    onSuccess: () => { schedulesQuery.refetch(); toast.success("Schedule saved"); },
    onError: () => toast.error("Failed to save schedule"),
  });

  const remindersMut = useMutation({
    mutationFn: ({ ids, types }: { ids: string[]; types: string[] }) => sendReminders(ids, types),
    onSuccess: (data: any) => {
      toast.success(`Reminders sent to ${data.sent} student${data.sent !== 1 ? "s" : ""}`);
      if (data.failed > 0) toast.warning(`${data.failed} email(s) failed`);
    },
    onError: () => toast.error("Failed to send reminders"),
  });

  const setup360Mut = useMutation({
    mutationFn: (ids: string[]) => setup360(ids),
    onSuccess: (data: any) => {
      toast.success(`360° setup complete: ${data.created} groups created, ${data.emailsSent} invites sent`);
      if (data.skipped > 0) toast.info(`${data.skipped} already existed`);
      pipelineQuery.refetch();
    },
    onError: () => toast.error("Failed to setup 360° evaluations"),
  });

  const isLoading = insightsQuery.isLoading || schedulesQuery.isLoading || pipelineQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[120px]" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[200px]" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Assessment Command Center
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Schedule assessments, track student progress, send reminders, and view AI-powered insights
        </p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "command-center", label: "Command Center", icon: ClipboardCheck },
          { key: "evaluations", label: "360 Evaluations", icon: RotateCcw },
          { key: "results", label: "Results & Reports", icon: FileText },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "command-center" && (
        <>
          {/* Insights */}
          <InsightsCard
            insights={insightsQuery.data}
            onRefresh={() => refreshInsights.mutate()}
            isRefreshing={refreshInsights.isPending}
          />

          {/* Schedule */}
          <ScheduleGrid
            schedules={schedulesQuery.data || []}
            onSave={s => saveSchedulesMut.mutate(s)}
            isSaving={saveSchedulesMut.isPending}
          />

          {/* Pipeline */}
          <PipelineTable
            pipeline={pipelineQuery.data || []}
            onSendReminders={(ids, types) => remindersMut.mutate({ ids, types })}
            onSetup360={ids => setup360Mut.mutate(ids)}
            isSendingReminders={remindersMut.isPending}
            isSettingUp360={setup360Mut.isPending}
          />
        </>
      )}

      {activeTab === "evaluations" && <EvaluationsPanel />}

      {activeTab === "results" && <ResultsPanel />}
    </div>
  );
}
