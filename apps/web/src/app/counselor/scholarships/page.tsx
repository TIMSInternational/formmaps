"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Award, Search, Plus, Loader2, DollarSign } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScholarshipCard } from "./_components/ScholarshipCard";
import { ScholarshipForm } from "./_components/ScholarshipForm";

interface Student { id: string; name: string; email: string; }
interface Scholarship {
  id: string; name: string; provider: string; amount: number;
  deadline?: string; url?: string; notes?: string;
  status: "researching" | "applying" | "submitted" | "awarded" | "rejected";
}

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "researching", label: "Researching" },
  { key: "applying", label: "Applied" },
  { key: "awarded", label: "Awarded" },
];

function formatCurrency(amount: number): string { return `$${amount.toLocaleString()}`; }

export default function CounselorScholarshipsPage() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(items) ? items : [];
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
    mutationFn: async (data: Record<string, unknown>) =>
      apiRequest(`/api/v1/college/students/${selectedStudent!.id}/scholarships`, { method: "POST", data }),
    onSuccess: () => {
      toast.success("Scholarship added");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to add scholarship"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/api/v1/college/scholarships/${id}`, { method: "PUT", data: { status } }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/v1/college/scholarships/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Scholarship removed");
      queryClient.invalidateQueries({ queryKey: ["student-scholarships", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const filteredStudents = (students as Student[]).filter(
    (s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const schols = scholarships as Scholarship[];
  const filtered = filterStatus === "all" ? schols : schols.filter((s) => s.status === filterStatus);
  const totalPotential = schols.reduce((sum, s) => sum + (s.amount || 0), 0);
  const awardedAmount = schols.filter((s) => s.status === "awarded").reduce((sum, s) => sum + (s.amount || 0), 0);
  const pendingCount = schols.filter((s) => s.status !== "awarded" && s.status !== "rejected").length;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>College Prep</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>Scholarship Tracker</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>Track scholarship opportunities, applications, and awards for your students.</p>
      </motion.div>

      {/* Student Selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", maxWidth: 400 }}>
          <Search style={{ width: 14, height: 14, color: "var(--admin-font-light)", flexShrink: 0 }} />
          <input placeholder="Search and select a student..." value={selectedStudent ? selectedStudent.name : studentSearch}
            onChange={(e) => { setStudentSearch(e.target.value); setSelectedStudent(null); setShowStudentDropdown(true); }}
            onFocus={() => setShowStudentDropdown(true)}
            style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
          {selectedStudent && (
            <button onClick={() => { setSelectedStudent(null); setStudentSearch(""); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-font-tertiary)", fontSize: 16, lineHeight: 1 }}>x</button>
          )}
        </div>
        {showStudentDropdown && !selectedStudent && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowStudentDropdown(false)} />
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, width: 400, maxHeight: 240, overflowY: "auto", borderRadius: 8, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
              {studentsLoading ? (
                <div style={{ padding: 16, textAlign: "center" }}><Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} /></div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--admin-font-tertiary)", textAlign: "center" }}>No students found</div>
              ) : (
                filteredStudents.map((s) => (
                  <div key={s.id} onClick={() => { setSelectedStudent(s); setShowStudentDropdown(false); setStudentSearch(""); }}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--admin-font-primary)", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
              { label: "TOTAL POTENTIAL", value: formatCurrency(totalPotential), color: "#2E9098" },
              { label: "AWARDED AMOUNT", value: formatCurrency(awardedAmount), color: "#10b981" },
              { label: "PENDING", value: String(pendingCount), color: "#f59e0b" },
            ].map((stat) => (
              <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
                  {(stat.label.includes("AMOUNT") || stat.label.includes("POTENTIAL")) && <DollarSign style={{ width: 16, height: 16, color: stat.color }} />}
                </div>
                <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{scholLoading ? "\u2014" : stat.value}</span>
              </div>
            ))}
          </motion.div>

          {/* Add + Filter */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{ height: 36, borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Scholarship
            </button>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {FILTER_TABS.map((tab) => (
                <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
                  style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s", background: filterStatus === tab.key ? "var(--admin-font-primary)" : "var(--admin-bg-card)", color: filterStatus === tab.key ? "var(--admin-bg-card)" : "var(--admin-font-secondary)" }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {showForm && <ScholarshipForm onSubmit={(data) => createMutation.mutate(data)} isPending={createMutation.isPending} onCancel={() => setShowForm(false)} />}

          {/* Cards Grid */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {scholLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 160, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <Award style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  {filterStatus !== "all" ? "No scholarships match this filter." : "No scholarships tracked yet. Click \"Add Scholarship\" to get started."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
                {filtered.map((s) => (
                  <ScholarshipCard key={s.id} scholarship={s}
                    onStatusChange={(id, status) => updateMutation.mutate({ id, status })}
                    onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
