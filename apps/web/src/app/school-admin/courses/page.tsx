"use client";

import { useState, useRef } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Plus, Search, Upload, Loader2, Trash2, Sparkles, Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSchoolCourses,
  useCreateSchoolCourse,
  useDeleteSchoolCourse,
  useImportSchoolCourses,
  useRecognizeAllUnmapped,
  useApplyAIMapping,
  curriculumKeys,
} from "@/hooks/useCurriculumQueries";
import type { SchoolCoursePayload, AIMappingAction, FrameworkType } from "@/types/curriculum";
import ImportJobStatusPanel from "@/components/school-admin/ImportJobStatusPanel";

export default function CoursesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [importCourseJobId, setImportCourseJobId] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useSchoolCourses({
    search: search || undefined,
    department: department || undefined,
    page,
    limit: 20,
  });
  const createCourse = useCreateSchoolCourse();
  const deleteCourse = useDeleteSchoolCourse();
  const importCourses = useImportSchoolCourses();
  const recognizeAll = useRecognizeAllUnmapped();
  const applyMapping = useApplyAIMapping();

  // Course form
  const [form, setForm] = useState<SchoolCoursePayload & { prerequisitesString: string; corequisitesString: string; gradeLevelsString: string }>({
    code: "", name: "", department: "", credits: 1, gradeLevels: [], gradeLevelsString: "9",
    prerequisitesString: "", corequisitesString: "", description: "", frameworkType: undefined,
  });

  const handleCreate = () => {
    if (!form.code || !form.name) {
      toast.error("Code and name are required");
      return;
    }
    const prerequisites = form.prerequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const corequisites = form.corequisitesString.split(",").map(s => s.trim()).filter(Boolean);
    const gradeLevels = form.gradeLevelsString.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    if (gradeLevels.length === 0) gradeLevels.push(9);

    const { prerequisitesString, corequisitesString, gradeLevelsString, ...payload } = form;
    createCourse.mutate({ ...payload, prerequisites, corequisites, gradeLevels }, {
      onSuccess: () => {
        toast.success("Course created");
        setAddOpen(false);
        setForm({ code: "", name: "", department: "", credits: 1, gradeLevels: [], gradeLevelsString: "9", prerequisitesString: "", corequisitesString: "", description: "", frameworkType: undefined });
      },
      onError: () => toast.error("Failed to create course"),
    });
  };

  // Client-side CSV import: parse file and create each course via the existing API
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV has no data rows"); return; }

    // Parse header (case-insensitive key normalisation)
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const col = (name: string) => headers.indexOf(name);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    setCsvImporting(true);
    const toastId = toast.loading(`Importing courses… 0 / ${lines.length - 1}`);

    for (let i = 1; i < lines.length; i++) {
      // Handle quoted commas (e.g. "10,11")
      const row: string[] = [];
      let inQuote = false;
      let cell = "";
      for (const ch of lines[i]) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { row.push(cell.trim()); cell = ""; }
        else { cell += ch; }
      }
      row.push(cell.trim());

      const code = col("code") >= 0 ? row[col("code")] : "";
      const name = col("name") >= 0 ? row[col("name")] : "";
      if (!code || !name) { failed++; errors.push(`Row ${i + 1}: missing code or name`); continue; }

      const creditsRaw = col("credits") >= 0 ? row[col("credits")] : "1";
      const credits = parseFloat(creditsRaw) || 1;
      const dept = col("department") >= 0 ? row[col("department")] : "";
      const description = col("description") >= 0 ? row[col("description")] : undefined;
      const gradeLevelsRaw = col("gradelevels") >= 0 ? row[col("gradelevels")] : "9";
      const gradeLevels = gradeLevelsRaw.replace(/"|'/g, "").split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      const prereqs = col("prerequisites") >= 0 ? row[col("prerequisites")].split("|").map(s => s.trim()).filter(Boolean) : [];
      const coreqs = col("corequisites") >= 0 ? row[col("corequisites")].split("|").map(s => s.trim()).filter(Boolean) : [];
      const frameworkRaw = col("frameworktype") >= 0 ? row[col("frameworktype")]?.toUpperCase().trim() : "";
      const validFrameworks = ["AP", "IB", "NATIONAL", "CUSTOM"];
      const frameworkType = validFrameworks.includes(frameworkRaw) ? frameworkRaw as FrameworkType : undefined;

      try {
        await new Promise<void>((resolve, reject) => {
          createCourse.mutate(
            { code, name, department: dept, credits, gradeLevels: gradeLevels.length ? gradeLevels : [9], prerequisites: prereqs, corequisites: coreqs, description, frameworkType },
            { onSuccess: () => resolve(), onError: (err: any) => reject(err) }
          );
        });
        success++;
      } catch (err: any) {
        failed++;
        errors.push(`Row ${i + 1} (${code}): ${err?.message ?? "failed"}`);
      }

      toast.loading(`Importing courses… ${success + failed} / ${lines.length - 1}`, { id: toastId });
    }

    setCsvImporting(false);
    queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });

    if (failed === 0) {
      toast.success(`✓ Imported ${success} course${success !== 1 ? "s" : ""} successfully`, { id: toastId });
    } else {
      toast.warning(`Imported ${success}, failed ${failed}. Check console for details.`, { id: toastId });
      console.warn("CSV import errors:", errors);
    }
  };

  const handleAIRecognize = () => {
    recognizeAll.mutate(undefined, {
      onSuccess: (result) => toast.success(`AI recognized ${result.results.length} courses`),
      onError: () => toast.error("AI recognition failed"),
    });
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    if (!data) return [];
    const totalPages = data.totalPages;
    const current = page;
    const pages: (number | string)[] = [];

    // Always show first, last, and pages around current
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= current - 1 && i <= current + 1)
      ) {
        pages.push(i);
      } else if (i === current - 2 || i === current + 2) {
        pages.push("...");
      }
    }

    // Remove duplicate dots
    return pages.filter((item, index) => {
      return item !== "..." || pages[index - 1] !== "...";
    });
  };

  if (isLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.courses.title", "Course Catalog")}
        </h1>
        <p className="text-lg text-gray-500 font-medium">
          {t("schoolAdmin.courses.subtitle", "Manage your school courses, import from CSV, and use AI recognition.")}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search courses..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Input placeholder="Filter by department" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="w-[180px]" />

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white"><Plus className="h-4 w-4 mr-1" />Add Course</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Course</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH-101" /></div>
                <div className="space-y-1.5"><Label>Credits</Label><Input type="number" min={0} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Introduction to Algebra" /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short course description..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Mathematics" /></div>
                <div className="space-y-1.5">
                  <Label>Grade Levels</Label>
                  <Input value={form.gradeLevelsString} onChange={(e) => setForm({ ...form, gradeLevelsString: e.target.value })} placeholder="9, 10, 11" />
                  <p className="text-[11px] text-slate-400 mt-0.5">Comma-separated grade numbers</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Framework Type</Label>
                <Select value={form.frameworkType || "NONE"} onValueChange={(val) => setForm({ ...form, frameworkType: val === "NONE" ? undefined : val as FrameworkType })}>
                  <SelectTrigger><SelectValue placeholder="Select framework..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="AP">Advanced Placement (AP)</SelectItem>
                    <SelectItem value="IB">International Baccalaureate (IB)</SelectItem>
                    <SelectItem value="NATIONAL">National Curriculum</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Prerequisites</Label>
                  <Input value={form.prerequisitesString} onChange={(e) => setForm({ ...form, prerequisitesString: e.target.value })} placeholder="PRE-ALGEBRA, MATH-100" />
                  <p className="text-[11px] text-slate-400 mt-0.5">Comma-separated course codes</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Corequisites</Label>
                  <Input value={form.corequisitesString} onChange={(e) => setForm({ ...form, corequisitesString: e.target.value })} placeholder="PHYS-101" />
                  <p className="text-[11px] text-slate-400 mt-0.5">Comma-separated course codes</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createCourse.isPending} className="bg-teal-600 text-white">
                {createCourse.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} hidden />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={csvImporting}>
            {csvImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            {csvImporting ? "Importing…" : "CSV Import"}
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-gray-500 hover:text-gray-700">
            <a href="/assets/sample-courses.csv" download>Download Template</a>
          </Button>
        </div>
      </motion.div>

      {/* Import Job Polling Panel */}
      {importCourseJobId && (
        <ImportJobStatusPanel
          type="courses"
          jobId={importCourseJobId}
          onDone={() => {
            setImportCourseJobId(null);
            // Force refetch courses table after import completes
            queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
          }}
        />
      )}
      {/* Courses Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-600" />
              Courses {data && <Badge variant="secondary">{data.total}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Framework</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.department}</TableCell>
                    <TableCell>{c.credits}</TableCell>
                    <TableCell>
                      {c.frameworkType ? (
                        <Badge className="bg-blue-100 text-blue-700">{c.frameworkType}</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCourse.mutate(c.id, { onSuccess: () => toast.success("Deleted") })}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.data || data.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-12">No courses found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <CardFooter className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-4 gap-4">
              <div className="text-sm text-gray-500 w-full sm:w-auto text-center sm:text-left">
                Showing <span className="font-medium text-gray-900">{((page - 1) * 20) + (data.data.length > 0 ? 1 : 0)}</span> to <span className="font-medium text-gray-900">{Math.min(page * 20, data.total)}</span> of <span className="font-medium text-gray-900">{data.total}</span> entries
              </div>
              <div className="flex flex-wrap items-center gap-1 w-full justify-center sm:w-auto sm:justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === "..." ? (
                    <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <Button
                      key={`page-${pageNum}`}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={`h-8 w-8 rounded-lg ${page === pageNum ? 'bg-teal-600 hover:bg-teal-700 shadow-sm' : ''}`}
                      onClick={() => setPage(pageNum as number)}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
