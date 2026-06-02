"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Trophy, Search, Plus, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ActivityForm, ActivityFormData } from "./_components/ActivityForm";
import { ActivityCard } from "./_components/ActivityCard";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Activity {
  id: string;
  name: string;
  category: string;
  organization?: string;
  role?: string;
  startDate: string;
  endDate?: string;
  hoursPerWeek?: number;
  weeksPerYear?: number;
  description?: string;
  awards?: string;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "academic", label: "Academic" },
  { key: "athletic", label: "Athletic" },
  { key: "arts", label: "Arts" },
  { key: "community_service", label: "Community Service" },
  { key: "work", label: "Work" },
  { key: "leadership", label: "Leadership" },
];

const INITIAL_FORM: ActivityFormData = {
  name: "", category: "academic", organization: "", role: "",
  startDate: "", endDate: "", hoursPerWeek: "", weeksPerYear: "",
  description: "", awards: "",
};

export default function CounselorActivitiesPage() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ActivityFormData>(INITIAL_FORM);

  const resetForm = () => { setForm(INITIAL_FORM); setEditingId(null); };

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(items) ? items : [];
    },
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["student-activities", selectedStudent?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudent!.id}/activities`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudent,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest(`/api/v1/college/students/${selectedStudent!.id}/activities`, { method: "POST", data });
    },
    onSuccess: () => {
      toast.success("Activity added");
      queryClient.invalidateQueries({ queryKey: ["student-activities", selectedStudent?.id] });
      setShowForm(false); resetForm();
    },
    onError: () => toast.error("Failed to add activity"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return apiRequest(`/api/v1/college/activities/${id}`, { method: "PUT", data });
    },
    onSuccess: () => {
      toast.success("Activity updated");
      queryClient.invalidateQueries({ queryKey: ["student-activities", selectedStudent?.id] });
      setShowForm(false); resetForm();
    },
    onError: () => toast.error("Failed to update activity"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/v1/college/activities/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Activity removed");
      queryClient.invalidateQueries({ queryKey: ["student-activities", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const filteredStudents = (students as Student[]).filter(
    (s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const acts = activities as Activity[];
  const filtered = filterCategory === "all" ? acts : acts.filter((a) => a.category === filterCategory);

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Activity name is required"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }
    const payload: Record<string, unknown> = {
      name: form.name, category: form.category,
      organization: form.organization || undefined, role: form.role || undefined,
      startDate: form.startDate, endDate: form.endDate || undefined,
      hoursPerWeek: form.hoursPerWeek ? Number(form.hoursPerWeek) : undefined,
      weeksPerYear: form.weeksPerYear ? Number(form.weeksPerYear) : undefined,
      description: form.description || undefined, awards: form.awards || undefined,
    };
    if (editingId) { updateMutation.mutate({ id: editingId, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  const handleEdit = (a: Activity) => {
    setForm({
      name: a.name, category: a.category,
      organization: a.organization || "", role: a.role || "",
      startDate: a.startDate ? a.startDate.split("T")[0] : "",
      endDate: a.endDate ? a.endDate.split("T")[0] : "",
      hoursPerWeek: a.hoursPerWeek ? String(a.hoursPerWeek) : "",
      weeksPerYear: a.weeksPerYear ? String(a.weeksPerYear) : "",
      description: a.description || "", awards: a.awards || "",
    });
    setEditingId(a.id); setShowForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>College Prep</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>Activities & Resume</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>Track extracurriculars, work experience, and achievements for college applications.</p>
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
          {/* Category Filter + Add Button */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
              style={{ height: 36, borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#065292", color: "#fff", border: "none", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Activity
            </button>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: "auto" }}>
              {CATEGORIES.map((cat) => (
                <button key={cat.key} onClick={() => setFilterCategory(cat.key)}
                  style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s", background: filterCategory === cat.key ? "var(--admin-font-primary)" : "var(--admin-bg-card)", color: filterCategory === cat.key ? "var(--admin-bg-card)" : "var(--admin-font-secondary)" }}>
                  {cat.label}
                </button>
              ))}
            </div>
          </motion.div>

          {showForm && (
            <ActivityForm form={form} setForm={setForm} editingId={editingId}
              isMutating={createMutation.isPending || updateMutation.isPending}
              onSubmit={handleSubmit} onCancel={() => { setShowForm(false); resetForm(); }} />
          )}

          {/* Activities List */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
            {activitiesLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 100, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <Trophy style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  {filterCategory !== "all" ? "No activities match this filter." : "No activities tracked yet. Click \"Add Activity\" to get started."}
                </p>
              </div>
            ) : (
              filtered.map((a) => (
                <ActivityCard key={a.id} activity={a} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} />
              ))
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
