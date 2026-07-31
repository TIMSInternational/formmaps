"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Users, CheckCircle2, Clock, Send, Plus, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";
import { ApplicationRow } from "./_components/ApplicationRow";
import { AddApplicationForm } from "./_components/AddApplicationForm";

interface Student { id: string; name: string; email: string; }
interface Application {
  id: string; collegeName: string; universityId?: string;
  fit: "reach" | "match" | "safety";
  deadlineType: "ED" | "EA" | "RD" | "Rolling";
  deadlineDate: string;
  status: "researching" | "applying" | "submitted" | "accepted" | "rejected" | "waitlisted" | "enrolled";
}
interface BatchPrediction {
  collegeName: string; universityId?: string; percentageDisplay: number;
  classification: string; confidence: "high" | "medium" | "low";
  strengths: string[]; weaknesses: string[];
  predictionSource?: "rule_based" | "ml_logistic" | "ml_ensemble";
  modelMetrics?: { accuracy: number; auc: number; trainedOn: number };
}

export default function CollegeAppsPage() {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(items) ? items : [];
    },
  });
  const students: Student[] = studentsData ?? [];

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ["student-applications", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/applications`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudentId,
  });
  const applications: Application[] = appsData ?? [];

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

  const predictionMap = new Map<string, BatchPrediction>();
  for (const p of predictions) {
    predictionMap.set(p.collegeName.toLowerCase(), p);
    if (p.universityId) predictionMap.set(p.universityId, p);
  }
  function findPrediction(collegeName: string, universityId?: string): BatchPrediction | undefined {
    if (universityId && predictionMap.has(universityId)) return predictionMap.get(universityId);
    return predictionMap.get(collegeName.toLowerCase());
  }

  const updateStatus = useMutation({
    mutationFn: async ({ appId, status, app }: { appId: string; status: string; app: Application }) => {
      const result = await apiRequest(`/api/v1/college/applications/${appId}`, { method: "PUT", data: { appStatus: status } });
      if (["accepted", "rejected", "waitlisted"].includes(status)) {
        try {
          await apiRequest("/api/v1/college/outcomes", {
            method: "POST",
            data: { studentId: selectedStudentId, collegeName: app.collegeName, universityId: app.universityId, outcome: status },
          });
        } catch { /* best-effort */ }
      }
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] }); toast.success("Status updated"); },
    onError: () => toast.error("Failed to update status"),
  });

  const deleteApp = useMutation({
    mutationFn: async (appId: string) => apiRequest(`/api/v1/college/applications/${appId}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] }); toast.success("Application removed"); },
    onError: () => toast.error("Failed to delete application"),
  });

  const addApp = useMutation({
    mutationFn: async (data: { collegeId: string; collegeName: string; fit: string; deadlineType: string; deadlineDate: string }) => {
      return apiRequest(`/api/v1/college/students/${selectedStudentId}/applications`, {
        method: "POST",
        data: { universityId: data.collegeId || undefined, collegeName: data.collegeName, fitClassification: data.fit, deadlineType: data.deadlineType, deadlineDate: data.deadlineDate },
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-applications", selectedStudentId] }); toast.success("Application added"); setShowAddForm(false); },
    onError: () => toast.error("Failed to add application"),
  });

  const totalApps = applications.length;
  const submittedCount = applications.filter((a) => ["submitted", "accepted", "rejected", "waitlisted", "enrolled"].includes(a.status)).length;
  const acceptedCount = applications.filter((a) => a.status === "accepted" || a.status === "enrolled").length;
  const pendingCount = applications.filter((a) => ["researching", "applying"].includes(a.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>College Prep</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>College Applications</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>Track and manage college applications for your students. Monitor deadlines, statuses, and outcomes.</p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "TOTAL APPLICATIONS", value: totalApps, icon: GraduationCap, color: "var(--admin-font-primary)" },
          { label: "SUBMITTED", value: submittedCount, icon: Send, color: "#2E9098" },
          { label: "ACCEPTED", value: acceptedCount, icon: CheckCircle2, color: "#10b981" },
          { label: "PENDING", value: pendingCount, icon: Clock, color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{selectedStudentId ? stat.value : "\u2014"}</span>
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
        <select value={selectedStudentId} onChange={(e) => { setSelectedStudentId(e.target.value); setShowAddForm(false); }}
          style={{ height: 36, borderRadius: 8, padding: "0 12px", fontSize: 13, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none", minWidth: 240, fontFamily: "inherit" }}>
          <option value="">Select a student...</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {studentsLoading && <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />}
      </motion.div>

      {/* Applications Table */}
      {selectedStudentId && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowAddForm(!showAddForm)}
              style={{ height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#102B47", color: "#fff", border: "none", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Application
            </button>
          </div>

          {showAddForm && <AddApplicationForm onSubmit={(data) => addApp.mutate(data)} isPending={addApp.isPending} />}

          <div style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.6fr", padding: "10px 16px", borderBottom: "1px solid var(--admin-border-light)", background: "var(--admin-bg-hover)" }}>
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
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No applications yet. Click &quot;Add Application&quot; to get started.</p>
              </div>
            ) : (
              applications.map((app, i) => (
                <ApplicationRow key={app.id} app={app} prediction={findPrediction(app.collegeName, app.universityId)}
                  isLast={i === applications.length - 1}
                  onStatusChange={(appId, status, a) => updateStatus.mutate({ appId, status, app: a })}
                  onDelete={(appId) => deleteApp.mutate(appId)} deleteDisabled={deleteApp.isPending} />
              ))
            )}
          </div>
        </motion.div>
      )}

      {!selectedStudentId && !studentsLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <Users style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>Select a student above to view and manage their college applications.</p>
        </motion.div>
      )}
    </div>
  );
}
