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
import { BookOpen, Plus, Search, Upload, Loader2, Trash2, ChevronLeft, ChevronRight, Sparkles, Network } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSchoolCourses, useCreateSchoolCourse, useDeleteSchoolCourse, curriculumKeys } from "@/hooks/useCurriculumQueries";
import type { SchoolCoursePayload, FrameworkType } from "@/types/curriculum";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseDetailDialog } from "./CourseDetailDialog";
import { AiImportReviewDialog } from "./AiImportReviewDialog";
import { PrereqAnalysisDialog } from "./PrereqAnalysisDialog";
import { parseCourseCsv } from "./courseCsv";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
};

interface CourseRecord {
  id: string;
  code: string;
  name: string;
  description?: string;
  department?: string;
  credits: number;
  frameworkType?: string;
  isHonors?: boolean;
  status?: string;
  enrollmentCount?: number;
  maxEnrollment?: number | null;
  gradeLevels?: number[];
  prerequisites?: string[];
}

interface AiReviewData {
  courses: Array<{ code: string; name: string; description?: string; department?: string; credits?: number; maxEnrollment?: number | null; frameworkType?: string; isHonors?: boolean; difficulty?: string }>;
  summary: string;
}

export function CoursesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useSchoolCourses({ search: search || undefined, department: department || undefined, page, limit: 20 });
  const createCourse = useCreateSchoolCourse();
  const deleteCourse = useDeleteSchoolCourse();
  const [selectedCourse, setSelectedCourse] = useState<CourseRecord | null>(null);
  const [prereqDialogOpen, setPrereqDialogOpen] = useState(false);

  const [form, setForm] = useState<SchoolCoursePayload & { prerequisitesString: string; corequisitesString: string; gradeLevelsString: string }>({
    code: "", name: "", department: "", credits: 1, gradeLevels: [], gradeLevelsString: "9",
    prerequisitesString: "", corequisitesString: "", description: "", frameworkType: undefined,
  });

  const handleCreate = () => {
    // `department` is NOT NULL in the schema (SchoolCourse.department: String) and it is a
    // grouping key, not a label: the Departments stat card, the department filter and the
    // pathway/prerequisite views all bucket by it. Blank was accepted here and stored as
    // "" — not null, so the database never complained, and the course simply fell out of
    // every one of those views.
    //
    // Measured in production 2026-08-10: 1 of 128 courses had a blank department, and that
    // one was created through this form minutes earlier. Every other course has a real
    // value (Mathematics 22, Science 18, English 15, ...). So this is the leak, and it is
    // worth closing rather than tolerating.
    //
    // `description` is deliberately NOT required — 72 of those 128 have none, so it is
    // genuinely optional and demanding it would be inventing a rule the data disagrees with.
    if (!form.code.trim() || !form.name.trim() || !form.department.trim()) {
      toast.error(t("school_admin:ui.courses.requiredFields"));
      return;
    }
    const gradeLevels = form.gradeLevelsString.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    const prerequisites = form.prerequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const corequisites = form.corequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const { prerequisitesString, corequisitesString, gradeLevelsString, ...payload } = form;
    createCourse.mutate({ ...payload, prerequisites, corequisites, gradeLevels: gradeLevels.length ? gradeLevels : [9] }, {
      onSuccess: () => { toast.success(t("school_admin:ui.courses.created")); setAddOpen(false); },
      onError: () => toast.error(t("school_admin:ui.courses.createFailed")),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const { rows, rejected } = parseCourseCsv(await file.text());
    if (rows.length + rejected.length === 0) { toast.error(t("school_admin:ui.courses.csvNoRows")); return; }
    let success = 0;
    const failedLines: number[] = rejected.map((r) => r.line);
    setCsvImporting(true);
    for (const { line, course } of rows) {
      try {
        await new Promise<void>((resolve, reject) => {
          createCourse.mutate(course, { onSuccess: () => resolve(), onError: (err: unknown) => reject(err) });
        });
        success++;
      } catch { failedLines.push(line); }
    }
    setCsvImporting(false);
    queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    toast.success(t("school_admin:ui.courses.csvImported", { success, failed: failedLines.length }));
    if (rejected.some((r) => r.reason === "missingDepartment")) toast.error(t("school_admin:ui.courses.csvMissingDepartment"));
    if (failedLines.length > 0) {
      const sorted = failedLines.sort((a, b) => a - b);
      toast.error(t("school_admin:ui.courses.csvFailedLines", { lines: sorted.slice(0, 10).join(", ") + (sorted.length > 10 ? "…" : "") }));
    }
  };

  const handleAiImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (aiFileRef.current) aiFileRef.current.value = "";
    if (!file) return;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(t("school_admin:ui.courses.fileTooLarge")); return; }
    setAiImporting(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest("/api/v1/school-admin/courses/ai-import", {
        method: "POST", data: formData, headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data ?? res;
      if (result.courses?.length > 0) {
        setAiReview(result);
        toast.success(t("school_admin:ui.courses.foundCourses", { count: result.courses.length }));
      } else {
        toast.error(t("school_admin:ui.courses.noneInDocument"));
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (err as { message?: string })?.message || t("school_admin:ui.courses.processFailed");
      toast.error(message);
    } finally { setAiImporting(false); }
  };

  const courses: CourseRecord[] = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const depts = [...new Set(courses.map((c) => c.department).filter(Boolean))];

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
            {csvImporting ? t("school_admin:ui.courses.importing") : t("school_admin:ui.courses.csvImport")}
          </button>
          <button onClick={() => aiFileRef.current?.click()} disabled={aiImporting} style={{
            height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            background: "linear-gradient(135deg, #8b5cf6, var(--admin-accent-blue))", color: "#fff", border: "none", cursor: aiImporting ? "wait" : "pointer",
            opacity: aiImporting ? 0.7 : 1,
          }}>
            {aiImporting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
            {aiImporting ? t("school_admin:ui.courses.processing") : t("school_admin:ui.courses.aiImport")}
          </button>
          <button onClick={() => setPrereqDialogOpen(true)} style={{
            height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
          }}>
            <Network style={{ width: 14, height: 14 }} />
            {t("school_admin:ui.courses.analyzePrereqs")}
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button style={{ height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "var(--admin-accent-blue)", color: "#fff", border: "none", cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14 }} /> {t("school_admin:ui.courses.addCourse")}
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>{t("school_admin:ui.courses.addCourse")}</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.codeRequired")}</Label><Input style={inputStyle} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH-101" /></div>
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.credits")}</Label><Input type="number" min={0} style={inputStyle} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></div>
                </div>
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.nameRequired")}</Label><Input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("school_admin:ui.courses.namePlaceholder")} /></div>
                {/* Optional, and stays optional: 72 of 128 production courses have no
                    description. The placeholder is there so the field reads as "skippable",
                    not "blank because you forgot". */}
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.description")}</Label><Input style={inputStyle} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("school_admin:ui.courses.descriptionOptional")} /></div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Required — NOT NULL in the schema, and a grouping key for the
                      Departments card, the department filter and the pathway views. The
                      datalist offers the school's EXISTING departments so "Math" does not
                      get typed alongside "Mathematics" and quietly split one department in
                      two; it stays a free-text input because a school adding its first
                      department must still be able to. */}
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.departmentRequired")}</Label>
                    <Input style={inputStyle} list="course-department-options" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder={depts[0] ? t("school_admin:ui.courses.departmentExample", { example: depts[0] }) : t("school_admin:ui.courses.departmentExampleDefault")} />
                    <datalist id="course-department-options">{depts.map((d) => <option key={d} value={d} />)}</datalist>
                  </div>
                  <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.gradeLevels")}</Label><Input style={inputStyle} value={form.gradeLevelsString} onChange={(e) => setForm({ ...form, gradeLevelsString: e.target.value })} placeholder="9, 10, 11" /></div>
                </div>
                <div className="space-y-1"><Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("school_admin:ui.courses.framework")}</Label>
                  <Select value={form.frameworkType || "NONE"} onValueChange={(v) => setForm({ ...form, frameworkType: v === "NONE" ? undefined : v as FrameworkType })}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NONE">{t("school_admin:ui.courses.frameworkNone")}</SelectItem><SelectItem value="AP">AP</SelectItem><SelectItem value="IB">IB</SelectItem><SelectItem value="NATIONAL">{t("school_admin:ui.courses.frameworkNational")}</SelectItem><SelectItem value="CUSTOM">{t("school_admin:ui.courses.frameworkCustom")}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>{t("school_admin:common.cancel")}</Button>
                <button onClick={handleCreate} disabled={createCourse.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "var(--admin-accent-blue)", color: "#fff", border: "none", cursor: "pointer" }}>
                  {createCourse.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : t("school_admin:ui.courses.create")}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label={t("school_admin:ui.courses.totalCourses")} value={String(data?.total || 0)} icon={BookOpen} sub={t("school_admin:ui.courses.inCatalog")} trend={0} />
        <AdminStatCard label={t("school_admin:ui.courses.departments")} value={String(depts.length)} icon={BookOpen} sub={t("school_admin:ui.courses.uniqueDepartments")} trend={0} />
        <AdminStatCard label={t("school_admin:ui.courses.page")} value={`${page} / ${totalPages}`} icon={BookOpen} sub={t("school_admin:ui.courses.currentView")} />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder={t("school_admin:ui.courses.searchCourses")} className="pl-9 h-9 rounded-lg text-sm" style={inputStyle}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Input placeholder={t("school_admin:ui.courses.filterDepartment")} className="w-[180px] h-9 rounded-lg text-sm" style={inputStyle}
          value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} />
      </div>

      {/* Table */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {[t("school_admin:ui.courses.code"), t("school_admin:ui.courses.name"), t("school_admin:ui.courses.department"), t("school_admin:ui.courses.credits"), t("school_admin:ui.courses.framework"), t("school_admin:ui.courses.status.header"), ""].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                <BookOpen className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} /><p className="text-sm">{t("courses.noCoursesFound")}</p>
              </TableCell></TableRow>
            ) : courses.map((c) => (
              <TableRow key={c.id} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }} className="transition-colors"
                onClick={() => setSelectedCourse(c)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <TableCell className="py-3 px-4" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-light)" }}>{c.code}</TableCell>
                <TableCell className="py-3 px-4">
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</div>}
                </TableCell>
                <TableCell className="py-3 px-4"><Badge variant="outline" className="text-xs" style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{c.department || "\u2014"}</Badge></TableCell>
                <TableCell className="py-3 px-4 text-center" style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.credits}</TableCell>
                <TableCell className="py-3 px-4">
                  {c.frameworkType ? <Badge className="text-xs" style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)", border: "none" }}>{c.frameworkType}</Badge> : <span style={{ color: "var(--admin-font-tertiary)" }}>{"\u2014"}</span>}
                </TableCell>
                <TableCell className="py-3 px-4">
                  <Badge className="text-xs font-medium shadow-none border-0" style={{ background: c.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)", color: c.status === "active" ? "#10b981" : "#6b7280" }}>{t(`school_admin:ui.courses.status.${c.status || "active"}`, { defaultValue: c.status || "active" })}</Badge>
                </TableCell>
                <TableCell className="py-3 px-4">
                  <button onClick={(e) => { e.stopPropagation(); deleteCourse.mutate(c.id, { onSuccess: () => toast.success(t("school_admin:ui.courses.deleted")) }); }} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "#ef4444", cursor: "pointer" }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>{t("school_admin:ui.common.rangeOf", { from: ((page-1)*20)+1, to: Math.min(page*20, data.total), total: data.total })}</p>
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

      {/* Course Detail/Edit Dialog */}
      {selectedCourse && (
        <CourseDetailDialog
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onCourseUpdated={(updated) => setSelectedCourse(updated)}
        />
      )}

      {/* AI Import Review Dialog */}
      {aiReview && (
        <AiImportReviewDialog
          data={aiReview}
          onClose={() => setAiReview(null)}
          // post-import: offer prerequisite analysis on the fresh catalog
          onConfirmed={() => setPrereqDialogOpen(true)}
        />
      )}

      {/* Prerequisite Analysis Dialog */}
      <PrereqAnalysisDialog
        open={prereqDialogOpen}
        onOpenChange={setPrereqDialogOpen}
      />
    </div>
  );
}
