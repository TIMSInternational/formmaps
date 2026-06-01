"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GraduationCap, Plus, Loader2, Trash2, AlertTriangle, CheckCircle2, XCircle, TrendingUp, Users, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useGraduationRules,
  useCreateGraduationRules,
  useUpdateGraduationRules,
  useAllGraduationProgress,
} from "@/hooks/useGraduationQueries";
import { useSchoolCourses } from "@/hooks/useCurriculumQueries";
import type { CategoryRequirement, SpecialRequirement } from "@/types/graduation";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
};

export function GraduationPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: rules, isLoading: rulesLoading } = useGraduationRules();
  const { data: coursesData } = useSchoolCourses({ limit: 200 });
  const departments = [...new Set((coursesData?.data || []).map((c: any) => c.department).filter(Boolean))].sort() as string[];

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const { data: progress, isLoading: progressLoading } = useAllGraduationProgress({
    page, limit: 20, status: statusFilter === "all" ? undefined : statusFilter, sortBy: "name",
  });

  const createRules = useCreateGraduationRules();
  const updateRules = useUpdateGraduationRules();

  const [totalCredits, setTotalCredits] = useState(24);
  const [categories, setCategories] = useState<CategoryRequirement[]>([]);
  const [specialReqs, setSpecialReqs] = useState<SpecialRequirement[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  useEffect(() => {
    if (rules) {
      setTotalCredits(rules.totalCreditsRequired);
      setCategories(rules.categoryRequirements ?? []);
      setSpecialReqs(rules.specialRequirements ?? []);
    }
  }, [rules]);

  const addCategory = () => {
    setCategories([...categories, { category: "", minCredits: 0, requiredCourses: [], electivesAllowed: true }]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, field: string, value: string | number | boolean) => {
    setCategories(categories.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const handleSaveRules = () => {
    const payload = {
      schoolId: rules?.schoolId || "",
      academicYearId: rules?.academicYearId || "",
      totalCreditsRequired: totalCredits,
      categoryRequirements: categories,
      specialRequirements: specialReqs,
    };
    if (rules?.id) {
      updateRules.mutate({ ruleSetId: rules.id, payload }, {
        onSuccess: () => { toast.success("Rules saved"); setRuleDialogOpen(false); },
        onError: () => toast.error("Failed to save"),
      });
    } else {
      createRules.mutate(payload, {
        onSuccess: () => { toast.success("Rules created"); setRuleDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  if (rulesLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
      <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
    </div>
  );

  // Compute summary stats from progress data
  const allStudents = progress?.data || [];
  const onTrack = allStudents.filter((s: any) => s.status === "on_track").length;
  const atRisk = allStudents.filter((s: any) => s.status === "at_risk").length;
  const offTrack = allStudents.filter((s: any) => s.status === "off_track").length;
  const totalStudents = progress?.total || 0;
  const avgProgress = allStudents.length > 0
    ? Math.round(allStudents.reduce((sum: number, s: any) => sum + (s.progressPercent || 0), 0) / allStudents.length)
    : 0;

  // Filter by search
  const filtered = searchTerm
    ? allStudents.filter((s: any) => s.studentName?.toLowerCase().includes(searchTerm.toLowerCase()))
    : allStudents;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Students", value: totalStudents, icon: Users, color: "var(--admin-font-primary)" },
          { label: "On Track", value: onTrack, icon: CheckCircle2, color: "#10b981" },
          { label: "At Risk", value: atRisk, icon: AlertTriangle, color: "#f59e0b" },
          { label: "Off Track", value: offTrack, icon: XCircle, color: "#ef4444" },
          { label: "Avg Progress", value: `${avgProgress}%`, icon: TrendingUp, color: "#065292" },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Graduation Rules Card */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--admin-bg-hover)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GraduationCap style={{ width: 16, height: 16, color: "#065292" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Graduation Requirements</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                {rules ? `${rules.totalCreditsRequired} total credits required` : "No rules configured — set up requirements to track progress"}
              </div>
            </div>
          </div>
          <button onClick={() => setRuleDialogOpen(true)} style={{
            height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: rules ? "var(--admin-bg-card)" : "#065292",
            color: rules ? "var(--admin-font-primary)" : "#fff",
            border: rules ? "1px solid var(--admin-border-default)" : "none", cursor: "pointer",
          }}>
            {rules ? "Edit Rules" : "Set Up Rules"}
          </button>
        </div>
        {rules && (rules.categoryRequirements ?? []).length > 0 && (
          <div style={{ padding: 16 }}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(rules.categoryRequirements ?? []).map((cat, i) => (
                <div key={i} style={{
                  padding: "12px 14px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{cat.category}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)" }}>{cat.minCredits}</div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>credits required</div>
                  {cat.electivesAllowed && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981", marginTop: 6, display: "inline-block" }}>
                      Electives OK
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Student Progress Table */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--admin-bg-hover)",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Student Graduation Progress</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Track credit completion toward graduation</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-light)" }} />
              <Input placeholder="Search students..." className="pl-9 h-8 rounded-md text-xs w-48" style={inputStyle}
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[120px] rounded-md text-xs" style={inputStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="off_track">Off Track</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {progressLoading ? (
          <div style={{ padding: 16 }}>
            <Skeleton className="h-[300px] w-full" style={{ background: "var(--admin-bg-hover)" }} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                {["Student", "Grade", "Credits", "Progress", "Status"].map((h) => (
                  <TableHead key={h} className="py-3 px-4" style={{
                    fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                    color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                  }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                    <GraduationCap style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                    {!rules ? "Set up graduation rules first to see student progress" : "No students found"}
                  </TableCell>
                </TableRow>
              ) : filtered.map((s: any) => {
                const statusColor = s.status === "on_track" ? "#10b981" : s.status === "at_risk" ? "#f59e0b" : "#ef4444";
                const StatusIcon = s.status === "on_track" ? CheckCircle2 : s.status === "at_risk" ? AlertTriangle : XCircle;
                return (
                  <TableRow key={s.studentId} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                    className="transition-colors"
                    onClick={() => router.push(`/school-admin/users/${s.studentId}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: `linear-gradient(135deg, ${statusColor}40, ${statusColor}20)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: statusColor, fontSize: 12, fontWeight: 600,
                        }}>
                          {s.studentName?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                      {s.gradeLevel ? `Grade ${s.gradeLevel}` : "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.creditsCompleted || 0}</span>
                      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}> / {s.creditsRequired || rules?.totalCreditsRequired || 0}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3, width: `${Math.min(100, s.progressPercent || 0)}%`,
                            background: statusColor, transition: "width 0.3s",
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, minWidth: 32, textAlign: "right" }}>{s.progressPercent || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                        background: `${statusColor}15`, color: statusColor,
                      }}>
                        <StatusIcon style={{ width: 12, height: 12 }} />
                        {s.status?.replace("_", " ")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {progress && (progress.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
              {((page - 1) * 20) + 1}–{Math.min(page * 20, progress.total)} of {progress.total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-2 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{page}/{progress.totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= (progress.totalPages || 1)}
                onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Rules Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--admin-font-primary)" }}>
              {rules ? "Edit Graduation Requirements" : "Set Up Graduation Requirements"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
              Define credit requirements per department to track student graduation progress
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Total Credits Required to Graduate</Label>
              <Input type="number" min="1" style={inputStyle} value={totalCredits}
                onChange={(e) => setTotalCredits(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Credit Categories</Label>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Define minimum credits per subject area</p>
                </div>
                <button onClick={addCategory} style={{
                  height: 30, borderRadius: 6, padding: "0 10px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
                  border: "1px solid var(--admin-border-default)", cursor: "pointer",
                }}>
                  <Plus className="h-3 w-3" /> Add Category
                </button>
              </div>
              {categories.map((cat, i) => {
                // Departments already used (except current)
                const usedDepts = categories.filter((_, j) => j !== i).map(c => c.category);
                const availableDepts = departments.filter(d => !usedDepts.includes(d));
                const isCustom = cat.category && !departments.includes(cat.category);
                return (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "center", padding: 12, borderRadius: 6,
                    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <Select value={cat.category || "__empty"} onValueChange={(v) => updateCategory(i, "category", v === "__empty" ? "" : v)}>
                        <SelectTrigger style={inputStyle}>
                          <SelectValue placeholder="Select department..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty" disabled>Select department...</SelectItem>
                          {availableDepts.map(d => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                          {cat.category && !availableDepts.includes(cat.category) && cat.category !== "__empty" && (
                            <SelectItem value={cat.category}>{cat.category}</SelectItem>
                          )}
                          <SelectItem value="Electives">Electives</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div style={{ width: 80 }}>
                      <Input type="number" style={inputStyle} value={cat.minCredits ?? 0}
                        onChange={(e) => updateCategory(i, "minCredits", Number(e.target.value))} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", whiteSpace: "nowrap" }}>credits</span>
                    <button onClick={() => removeCategory(i)} style={{
                      width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", border: "none", cursor: "pointer", color: "#ef4444",
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                  No categories yet. Add categories like Mathematics, English, Science, etc.
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setRuleDialogOpen(false)} style={{
              height: 36, borderRadius: 6, padding: "0 14px", fontSize: 13, fontWeight: 500,
              background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)", cursor: "pointer",
            }}>Cancel</button>
            <button onClick={handleSaveRules} disabled={createRules.isPending || updateRules.isPending} style={{
              height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "#065292", color: "#fff", border: "none", cursor: "pointer",
              opacity: (createRules.isPending || updateRules.isPending) ? 0.6 : 1,
            }}>
              {(createRules.isPending || updateRules.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Requirements
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
