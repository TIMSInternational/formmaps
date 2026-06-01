"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Radar, Users, CheckCircle2, Clock, AlertTriangle, Search, ChevronRight, RefreshCw, TimerReset, Send, MoreHorizontal, Loader2, CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";
import { getUserEvaluationGroups } from "@/services/evaluationService";

async function extendEvaluationToken(groupId: string, days: number = 7) {
  return apiRequest(`/evaluation/extend-token/${groupId}`, { method: "PATCH", data: { days } });
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

// ── Extend Deadline Picker ──
function ExtendDeadlinePicker({ currentExpiry, isLoading, onExtend, onClose }: {
  currentExpiry: string | null;
  isLoading: boolean;
  onExtend: (days: number) => void;
  onClose: () => void;
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const currentDate = currentExpiry ? new Date(currentExpiry) : new Date();
  const isExpired = currentDate < new Date();

  const presets = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    const diffMs = date.getTime() - Date.now();
    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    onExtend(diffDays);
  };

  return (
    <div style={{
      marginTop: 8, borderRadius: 8,
      background: "var(--admin-bg-card)", border: "1px solid rgba(59,130,246,0.2)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 12px", background: "rgba(59,130,246,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(59,130,246,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CalendarDays style={{ width: 13, height: 13, color: "#3b82f6" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)" }}>Extend Deadline</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: isExpired ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
            color: isExpired ? "#ef4444" : "#3b82f6", fontWeight: 600,
          }}>
            {isExpired ? "EXPIRED" : `Due ${currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </span>
        </div>
        <button onClick={onClose} style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
        </button>
      </div>

      {/* Quick Presets */}
      <div style={{ padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", fontWeight: 600 }}>Quick:</span>
        {presets.map((p) => (
          <button key={p.days} disabled={isLoading}
            onClick={() => onExtend(p.days)}
            style={{
              height: 26, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
              background: "var(--admin-bg-hover)", color: "#3b82f6",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}>
            {isLoading ? "..." : p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          style={{
            height: 26, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
            background: showCalendar ? "#3b82f6" : "var(--admin-bg-hover)",
            color: showCalendar ? "#fff" : "var(--admin-font-primary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
          <CalendarDays style={{ width: 11, height: 11 }} />
          Pick date
        </button>
      </div>

      {/* Calendar */}
      {showCalendar && (
        <div style={{ padding: "0 12px 12px", display: "flex", justifyContent: "center" }}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            disabled={{ before: new Date() }}
            defaultMonth={currentDate > new Date() ? currentDate : new Date()}
            className="rounded-md border"
            style={{ color: "var(--admin-font-primary)" }}
            classNames={{
              button_previous: "h-7 w-7 p-0 flex items-center justify-center border rounded-md hover:bg-gray-100 absolute left-1 top-3",
              button_next: "h-7 w-7 p-0 flex items-center justify-center border rounded-md hover:bg-gray-100 absolute right-1 top-3",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Student 360 Detail Dialog ──
function Student360Dialog({ student, open, onOpenChange }: {
  student: EvalStudent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEval, setNewEval] = useState({ name: "", email: "", relation: "Parent", groupType: "parent" });
  const [addLoading, setAddLoading] = useState(false);
  const [extendingGroupId, setExtendingGroupId] = useState<string | null>(null);
  const [resetConfirmGroup, setResetConfirmGroup] = useState<any>(null);

  const refreshGroups = async () => {
    if (!student) return;
    const data = await getUserEvaluationGroups(student.id);
    setGroups(data || []);
  };

  useEffect(() => {
    if (!student || !open) return;
    setLoading(true);
    setShowAddForm(false);
    setNewEval({ name: "", email: "", relation: "Parent", groupType: "parent" });
    refreshGroups().finally(() => setLoading(false));
  }, [student?.id, open]);

  if (!student) return null;

  const handleAction = async (groupId: string, action: "extend" | "resend" | "reset", days?: number) => {
    setActionLoading(`${groupId}-${action}`);
    try {
      if (action === "extend") {
        await extendEvaluationToken(groupId, days || 7);
        setExtendingGroupId(null);
      }
      else if (action === "resend") await resendEvaluationEmail(groupId);
      else await resetEvaluationCompletion(groupId);
      toast.success(action === "extend" ? `Extended by ${days || 7} day(s)` : action === "resend" ? "Email resent" : "Completion reset");
      await refreshGroups();
    } catch {
      toast.error(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddEvaluator = async () => {
    if (!newEval.name.trim() || !newEval.email.trim()) { toast.error("Name and email required"); return; }
    setAddLoading(true);
    try {
      await apiRequest("/evaluation/create-group", {
        method: "POST",
        data: {
          evaluatorName: newEval.name,
          evaluatorEmail: newEval.email,
          relation: newEval.relation,
          groupType: newEval.groupType,
          evaluatedUserId: student.id,
        },
      });
      toast.success(`Evaluator ${newEval.name} added`);
      setNewEval({ name: "", email: "", relation: "Parent", groupType: "parent" });
      setShowAddForm(false);
      await refreshGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add evaluator");
    } finally {
      setAddLoading(false);
    }
  };

  const handleSendAll = async () => {
    setActionLoading("send-all");
    try {
      await apiRequest(`/evaluation/send-email-invitations/${student.id}`, { method: "POST" });
      toast.success("All invitations sent");
      await refreshGroups();
    } catch {
      toast.error("Failed to send invitations");
    } finally {
      setActionLoading(null);
    }
  };

  const relationOptions = [
    { value: "Parent", group: "parent", label: "Parent / Guardian" },
    { value: "Teacher", group: "teacher", label: "Teacher" },
    { value: "SiblingFriend", group: "sibling_friend", label: "Sibling / Friend" },
    { value: "Self", group: "self", label: "Self Evaluation" },
  ];

  const completed = groups.filter((g: any) => g.isEvaluationCompleted).length;
  const pct = groups.length > 0 ? Math.round((completed / groups.length) * 100) : 0;
  const unsent = groups.filter((g: any) => !g.isEmailSent && !g.isEvaluationCompleted).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--admin-border-default)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <Radar style={{ width: 18, height: 18, color: "#14b8a6" }} />
              {student.name} — 360° Evaluation
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
              {student.email} {student.gradeLevel ? `| Grade ${student.gradeLevel}` : ""} | {completed}/{groups.length} evaluators completed
            </DialogDescription>
          </DialogHeader>
        </div>

        <div style={{ padding: 16, flex: 1, overflow: "auto" }} className="space-y-4">
          {/* Progress */}
          <div style={{ padding: "12px 16px", borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Evaluation Progress</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? "#10b981" : "var(--admin-font-primary)" }}>{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-card)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: pct === 100 ? "#10b981" : "#14b8a6", transition: "width 0.3s" }} />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setShowAddForm(!showAddForm)}
              style={{
                height: 32, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
                background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer",
              }}>
              <Users style={{ width: 12, height: 12 }} />
              Add Evaluator
            </button>
            {groups.length > 0 && unsent > 0 && (
              <button onClick={handleSendAll} disabled={actionLoading === "send-all"}
                style={{
                  height: 32, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent", color: "#3b82f6",
                  border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer",
                }}>
                {actionLoading === "send-all" ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 12, height: 12 }} />}
                Send All Invitations ({unsent})
              </button>
            )}
            {groups.length > 0 && (
              <button onClick={async () => {
                setActionLoading("resend-all");
                try {
                  await apiRequest(`/evaluation/send-email-invitations/${student.id}`, { method: "POST" });
                  toast.success("Invitations resent to all evaluators");
                  await refreshGroups();
                } catch { toast.error("Failed"); }
                finally { setActionLoading(null); }
              }} disabled={!!actionLoading}
                style={{
                  height: 32, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent", color: "var(--admin-font-tertiary)",
                  border: "1px solid var(--admin-border-default)", cursor: "pointer",
                }}>
                <RefreshCw style={{ width: 12, height: 12 }} />
                Resend All
              </button>
            )}
          </div>

          {/* Add Evaluator Form */}
          {showAddForm && (
            <div style={{ padding: 14, borderRadius: 6, border: "1px solid #14b8a640", background: "rgba(20,184,166,0.03)" }} className="space-y-3">
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Add New Evaluator</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Full name" value={newEval.name} onChange={(e) => setNewEval({ ...newEval, name: e.target.value })}
                  style={{ flex: 1, minWidth: 140, height: 34, borderRadius: 6, padding: "0 10px", fontSize: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none" }} />
                <input placeholder="Email address" type="email" value={newEval.email} onChange={(e) => setNewEval({ ...newEval, email: e.target.value })}
                  style={{ flex: 1, minWidth: 180, height: 34, borderRadius: 6, padding: "0 10px", fontSize: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={newEval.relation}
                  onChange={(e) => {
                    const opt = relationOptions.find(o => o.value === e.target.value);
                    setNewEval({ ...newEval, relation: e.target.value, groupType: opt?.group || "parent" });
                  }}
                  style={{ flex: 1, height: 34, borderRadius: 6, padding: "0 8px", fontSize: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none" }}>
                  {relationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={handleAddEvaluator} disabled={addLoading || !newEval.name.trim() || !newEval.email.trim()}
                  style={{
                    height: 34, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer",
                    opacity: (addLoading || !newEval.name.trim() || !newEval.email.trim()) ? 0.6 : 1,
                  }}>
                  {addLoading ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : "Add"}
                </button>
                <button onClick={() => setShowAddForm(false)}
                  style={{ height: 34, borderRadius: 6, padding: "0 12px", fontSize: 12, background: "transparent", color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Evaluator Groups */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Loader2 style={{ width: 20, height: 20, color: "var(--admin-font-tertiary)", margin: "0 auto", animation: "spin 1s linear infinite" }} />
            </div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Radar style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>No evaluators assigned yet. Click &quot;Add Evaluator&quot; to get started.</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Evaluators ({groups.length})
              </div>
              {groups.map((g: any) => {
                const isComplete = g.isEvaluationCompleted;
                const isExpired = g.tokenExpiryDate && new Date(g.tokenExpiryDate) < new Date() && !isComplete;
                return (
                  <div key={g.id} style={{
                    padding: "10px 14px", borderRadius: 6,
                    border: "1px solid var(--admin-border-default)",
                    background: isComplete ? "rgba(16,185,129,0.03)" : isExpired ? "rgba(239,68,68,0.03)" : "var(--admin-bg-card)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{g.evaluatorName}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                            background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                            textTransform: "uppercase", border: "1px solid var(--admin-border-default)",
                          }}>
                            {g.relation || g.groupType}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                          {g.evaluatorEmail}
                          {g.tokenExpiryDate && !isComplete && (
                            <span style={{ marginLeft: 8, color: isExpired ? "#ef4444" : "var(--admin-font-tertiary)" }}>
                              | Expires {new Date(g.tokenExpiryDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
                          background: isComplete ? "rgba(16,185,129,0.1)" : isExpired ? "rgba(239,68,68,0.1)" : g.isEmailSent ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)",
                          color: isComplete ? "#10b981" : isExpired ? "#ef4444" : g.isEmailSent ? "#f59e0b" : "#6b7280",
                          textTransform: "uppercase",
                        }}>
                          {isComplete ? "Completed" : isExpired ? "Expired" : g.isEmailSent ? "Pending" : "Not Sent"}
                        </span>
                        {!isComplete && (
                          <div style={{ display: "flex", gap: 2 }}>
                            <button title="Extend deadline" disabled={!!actionLoading}
                              onClick={() => setExtendingGroupId(extendingGroupId === g.id ? null : g.id)}
                              style={{ width: 26, height: 26, borderRadius: 4, border: extendingGroupId === g.id ? "1px solid #3b82f6" : "1px solid var(--admin-border-default)", background: extendingGroupId === g.id ? "rgba(59,130,246,0.05)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <TimerReset style={{ width: 11, height: 11, color: "#3b82f6" }} />
                            </button>
                            <button title="Resend invitation" disabled={!!actionLoading}
                              onClick={() => handleAction(g.id, "resend")}
                              style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {actionLoading === `${g.id}-resend` ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 11, height: 11, color: "#f59e0b" }} />}
                            </button>
                          </div>
                        )}
                        {isComplete && (
                          <button title="Reset completion" disabled={!!actionLoading}
                            onClick={() => setResetConfirmGroup(g)}
                            style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <RefreshCw style={{ width: 11, height: 11, color: "#ef4444" }} />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Extend deadline picker */}
                    {extendingGroupId === g.id && !isComplete && (
                      <ExtendDeadlinePicker
                        currentExpiry={g.tokenExpiryDate}
                        isLoading={actionLoading === `${g.id}-extend`}
                        onExtend={(days) => handleAction(g.id, "extend", days)}
                        onClose={() => setExtendingGroupId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--admin-border-default)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => onOpenChange(false)}
            style={{ height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)", cursor: "pointer" }}>
            Close
          </button>
          <a href={`/school-admin/users/${student.id}`}
            style={{ height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "var(--admin-accent-blue, #3b82f6)", color: "#fff", textDecoration: "none" }}>
            View Full Profile
          </a>
        </div>
      </DialogContent>

      {/* Reset Confirmation Dialog */}
      <Dialog open={!!resetConfirmGroup} onOpenChange={(o) => { if (!o) setResetConfirmGroup(null); }}>
        <DialogContent className="max-w-sm" style={{ padding: 0, overflow: "hidden" }} aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Reset Evaluation Confirmation</DialogTitle>
            <DialogDescription>Confirm that you want to reset this evaluation</DialogDescription>
          </DialogHeader>
          <div style={{ padding: "20px 24px", textAlign: "center" }} className="space-y-4">
            <div style={{
              width: 48, height: 48, borderRadius: "50%", margin: "0 auto",
              background: "rgba(239,68,68,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AlertTriangle style={{ width: 24, height: 24, color: "#ef4444" }} />
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)", marginBottom: 4 }}>
                Reset Evaluation?
              </h3>
              <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>
                This will <strong style={{ color: "#ef4444" }}>permanently delete</strong> all responses from{" "}
                <strong>{resetConfirmGroup?.evaluatorName}</strong> ({resetConfirmGroup?.relation}).
                They will need to complete the evaluation again from scratch.
              </p>
            </div>

            <div style={{
              padding: "10px 14px", borderRadius: 6,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
              fontSize: 11, color: "#ef4444", fontWeight: 500, textAlign: "left",
            }}>
              This action cannot be undone. The evaluator will receive a new invitation link and their previous answers will be erased.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingTop: 4 }}>
              <button onClick={() => setResetConfirmGroup(null)}
                style={{
                  height: 36, borderRadius: 6, padding: "0 20px",
                  fontSize: 12, fontWeight: 600, background: "transparent",
                  color: "var(--admin-font-primary)",
                  border: "1px solid var(--admin-border-default)", cursor: "pointer",
                }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const gId = resetConfirmGroup?.id;
                  setResetConfirmGroup(null);
                  if (gId) await handleAction(gId, "reset");
                }}
                disabled={!!actionLoading}
                style={{
                  height: 36, borderRadius: 6, padding: "0 20px",
                  fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#ef4444", color: "#fff",
                  border: "none", cursor: "pointer",
                }}>
                {actionLoading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
                Yes, Reset Evaluation
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export function EvaluationsPanel() {
  const [students, setStudents] = useState<EvalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [detailStudent, setDetailStudent] = useState<EvalStudent | null>(null);

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
                transition: "background 0.1s", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              onClick={() => setDetailStudent(s)}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-accent-blue, #3b82f6)" }}>{s.name}</p>
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
                <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
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

      <Student360Dialog
        student={detailStudent}
        open={!!detailStudent}
        onOpenChange={(open) => { if (!open) setDetailStudent(null); }}
      />
    </div>
  );
}
