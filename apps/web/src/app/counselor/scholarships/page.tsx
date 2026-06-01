"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Award, Search, Plus, Loader2, Trash2, ExternalLink, DollarSign,
} from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Scholarship {
  id: string;
  name: string;
  provider: string;
  amount: number;
  deadline?: string;
  url?: string;
  notes?: string;
  status: "researching" | "applying" | "submitted" | "awarded" | "rejected";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  researching: { label: "Researching", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  applying: { label: "Applying", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  submitted: { label: "Submitted", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  awarded: { label: "Awarded", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

const STATUS_OPTIONS = ["researching", "applying", "submitted", "awarded", "rejected"];

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "researching", label: "Researching" },
  { key: "applying", label: "Applied" },
  { key: "awarded", label: "Awarded" },
];

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export default function CounselorScholarshipsPage() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    name: "", provider: "", amount: "", deadline: "", url: "", notes: "",
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? []; return Array.isArray(items) ? items : [];
    },
  });

  const { data: scholarships = [], isLoading: scholLoading } = useQuery({
    queryKey: ["student-scholarships", selectedStudent?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudent!.id}/scholarships`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudent,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest(`/api/v1/college/students/${selectedStudent!.id}/scholarships`, {
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast.success("Scholarship added");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
      setShowForm(false);
      setForm({ name: "", provider: "", amount: "", deadline: "", url: "", notes: "" });
    },
    onError: () => toast.error("Failed to add scholarship"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/v1/college/scholarships/${id}`, {
        method: "PUT",
        data: { status },
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/v1/college/scholarships/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast.success("Scholarship removed");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const filteredStudents = (students as Student[]).filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const schols = scholarships as Scholarship[];
  const filtered = filterStatus === "all" ? schols : schols.filter((s) => s.status === filterStatus);
  const totalPotential = schols.reduce((sum, s) => sum + (s.amount || 0), 0);
  const awardedAmount = schols.filter((s) => s.status === "awarded").reduce((sum, s) => sum + (s.amount || 0), 0);
  const pendingCount = schols.filter((s) => s.status !== "awarded" && s.status !== "rejected").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>
          College Prep
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          Scholarship Tracker
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          Track scholarship opportunities, applications, and awards for your students.
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
              { label: "TOTAL SCHOLARSHIPS", value: String(schols.length), color: "var(--admin-font-primary)" },
              { label: "TOTAL POTENTIAL", value: formatCurrency(totalPotential), color: "#3b82f6" },
              { label: "AWARDED AMOUNT", value: formatCurrency(awardedAmount), color: "#10b981" },
              { label: "PENDING", value: String(pendingCount), color: "#f59e0b" },
            ].map((stat) => (
              <div key={stat.label} style={{
                padding: 16, borderRadius: 10,
                border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>
                    {stat.label}
                  </span>
                  {stat.label.includes("AMOUNT") || stat.label.includes("POTENTIAL") ? (
                    <DollarSign style={{ width: 16, height: 16, color: stat.color }} />
                  ) : null}
                </div>
                <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>
                  {scholLoading ? "—" : stat.value}
                </span>
              </div>
            ))}
          </motion.div>

          {/* Add Button + Filter Tabs */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{
                height: 36, borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
              }}>
              <Plus style={{ width: 14, height: 14 }} />
              Add Scholarship
            </button>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {FILTER_TABS.map((tab) => (
                <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
                  style={{
                    padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.1s",
                    background: filterStatus === tab.key ? "var(--admin-font-primary)" : "var(--admin-bg-card)",
                    color: filterStatus === tab.key ? "var(--admin-bg-card)" : "var(--admin-font-secondary)",
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Inline Form */}
          {showForm && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{
                padding: 16, borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)",
                background: "rgba(16,185,129,0.03)",
              }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12 }}>
                Add Scholarship
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input placeholder="Scholarship name" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={{
                      flex: 2, minWidth: 200, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <input placeholder="Provider" value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    style={{
                      flex: 1, minWidth: 160, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input placeholder="Amount ($)" type="number" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    style={{
                      flex: 1, minWidth: 120, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <input placeholder="Deadline" type="date" value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    style={{
                      flex: 1, minWidth: 140, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <input placeholder="URL (optional)" value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    style={{
                      flex: 2, minWidth: 200, height: 36, borderRadius: 6, padding: "0 10px", fontSize: 13,
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
                      if (!form.name.trim()) { toast.error("Name is required"); return; }
                      createMutation.mutate({
                        name: form.name,
                        provider: form.provider,
                        amount: form.amount ? Number(form.amount) : 0,
                        deadline: form.deadline || undefined,
                        url: form.url || undefined,
                        notes: form.notes || undefined,
                      });
                    }}
                    disabled={createMutation.isPending}
                    style={{
                      height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600,
                      background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
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

          {/* Scholarship Cards Grid */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {scholLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 160, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{
                padding: 48, textAlign: "center", borderRadius: 10,
                border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              }}>
                <Award style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  {filterStatus !== "all" ? "No scholarships match this filter." : "No scholarships tracked yet. Click \"Add Scholarship\" to get started."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
                {filtered.map((s) => {
                  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.researching;
                  return (
                    <div key={s.id} style={{
                      padding: 16, borderRadius: 10,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.name}</div>
                          {s.provider && (
                            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.provider}</div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                          background: "rgba(59,130,246,0.1)", color: "#3b82f6", whiteSpace: "nowrap",
                        }}>
                          {formatCurrency(s.amount || 0)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {s.deadline && (
                          <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                            Deadline: {new Date(s.deadline).toLocaleDateString()}
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                          background: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                      </div>

                      {s.notes && (
                        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 10, lineHeight: 1.4 }}>
                          {s.notes}
                        </p>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--admin-border-light)", paddingTop: 10 }}>
                        <select
                          value={s.status}
                          onChange={(e) => updateMutation.mutate({ id: s.id, status: e.target.value })}
                          style={{
                            height: 28, borderRadius: 4, padding: "0 6px", fontSize: 11,
                            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", cursor: "pointer",
                          }}>
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{STATUS_CONFIG[opt].label}</option>
                          ))}
                        </select>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer"
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              fontSize: 11, color: "#3b82f6", textDecoration: "none",
                            }}>
                            <ExternalLink style={{ width: 12, height: 12 }} />
                            Link
                          </a>
                        )}
                        <button onClick={() => deleteMutation.mutate(s.id)}
                          title="Delete scholarship"
                          style={{
                            marginLeft: "auto", width: 28, height: 28, borderRadius: 4,
                            border: "1px solid var(--admin-border-default)", background: "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                          <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
