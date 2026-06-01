"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  FileCheck, Search, Plus, Loader2, Trash2, FileText,
  FileSignature, FileBarChart, FileUp, File,
} from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface DocumentRequest {
  id: string;
  type: string;
  recipient: string;
  status: "requested" | "in_progress" | "sent" | "confirmed";
  notes?: string;
  requestedDate: string;
  sentDate?: string;
}

const DOC_TYPES = [
  "Transcript",
  "Letter of Recommendation",
  "School Report",
  "Mid-Year Report",
  "Final Report",
  "Other",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: "Requested", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  sent: { label: "Sent", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  confirmed: { label: "Confirmed", color: "#059669", bg: "rgba(5,150,105,0.1)" },
};

const STATUS_FLOW = ["requested", "in_progress", "sent", "confirmed"];

const DOC_ICONS: Record<string, React.ElementType> = {
  Transcript: FileText,
  "Letter of Recommendation": FileSignature,
  "School Report": FileBarChart,
  "Mid-Year Report": FileUp,
  "Final Report": FileCheck,
  Other: File,
};

export default function CounselorDocumentsPage() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Transcript", recipient: "", notes: "" });

  // Fetch students
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? []; return Array.isArray(items) ? items : [];
    },
  });

  // Fetch documents for selected student
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["student-documents", selectedStudent?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudent!.id}/documents`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudent,
  });

  // Create document
  const createMutation = useMutation({
    mutationFn: async (data: { type: string; recipient: string; notes: string }) => {
      return apiRequest(`/api/v1/college/students/${selectedStudent!.id}/documents`, {
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast.success("Document request created");
      queryClient.invalidateQueries({ queryKey: ["student-documents", selectedStudent?.id] });
      setShowForm(false);
      setForm({ type: "Transcript", recipient: "", notes: "" });
    },
    onError: () => toast.error("Failed to create document request"),
  });

  // Update document status
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/v1/college/documents/${id}`, {
        method: "PUT",
        data: { status },
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["student-documents", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  // Delete document
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/v1/college/documents/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Document request deleted");
      queryClient.invalidateQueries({ queryKey: ["student-documents", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const filteredStudents = (students as Student[]).filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const docs = documents as DocumentRequest[];
  const totalRequests = docs.length;
  const sentCount = docs.filter((d) => d.status === "sent").length;
  const pendingCount = docs.filter((d) => d.status === "requested" || d.status === "in_progress").length;
  const confirmedCount = docs.filter((d) => d.status === "confirmed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>
          College Prep
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          Document Manager
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          Track transcript requests, letters of recommendation, and school reports.
        </p>
      </motion.div>

      {/* Student Selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          maxWidth: 400,
        }}>
          <Search style={{ width: 14, height: 14, color: "var(--admin-font-light)", flexShrink: 0 }} />
          <input
            placeholder="Search and select a student..."
            value={selectedStudent ? selectedStudent.name : studentSearch}
            onChange={(e) => {
              setStudentSearch(e.target.value);
              setSelectedStudent(null);
              setShowStudentDropdown(true);
            }}
            onFocus={() => setShowStudentDropdown(true)}
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit",
            }}
          />
          {selectedStudent && (
            <button onClick={() => { setSelectedStudent(null); setStudentSearch(""); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-font-tertiary)", fontSize: 16, lineHeight: 1 }}>
              x
            </button>
          )}
        </div>
        {showStudentDropdown && !selectedStudent && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowStudentDropdown(false)} />
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4, width: 400, maxHeight: 240,
              overflowY: "auto", borderRadius: 8, background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)", zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}>
              {studentsLoading ? (
                <div style={{ padding: 16, textAlign: "center" }}>
                  <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--admin-font-tertiary)", textAlign: "center" }}>
                  No students found
                </div>
              ) : (
                filteredStudents.map((s) => (
                  <div key={s.id}
                    onClick={() => { setSelectedStudent(s); setShowStudentDropdown(false); setStudentSearch(""); }}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 13,
                      color: "var(--admin-font-primary)", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{s.email}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </motion.div>

      {selectedStudent && (
        <>
          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[
              { label: "TOTAL REQUESTS", value: totalRequests, color: "var(--admin-font-primary)" },
              { label: "SENT", value: sentCount, color: "#10b981" },
              { label: "PENDING", value: pendingCount, color: "#f59e0b" },
              { label: "CONFIRMED", value: confirmedCount, color: "#059669" },
            ].map((stat) => (
              <div key={stat.label} style={{
                padding: 16, borderRadius: 10,
                border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>
                    {stat.label}
                  </span>
                </div>
                <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>
                  {docsLoading ? "—" : stat.value}
                </span>
              </div>
            ))}
          </motion.div>

          {/* New Request Button */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{
                height: 36, borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer",
              }}>
              <Plus style={{ width: 14, height: 14 }} />
              New Request
            </button>
          </motion.div>

          {/* Inline Form */}
          {showForm && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{
                padding: 16, borderRadius: 10, border: "1px solid rgba(59,130,246,0.2)",
                background: "rgba(59,130,246,0.03)",
              }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>
                New Document Request
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    style={{
                      flex: 1, minWidth: 180, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input placeholder="Recipient (college name)" value={form.recipient}
                    onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                    style={{
                      flex: 1, minWidth: 200, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
                <textarea placeholder="Notes (optional)" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  style={{
                    width: "100%", borderRadius: 6, padding: "8px 10px", fontSize: 13,
                    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                    color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      if (!form.recipient.trim()) { toast.error("Recipient is required"); return; }
                      createMutation.mutate(form);
                    }}
                    disabled={createMutation.isPending}
                    style={{
                      height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600,
                      background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      opacity: createMutation.isPending ? 0.6 : 1,
                    }}>
                    {createMutation.isPending && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
                    Submit
                  </button>
                  <button onClick={() => setShowForm(false)}
                    style={{
                      height: 36, borderRadius: 6, padding: "0 14px", fontSize: 13,
                      background: "transparent", color: "var(--admin-font-tertiary)",
                      border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit",
                    }}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Documents Table */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr 120px",
              padding: "10px 16px", borderBottom: "1px solid var(--admin-border-light)", background: "var(--admin-bg-hover)",
            }}>
              {["TYPE", "RECIPIENT", "STATUS", "REQUESTED", "SENT", "ACTIONS"].map((h) => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>
                  {h}
                </span>
              ))}
            </div>

            {docsLoading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 44, borderRadius: 6, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : docs.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <FileCheck style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  No document requests yet. Click &quot;New Request&quot; to get started.
                </p>
              </div>
            ) : (
              docs.map((doc, i) => {
                const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.requested;
                const DocIcon = DOC_ICONS[doc.type] || File;
                const currentIdx = STATUS_FLOW.indexOf(doc.status);
                return (
                  <div key={doc.id} style={{
                    display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr 120px",
                    padding: "12px 16px", alignItems: "center",
                    borderBottom: i < docs.length - 1 ? "1px solid var(--admin-border-light)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <DocIcon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{doc.type}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>{doc.recipient}</span>
                    <span style={{
                      display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600,
                      padding: "3px 10px", borderRadius: 6, width: "fit-content",
                      background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                      {doc.requestedDate ? new Date(doc.requestedDate).toLocaleDateString() : "—"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                      {doc.sentDate ? new Date(doc.sentDate).toLocaleDateString() : "—"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {currentIdx < STATUS_FLOW.length - 1 && (
                        <select
                          value={doc.status}
                          onChange={(e) => updateMutation.mutate({ id: doc.id, status: e.target.value })}
                          style={{
                            height: 28, borderRadius: 4, padding: "0 4px", fontSize: 11,
                            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", cursor: "pointer",
                          }}>
                          {STATUS_FLOW.slice(currentIdx).map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => deleteMutation.mutate(doc.id)}
                        title="Delete request"
                        style={{
                          width: 28, height: 28, borderRadius: 4,
                          border: "1px solid var(--admin-border-default)", background: "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                        <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
