"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, Plug, Search, Plus, Pencil, Trash2, GraduationCap, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudents } from "@/services/schoolAdminService";
import { useStudentGradebook, useDeleteGrade } from "@/hooks/useGradebookQueries";
import type { GradebookGrade } from "@/services/gradebookService";
import { GradeImportPanel } from "./GradeImportPanel";
import { GradeFormDialog } from "./GradeFormDialog";

interface StudentRow { id: string; name?: string; email?: string; gradeLevel?: number | null }

function gradeColor(g: string | null): { bg: string; fg: string } {
  if (!g) return { bg: "var(--admin-bg-hover)", fg: "var(--admin-font-tertiary)" };
  if (g.startsWith("A")) return { bg: "rgba(16,185,129,0.1)", fg: "#10b981" };
  if (g.startsWith("B")) return { bg: "rgba(46,144,152,0.1)", fg: "#2E9098" };
  if (g.startsWith("F")) return { bg: "rgba(239,68,68,0.1)", fg: "#ef4444" };
  return { bg: "rgba(245,158,11,0.1)", fg: "#f59e0b" };
}

export function GradebookTab() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GradebookGrade | null>(null);
  const [formYear, setFormYear] = useState<string | undefined>(undefined);

  const { data: studentsResp, isLoading: studentsLoading } = useQuery({
    queryKey: ["gradebook-students", search],
    queryFn: () => getStudents({ search: search || undefined, limit: 500, sortBy: "name" }),
    staleTime: 1000 * 60,
  });
  const students: StudentRow[] = Array.isArray(studentsResp?.data) ? (studentsResp!.data as StudentRow[]) : [];

  const { data: gradebook, isLoading: gradesLoading } = useStudentGradebook(selectedId);
  const deleteGrade = useDeleteGrade(selectedId ?? "");
  const selected = students.find((s) => s.id === selectedId);

  const openAdd = (year?: string) => { setEditing(null); setFormYear(year); setFormOpen(true); };
  const openEdit = (g: GradebookGrade) => { setEditing(g); setFormYear(undefined); setFormOpen(true); };

  const years = gradebook ? Object.keys(gradebook.byYear).sort((a, b) => b.localeCompare(a)) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Gradebook</h2>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>View and manage student grades. Grades feed GPA, class rankings, and graduation tracking.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setImportOpen(true)} style={{
            height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
          }}><Upload style={{ width: 14, height: 14 }} /> Import CSV</button>
          <button disabled title="iSAMS integration coming soon" style={{
            height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)", cursor: "not-allowed",
          }}><Plug style={{ width: 14, height: 14 }} /> Connect iSAMS · soon</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
        {/* Student list */}
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--admin-border-default)", position: "relative" }}>
            <Search style={{ position: "absolute", left: 18, top: 19, width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" style={{
              width: "100%", height: 34, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
              color: "var(--admin-font-primary)", fontSize: 13, padding: "0 10px 0 30px",
            }} />
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {studentsLoading ? (
              <div style={{ padding: 12 }}><Skeleton className="h-8 mb-2" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-8 mb-2" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-8" style={{ background: "var(--admin-bg-hover)" }} /></div>
            ) : students.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No students found</div>
            ) : students.map((s) => {
              const active = s.id === selectedId;
              return (
                <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", border: "none", cursor: "pointer",
                  borderBottom: "1px solid var(--admin-border-default)",
                  background: active ? "#2E9098" : "transparent",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: active ? "#fff" : "var(--admin-font-primary)" }}>{s.name || s.email}</div>
                  <div style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.8)" : "var(--admin-font-tertiary)" }}>{s.gradeLevel ? `Grade ${s.gradeLevel} · ` : ""}{s.email}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div>
          {!selectedId ? (
            <div style={{ textAlign: "center", padding: 64, borderRadius: 8, border: "1px dashed var(--admin-border-default)" }}>
              <GraduationCap style={{ width: 40, height: 40, color: "var(--admin-font-light)", margin: "0 auto 16px", opacity: 0.3 }} />
              <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>Select a student to view and manage their grades.</p>
            </div>
          ) : gradesLoading ? (
            <Skeleton className="h-[300px]" style={{ background: "var(--admin-bg-hover)" }} />
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>{selected?.name || selected?.email}</div>
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                    GPA {gradebook?.gpaUnweighted?.toFixed(2) ?? "—"} · Weighted {gradebook?.gpaWeighted?.toFixed(2) ?? "—"} · {gradebook?.totalCredits ?? 0} credits
                  </div>
                </div>
                <button onClick={() => openAdd(years[0])} style={{
                  height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                  background: "#FFD23F", color: "#111", border: "none", cursor: "pointer",
                }}><Plus style={{ width: 14, height: 14 }} /> Add grade</button>
              </div>

              {years.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                  <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No grades yet. Add a grade or import a CSV.</p>
                </div>
              ) : years.map((year) => (
                <div key={year} style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{year}</span>
                    <button onClick={() => openAdd(year)} style={{ fontSize: 11, fontWeight: 600, color: "#2E9098", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus style={{ width: 12, height: 12 }} /> Add
                    </button>
                  </div>
                  <div>
                    {gradebook!.byYear[year].map((g) => {
                      const c = gradeColor(g.grade);
                      return (
                        <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)" }}>
                          <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-font-primary)", minWidth: 80 }}>{g.courseCode || "—"}</span>
                          <Badge style={{ fontSize: 11, background: c.bg, color: c.fg, border: "none" }}>{g.grade || "—"}</Badge>
                          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{Number(g.credits)} cr</span>
                          {g.courseLevel && g.courseLevel !== "regular" && (
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#8b5cf6" }}>{g.courseLevel}</span>
                          )}
                          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginLeft: "auto" }}>{g.semester || ""}</span>
                          <button onClick={() => openEdit(g)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)" }}><Pencil style={{ width: 14, height: 14 }} /></button>
                          <button onClick={() => { if (confirm("Delete this grade?")) deleteGrade.mutate(g.id); }} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                            {deleteGrade.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: 14, height: 14 }} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Import CSV modal */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) setImportOpen(false); }}>
        <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", maxWidth: 720 }}>
          <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>Import grades from CSV</DialogTitle></DialogHeader>
          <GradeImportPanel />
        </DialogContent>
      </Dialog>

      {/* Add / edit grade */}
      {selectedId && (
        <GradeFormDialog open={formOpen} onClose={() => setFormOpen(false)} studentId={selectedId} existing={editing} defaultYear={formYear} />
      )}
    </div>
  );
}
