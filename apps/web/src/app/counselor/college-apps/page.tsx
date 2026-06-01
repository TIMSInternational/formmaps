"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Users, CheckCircle2, Clock, Search, Plus, Trash2,
  Loader2, AlertCircle, Send, ChevronDown,
} from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";

// --- Types ---
interface Student {
  id: string;
  name: string;
  email: string;
}

interface Application {
  id: string;
  collegeName: string;
  universityId?: string;
  fit: "reach" | "match" | "safety";
  deadlineType: "ED" | "EA" | "RD" | "Rolling";
  deadlineDate: string;
  status: "researching" | "applying" | "submitted" | "accepted" | "rejected" | "waitlisted" | "enrolled";
}

interface BatchPrediction {
  collegeName: string;
  universityId?: string;
  percentageDisplay: number;
  classification: string;
  confidence: "high" | "medium" | "low";
  strengths: string[];
  weaknesses: string[];
  predictionSource?: "rule_based" | "ml_logistic" | "ml_ensemble";
  modelMetrics?: { accuracy: number; auc: number; trainedOn: number };
}

const PREDICTION_COLORS: Record<string, { bg: string; text: string }> = {
  safety: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  likely: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6" },
  match: { bg: "rgba(99,102,241,0.1)", text: "#6366f1" },
  competitive: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  reach: { bg: "rgba(249,115,22,0.1)", text: "#f97316" },
  high_reach: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#ef4444",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  researching: { label: "Researching", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  applying: { label: "Applying", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  submitted: { label: "Submitted", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  accepted: { label: "Accepted", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  waitlisted: { label: "Waitlisted", color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  enrolled: { label: "Enrolled", color: "#059669", bg: "rgba(5,150,105,0.1)" },
};

