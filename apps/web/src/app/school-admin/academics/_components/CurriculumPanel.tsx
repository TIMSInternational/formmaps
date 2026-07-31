"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BookOpen, Search, Settings2, Layers, GraduationCap, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useFrameworks, useUpdateFrameworks, useFrameworkCourses } from "@/hooks/useCurriculumQueries";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { CurriculumFramework, FrameworkType } from "@/types/curriculum";

export function CurriculumPanel() {
  const { t } = useTranslation();
  const { data: frameworks, isLoading } = useFrameworks();
  const updateFrameworks = useUpdateFrameworks();
  const [selectedType, setSelectedType] = useState<FrameworkType | "">("");
  const [courseSearch, setCourseSearch] = useState("");
  const [coursePage, setCoursePage] = useState(1);

  useEffect(() => {
    if (frameworks?.length && !selectedType) setSelectedType(frameworks[0].type);
  }, [frameworks, selectedType]);

  const { data: courses, isLoading: coursesLoading } = useFrameworkCourses(
    selectedType as string, { page: coursePage, limit: 10, search: courseSearch || undefined }
  );

  const handleToggle = (fw: CurriculumFramework) => {
    if (!frameworks) return;
    updateFrameworks.mutate(
      { frameworks: frameworks.map(f => f.type === fw.type ? { type: f.type, enabled: !f.enabled } : { type: f.type, enabled: f.enabled }) },
      { onSuccess: () => toast.success("Updated"), onError: () => toast.error("Failed") }
    );
  };

  const safeFrameworks = frameworks || [];
  const enabledCount = safeFrameworks.filter(f => f.enabled).length;
  const totalCourses = safeFrameworks.reduce((s, f) => s + (f.courseCount || 0), 0);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} /></div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label="Frameworks" value={String(safeFrameworks.length)} icon={Settings2} sub={`${enabledCount} enabled`} trend={0} />
        <AdminStatCard label="Total Courses" value={String(totalCourses)} icon={BookOpen} sub="across all frameworks" trend={0} />
        <AdminStatCard label="Selected" value={selectedType || "\u2014"} icon={Layers} sub="currently viewing" />
      </div>

      {/* Framework Toggles */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Settings2 style={{ width: 16, height: 16, color: "#2E9098" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Framework Configuration</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Toggle frameworks to populate course registry</div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {safeFrameworks.map((fw) => (
              <div key={fw.type} onClick={() => { setSelectedType(fw.type); setCoursePage(1); setCourseSearch(""); }}
                style={{
                  padding: 16, borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  border: selectedType === fw.type ? "1px solid #2E9098" : "1px solid var(--admin-border-default)",
                  background: selectedType === fw.type ? "rgba(59,130,246,0.05)" : "var(--admin-bg-hover)",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    background: fw.enabled ? "rgba(59,130,246,0.1)" : "var(--admin-bg-icon-box)",
                  }}>
                    <Layers style={{ width: 16, height: 16, color: fw.enabled ? "#2E9098" : "var(--admin-font-tertiary)" }} />
                  </div>
                  <Switch checked={fw.enabled} onCheckedChange={() => handleToggle(fw)} onClick={(e) => e.stopPropagation()} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 2 }}>{fw.label || fw.type}</div>
                <div style={{ fontSize: 12, color: fw.enabled ? "#2E9098" : "var(--admin-font-tertiary)" }}>{fw.courseCount || 0} courses</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Framework Courses Table */}
      {selectedType && (
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(20,184,166,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BookOpen style={{ width: 16, height: 16, color: "#14b8a6" }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  <span style={{ color: "#14b8a6" }}>{safeFrameworks.find(f => f.type === selectedType)?.label || selectedType}</span> Course Repository
                </div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Browse and modify catalogue</div>
              </div>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
              <Input placeholder="Search by code or title..." className="pl-9 h-9 rounded-lg text-sm"
                style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
                value={courseSearch} onChange={(e) => { setCourseSearch(e.target.value); setCoursePage(1); }} />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                {["Code", "Course Title", "Department", "Credits", "Grades"].map((h) => (
                  <TableHead key={h} className="py-3 px-4" style={{
                    fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                    color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                  }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {coursesLoading ? (
                <TableRowsSkeleton columnCount={5} rowCount={5} />
              ) : !courses?.data?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                    <GraduationCap className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                    <p className="text-sm">No courses found</p>
                  </TableCell>
                </TableRow>
              ) : (
                courses.data.map((c: any) => (
                  <TableRow key={c.id} style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                    className="transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <TableCell className="py-3 px-4" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-light)" }}>{c.code}</TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{c.name}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{c.department || "\u2014"}</Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-center" style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.credits}</TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(c.gradeLevel || c.gradeLevels || []).map((g: number) => (
                          <span key={g} style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Gr. {g}</span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {courses && courses.totalPages > 1 && (
            <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
              <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
                {((coursePage - 1) * 10) + 1}–{Math.min(coursePage * 10, courses.total)} of {courses.total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={coursePage <= 1}
                  onClick={() => setCoursePage(p => Math.max(1, p - 1))} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex items-center px-2 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{coursePage} / {courses.totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={coursePage >= courses.totalPages}
                  onClick={() => setCoursePage(p => Math.min(courses.totalPages, p + 1))} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
