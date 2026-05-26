"use client";

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Search, Upload, Loader2, Trash2, ChevronLeft, ChevronRight, Sparkles, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSchoolCourses, useCreateSchoolCourse, useDeleteSchoolCourse, curriculumKeys } from "@/hooks/useCurriculumQueries";
import type { SchoolCoursePayload, FrameworkType } from "@/types/curriculum";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
};

export function CoursesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiReview, setAiReview] = useState<{ courses: any[]; sequences: any[]; summary: string } | null>(null);
  const [aiConfirming, setAiConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useSchoolCourses({ search: search || undefined, department: department || undefined, page, limit: 20 });
  const createCourse = useCreateSchoolCourse();
  const deleteCourse = useDeleteSchoolCourse();

  const [form, setForm] = useState<SchoolCoursePayload & { prerequisitesString: string; corequisitesString: string; gradeLevelsString: string }>({
    code: "", name: "", department: "", credits: 1, gradeLevels: [], gradeLevelsString: "9",
    prerequisitesString: "", corequisitesString: "", description: "", frameworkType: undefined,
  });

  const handleCreate = () => {
    if (!form.code || !form.name) { toast.error("Code and name required"); return; }
    const gradeLevels = form.gradeLevelsString.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    const prerequisites = form.prerequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const corequisites = form.corequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const { prerequisitesString, corequisitesString, gradeLevelsString, ...payload } = form;
    createCourse.mutate({ ...payload, prerequisites, corequisites, gradeLevels: gradeLevels.length ? gradeLevels : [9] }, {
      onSuccess: () => { toast.success("Course created"); setAddOpen(false); },
      onError: () => toast.error("Failed"),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV has no data rows"); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const col = (name: string) => headers.indexOf(name);
    let success = 0, failed = 0;
    setCsvImporting(true);
    for (let i = 1; i < lines.length; i++) {
      const row: string[] = []; let inQ = false, cell = "";
      for (const ch of lines[i]) { if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { row.push(cell.trim()); cell = ""; } else cell += ch; }
      row.push(cell.trim());
      const code = col("code") >= 0 ? row[col("code")] : "";
      const name = col("name") >= 0 ? row[col("name")] : "";
      if (!code || !name) { failed++; continue; }
      try {
        await new Promise<void>((resolve, reject) => {
          createCourse.mutate({ code, name, department: col("department") >= 0 ? row[col("department")] : "", credits: parseFloat(col("credits") >= 0 ? row[col("credits")] : "1") || 1, gradeLevels: [9] },
            { onSuccess: () => resolve(), onError: (err: any) => reject(err) });
        });
        success++;
      } catch { failed++; }
    }
    setCsvImporting(false);
    queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    toast.success(`Imported ${success}, failed ${failed}`);
  };

  const handleAiImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (aiFileRef.current) aiFileRef.current.value = "";
    if (!file) return;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) { toast.error("File too large (max 5MB)"); return; }
    setAiImporting(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest("/api/v1/school-admin/courses/ai-import", {
        method: "POST", data: form, headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data ?? res;
      if (data.courses?.length > 0) {
        setAiReview(data);
        toast.success(`Found ${data.courses.length} courses and ${data.sequences?.length || 0} sequences`);
      } else {
        toast.error("No courses found in the document");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to process document");
    } finally { setAiImporting(false); }
  };

  const handleAiConfirm = async () => {
    if (!aiReview) return;
    setAiConfirming(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const res = await apiRequest("/api/v1/school-admin/courses/ai-import/confirm", {
        method: "POST", data: { courses: aiReview.courses, sequences: aiReview.sequences },
      });
      const result = res.data ?? res;
      const parts = [];
      if (result.coursesCreated) parts.push(`${result.coursesCreated} custom courses created`);
      if (result.coursesLinked) parts.push(`${result.coursesLinked} linked to catalog`);
      if (result.sequencesCreated) parts.push(`${result.sequencesCreated} sequences`);
      if (result.coursesSkipped) parts.push(`${result.coursesSkipped} skipped`);
      toast.success(parts.join(", ") || "Import complete");
      setAiReview(null);
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    } catch {
      toast.error("Failed to create courses");
    } finally { setAiConfirming(false); }
  };

  const courses = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const depts = [...new Set(courses.map((c: any) => c.department).filter(Boolean))];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div />
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} hidden />
          <input ref={aiFileRef} type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv,.txt" onChange={handleAiImport} hidden />
          <button onClick={() => fileRef.current?.click()} disabled={csvImporting} style={{
            height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6,
            background: "var(--admin-bg-icon-box)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", cursor: "pointer",
          }}>
            {csvImporting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 14, height: 14 }} />}
            {csvImporting ? "Importing..." : "CSV Import"}
          </button>
          <button onClick={() => aiFileRef.current?.click()} disabled={aiImporting} style={{
            height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff", border: "none", cursor: aiImporting ? "wait" : "pointer",
            opacity: aiImporting ? 0.7 : 1,
          }}>
            {aiImporting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
            {aiImporting ? "Processing..." : "AI Import"}
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button style={{ height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14 }} /> Add Course
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>Add Course</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Code *</Label><Input style={inputStyle} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH-101" /></div>
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Credits</Label><Input type="number" min={0} style={inputStyle} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></div>
                </div>
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Name *</Label><Input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Introduction to Algebra" /></div>
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Description</Label><Input style={inputStyle} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Department</Label><Input style={inputStyle} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Grade Levels</Label><Input style={inputStyle} value={form.gradeLevelsString} onChange={(e) => setForm({ ...form, gradeLevelsString: e.target.value })} placeholder="9, 10, 11" /></div>
                </div>
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Framework</Label>
                  <Select value={form.frameworkType || "NONE"} onValueChange={(v) => setForm({ ...form, frameworkType: v === "NONE" ? undefined : v as FrameworkType })}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NONE">None</SelectItem><SelectItem value="AP">AP</SelectItem><SelectItem value="IB">IB</SelectItem><SelectItem value="NATIONAL">National</SelectItem><SelectItem value="CUSTOM">Custom</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Cancel</Button>
                <button onClick={handleCreate} disabled={createCourse.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer" }}>
                  {createCourse.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Create"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label="Total Courses" value={String(data?.total || 0)} icon={BookOpen} sub="in catalog" trend={0} />
        <AdminStatCard label="Departments" value={String(depts.length)} icon={BookOpen} sub="unique departments" trend={0} />
        <AdminStatCard label="Page" value={`${page} / ${totalPages}`} icon={BookOpen} sub="current view" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder="Search courses..." className="pl-9 h-9 rounded-lg text-sm" style={inputStyle}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Input placeholder="Filter department" className="w-[180px] h-9 rounded-lg text-sm" style={inputStyle}
          value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} />
      </div>

      {/* Table */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Code", "Name", "Department", "Credits", "Framework", "Status", ""].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                <BookOpen className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} /><p className="text-sm">No courses found</p>
              </TableCell></TableRow>
            ) : courses.map((c: any) => (
              <TableRow key={c.id} style={{ borderBottom: "1px solid var(--admin-border-default)" }} className="transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <TableCell className="py-3 px-4" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-light)" }}>{c.code}</TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{c.name}</TableCell>
                <TableCell className="py-3 px-4"><Badge variant="outline" className="text-xs" style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{c.department || "\u2014"}</Badge></TableCell>
                <TableCell className="py-3 px-4 text-center" style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.credits}</TableCell>
                <TableCell className="py-3 px-4">
                  {c.frameworkType ? <Badge className="text-xs" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "none" }}>{c.frameworkType}</Badge> : <span style={{ color: "var(--admin-font-tertiary)" }}>{"\u2014"}</span>}
                </TableCell>
                <TableCell className="py-3 px-4">
                  <Badge className="text-xs font-medium shadow-none border-0" style={{ background: c.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)", color: c.status === "active" ? "#10b981" : "#6b7280" }}>{c.status || "active"}</Badge>
                </TableCell>
                <TableCell className="py-3 px-4">
                  <button onClick={() => deleteCourse.mutate(c.id, { onSuccess: () => toast.success("Deleted") })} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "#ef4444", cursor: "pointer" }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>{((page-1)*20)+1}–{Math.min(page*20, data.total)} of {data.total}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="flex items-center px-2 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{page}/{data.totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* AI Import Review Dialog */}
      <Dialog open={!!aiReview} onOpenChange={(open) => { if (!open) setAiReview(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", width: "90vw" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--admin-font-primary)" }}>
              <Sparkles style={{ width: 18, height: 18, color: "#8b5cf6" }} />
              AI Import Review
            </DialogTitle>
          </DialogHeader>
          {aiReview && (
            <div className="space-y-4">
              <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{aiReview.summary}</p>

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>
                  <FileText style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />
                  Courses ({aiReview.courses.length})
                </h3>
                <div style={{ maxHeight: 500, overflowY: "auto", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                        <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Code</TableHead>
                        <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Name</TableHead>
                        <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Dept</TableHead>
                        <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Credits</TableHead>
                        <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aiReview.courses.map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-font-primary)" }}>{c.code}</TableCell>
                          <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{c.name}</TableCell>
                          <TableCell style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.department}</TableCell>
                          <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{c.credits}</TableCell>
                          <TableCell>
                            {c.frameworkType ? (
                              <Badge style={{ fontSize: 10, background: c.frameworkType === "AP" ? "#3b82f620" : c.frameworkType === "IB" ? "#8b5cf620" : "#14b8a620", color: c.frameworkType === "AP" ? "#3b82f6" : c.frameworkType === "IB" ? "#8b5cf6" : "#14b8a6", border: "none" }}>
                                {c.frameworkType}
                              </Badge>
                            ) : (
                              <Badge variant="outline" style={{ fontSize: 10 }}>{c.difficulty || "custom"}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {aiReview.sequences.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>
                    Sequences ({aiReview.sequences.length})
                  </h3>
                  <div className="space-y-2">
                    {aiReview.sequences.map((seq: any, i: number) => (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{seq.name}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                          {seq.courses?.join(" \u2192 ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <button onClick={() => setAiReview(null)} style={{
              height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500,
              background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)", cursor: "pointer",
            }}>Cancel</button>
            <button onClick={handleAiConfirm} disabled={aiConfirming} style={{
              height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              background: "#14b8a6", color: "#fff", border: "none",
              cursor: aiConfirming ? "wait" : "pointer", opacity: aiConfirming ? 0.7 : 1,
            }}>
              {aiConfirming ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Check style={{ width: 14, height: 14 }} />}
              {aiConfirming ? "Creating..." : `Create ${aiReview?.courses.length || 0} Courses`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