const FIT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reach: { label: "Reach", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  match: { label: "Match", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  safety: { label: "Safety", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

const STATUSES = ["researching", "applying", "submitted", "accepted", "rejected", "waitlisted", "enrolled"] as const;

export default function CollegeAppsPage() {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [collegeSearch, setCollegeSearch] = useState("");
  const [newApp, setNewApp] = useState({ collegeId: "", collegeName: "", fit: "match" as string, deadlineType: "RD" as string, deadlineDate: "" });

  // Fetch students
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? []; return Array.isArray(items) ? items : [];
    },
  });
  const students: Student[] = studentsData ?? [];

  // Fetch applications for selected student
  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ["student-applications", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/applications`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudentId,
  });
  const applications: Application[] = appsData ?? [];

  // Fetch batch predictions for the student
  const { data: predictionsData } = useQuery({
    queryKey: ["student-predictions", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/predict-batch`);
      return (res?.data ?? []) as BatchPrediction[];
    },
    enabled: !!selectedStudentId,
    staleTime: 10 * 60 * 1000,
  });
  const predictions: BatchPrediction[] = predictionsData ?? [];

  // Build prediction lookup
  const predictionMap = new Map<string, BatchPrediction>();
  for (const p of predictions) {
    predictionMap.set(p.collegeName.toLowerCase(), p);
    if (p.universityId) predictionMap.set(p.universityId, p);
  }
  function findPrediction(collegeName: string, universityId?: string): BatchPrediction | undefined {
    if (universityId && predictionMap.has(universityId)) return predictionMap.get(universityId);
    return predictionMap.get(collegeName.toLowerCase());
  }

  // Search colleges
  const { data: collegeResults } = useQuery({
    queryKey: ["college-search", collegeSearch],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/search?q=${encodeURIComponent(collegeSearch)}`);
      return res?.data ?? [];
    },
    enabled: collegeSearch.length >= 2,
  });

  // Update status mutation (also records outcomes for ML training)
  const updateStatus = useMutation({
    mutationFn: async ({ appId, status, app }: { appId: string; status: string; app: Application }) => {
      const result = await apiRequest(`/api/v1/college/applications/${appId}`, {
        method: "PUT",
        data: { appStatus: status },
      });
      // Record admission outcome for ML model training
      if (["accepted", "rejected", "waitlisted"].includes(status)) {
        try {
          await apiRequest("/api/v1/college/outcomes", {
            method: "POST",
            data: {
              studentId: selectedStudentId,
              collegeName: app.collegeName,
              universityId: app.universityId,
              outcome: status,
            },
          });
        } catch {
          // Outcome recording is best-effort; don't block status update
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  // Delete mutation
  const deleteApp = useMutation({
    mutationFn: async (appId: string) => {
      return apiRequest(`/api/v1/college/applications/${appId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] });
      toast.success("Application removed");
    },
    onError: () => toast.error("Failed to delete application"),
  });

  // Add application mutation
  const addApp = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/v1/college/students/${selectedStudentId}/applications`, {
        method: "POST",
        data: {
          universityId: newApp.collegeId || undefined,
          collegeName: newApp.collegeName,
          fitClassification: newApp.fit,
          deadlineType: newApp.deadlineType,
          deadlineDate: newApp.deadlineDate,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] });
      toast.success("Application added");
      setShowAddForm(false);
      setNewApp({ collegeId: "", collegeName: "", fit: "match", deadlineType: "RD", deadlineDate: "" });
      setCollegeSearch("");
    },
    onError: () => toast.error("Failed to add application"),
  });

  // Stats
  const totalApps = applications.length;
  const submittedCount = applications.filter((a) => ["submitted", "accepted", "rejected", "waitlisted", "enrolled"].includes(a.status)).length;
  const acceptedCount = applications.filter((a) => a.status === "accepted" || a.status === "enrolled").length;
  const pendingCount = applications.filter((a) => ["researching", "applying"].includes(a.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>College Prep</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          College Applications
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          Track and manage college applications for your students. Monitor deadlines, statuses, and outcomes.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "TOTAL APPLICATIONS", value: totalApps, icon: GraduationCap, color: "var(--admin-font-primary)" },
          { label: "SUBMITTED", value: submittedCount, icon: Send, color: "#3b82f6" },
          { label: "ACCEPTED", value: acceptedCount, icon: CheckCircle2, color: "#10b981" },
          { label: "PENDING", value: pendingCount, icon: Clock, color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{selectedStudentId ? stat.value : "—"}</span>
          </div>
        ))}
      </motion.div>

      {/* Student Selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Student:</span>
        </div>
        <select
          value={selectedStudentId}
          onChange={(e) => { setSelectedStudentId(e.target.value); setShowAddForm(false); }}
          style={{
            height: 36, borderRadius: 8, padding: "0 12px", fontSize: 13,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", minWidth: 240, fontFamily: "inherit",
          }}
        >
          <option value="">Select a student...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {studentsLoading && <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />}
      </motion.div>

      {/* Applications Table */}
      {selectedStudentId && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          {/* Add Application Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "#6366f1", color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Add Application
            </button>
          </div>

          {/* Add Application Form */}
          {showAddForm && (
            <div style={{
              padding: 16, borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)",
              background: "rgba(99,102,241,0.03)", marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>Add Application</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                {/* College Search */}
                <div style={{ flex: "2 1 200px", position: "relative" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>College</label>
                  <div style={{ position: "relative" }}>
                    <Search style={{ position: "absolute", left: 10, top: 10, width: 14, height: 14, color: "var(--admin-font-light)" }} />
                    <input
                      placeholder="Search colleges..."
                      value={collegeSearch}
                      onChange={(e) => { setCollegeSearch(e.target.value); setNewApp({ ...newApp, collegeId: "", collegeName: "" }); }}
                      style={{
                        width: "100%", height: 34, borderRadius: 6, padding: "0 10px 0 30px", fontSize: 12,
                        border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                        color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                      }}
                    />
                  </div>
                  {collegeResults && collegeResults.length > 0 && !newApp.collegeId && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                      background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
                      borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}>
                      {collegeResults.map((c: any) => (
                        <div
                          key={c.id}
                          onClick={() => { setNewApp({ ...newApp, collegeId: c.id, collegeName: c.name }); setCollegeSearch(c.name); }}
                          style={{
                            padding: "8px 12px", fontSize: 12, color: "var(--admin-font-primary)",
                            cursor: "pointer", transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Deadline Type */}
                <div style={{ flex: "1 1 100px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Deadline Type</label>
                  <select
                    value={newApp.deadlineType}
                    onChange={(e) => setNewApp({ ...newApp, deadlineType: e.target.value })}
                    style={{
                      width: "100%", height: 34, borderRadius: 6, padding: "0 8px", fontSize: 12,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  >
                    <option value="ED">ED</option>
                    <option value="EA">EA</option>
                    <option value="RD">RD</option>
                    <option value="Rolling">Rolling</option>
                  </select>
                </div>

                {/* Deadline Date */}
                <div style={{ flex: "1 1 140px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Deadline</label>
                  <input
                    type="date"
                    value={newApp.deadlineDate}
                    onChange={(e) => setNewApp({ ...newApp, deadlineDate: e.target.value })}
                    style={{
                      width: "100%", height: 34, borderRadius: 6, padding: "0 8px", fontSize: 12,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>

                {/* Fit */}
                <div style={{ flex: "1 1 100px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", display: "block", marginBottom: 4 }}>Fit</label>
                  <select
                    value={newApp.fit}
                    onChange={(e) => setNewApp({ ...newApp, fit: e.target.value })}
                    style={{
                      width: "100%", height: 34, borderRadius: 6, padding: "0 8px", fontSize: 12,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  >
                    <option value="reach">Reach</option>
                    <option value="match">Match</option>
                    <option value="safety">Safety</option>
                  </select>
                </div>

                {/* Submit */}
                <button
                  onClick={() => addApp.mutate()}
                  disabled={addApp.isPending || !newApp.collegeName || !newApp.deadlineDate}
                  style={{
                    height: 34, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#6366f1", color: "#fff", border: "none", cursor: "pointer",
                    opacity: (addApp.isPending || !newApp.collegeName || !newApp.deadlineDate) ? 0.5 : 1,
                  }}
                >
                  {addApp.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.6fr",
              padding: "10px 16px", borderBottom: "1px solid var(--admin-border-light)", background: "var(--admin-bg-hover)",
            }}>
              {["COLLEGE", "CHANCES", "FIT", "DEADLINE TYPE", "DEADLINE DATE", "STATUS", "ACTIONS"].map((h) => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{h}</span>
              ))}
            </div>

            {appsLoading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 44, borderRadius: 6, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : applications.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <GraduationCap style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  No applications yet. Click &quot;Add Application&quot; to get started.
                </p>
              </div>
            ) : (
              applications.map((app, i) => {
                const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.researching;
                const fitCfg = FIT_CONFIG[app.fit] || FIT_CONFIG.match;
                const pred = findPrediction(app.collegeName, app.universityId);
                const predColors = pred ? (PREDICTION_COLORS[pred.classification] || PREDICTION_COLORS.match) : null;
                return (
                  <div key={app.id} style={{
                    display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.6fr",
                    padding: "12px 16px", alignItems: "center",
                    borderBottom: i < applications.length - 1 ? "1px solid var(--admin-border-light)" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{app.collegeName}</span>
                    {/* Chances column */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {pred ? (
                        <>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                            background: predColors!.bg, color: predColors!.text,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                              background: CONFIDENCE_COLORS[pred.confidence] || CONFIDENCE_COLORS.low,
                            }} title={`${pred.confidence} confidence`} />
                            {pred.percentageDisplay}%
                          </span>
                          <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>
                            {pred.predictionSource && pred.predictionSource !== "rule_based"
                              ? `ML${pred.modelMetrics ? ` (${Math.round(pred.modelMetrics.accuracy * 100)}%)` : ""}`
                              : "Est."}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--admin-font-light)" }}>...</span>
                      )}
                    </div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600,
                      padding: "3px 10px", borderRadius: 6, width: "fit-content",
                      background: fitCfg.bg, color: fitCfg.color,
                    }}>
                      {fitCfg.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>{app.deadlineType}</span>
                    <span style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>
                      {new Date(app.deadlineDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <div>
                      <select
                        value={app.status}
                        onChange={(e) => updateStatus.mutate({ appId: app.id, status: e.target.value, app })}
                        style={{
                          height: 28, borderRadius: 6, padding: "0 6px", fontSize: 11, fontWeight: 600,
                          border: "1px solid var(--admin-border-default)",
                          background: statusCfg.bg, color: statusCfg.color,
                          outline: "none", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <button
                        onClick={() => deleteApp.mutate(app.id)}
                        disabled={deleteApp.isPending}
                        title="Remove application"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: "1px solid var(--admin-border-default)", background: "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* Empty state when no student selected */}
      {!selectedStudentId && !studentsLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <Users style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
            Select a student above to view and manage their college applications.
          </p>
        </motion.div>
      )}
    </div>
  );
}
