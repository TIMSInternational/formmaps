"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Save, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateSchoolCourse, useDeleteSchoolCourse, usePrerequisiteChain, curriculumKeys } from "@/hooks/useCurriculumQueries";
import type { FrameworkType } from "@/types/curriculum";

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

interface CourseDetailDialogProps {
  course: CourseRecord | null;
  onClose: () => void;
  onCourseUpdated: (updated: CourseRecord) => void;
}

export function CourseDetailDialog({ course, onClose, onCourseUpdated }: CourseDetailDialogProps) {
  const queryClient = useQueryClient();
  const updateCourse = useUpdateSchoolCourse();
  const deleteCourse = useDeleteSchoolCourse();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const { data: prereqChain, isLoading: prereqLoading } = usePrerequisiteChain(course?.id || null);

  if (!course) return null;

  const enrolled = course.enrollmentCount || 0;
  const cap = course.maxEnrollment;
  const fillPct = cap ? Math.min(100, (enrolled / cap) * 100) : 0;

  const openEdit = () => {
    setEditing(true);
    setEditForm({
      name: course.name || "", description: course.description || "",
      department: course.department || "", credits: course.credits || 0,
      maxEnrollment: course.maxEnrollment || "",
      isHonors: course.isHonors || false,
      gradeLevelsString: (course.gradeLevels || []).join(", "),
      prerequisitesString: (course.prerequisites || []).join(", "),
      frameworkType: course.frameworkType || "",
    });
  };

  const handleSave = () => {
    const gradeLevels = String(editForm.gradeLevelsString || "").split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
    const prerequisites = String(editForm.prerequisitesString || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    updateCourse.mutate({ courseId: course.id, payload: {
      name: String(editForm.name), description: String(editForm.description), department: String(editForm.department),
      credits: Number(editForm.credits), gradeLevels, prerequisites,
      maxEnrollment: editForm.maxEnrollment ? Number(editForm.maxEnrollment) : null,
      isHonors: Boolean(editForm.isHonors),
      frameworkType: (editForm.frameworkType ? String(editForm.frameworkType) : undefined) as FrameworkType | undefined,
    }}, {
      onSuccess: () => {
        toast.success("Course updated");
        onCourseUpdated({
          ...course,
          name: String(editForm.name), description: String(editForm.description),
          department: String(editForm.department), credits: Number(editForm.credits),
          gradeLevels, prerequisites,
          maxEnrollment: editForm.maxEnrollment ? Number(editForm.maxEnrollment) : null,
          isHonors: Boolean(editForm.isHonors),
          frameworkType: editForm.frameworkType ? String(editForm.frameworkType) : undefined,
        });
        setEditing(false);
        queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
      },
      onError: () => toast.error("Failed to update"),
    });
  };

  const handleDelete = () => {
    if (confirm(`Delete ${course.name}?`)) {
      deleteCourse.mutate(course.id, { onSuccess: () => { toast.success("Course deleted"); onClose(); } });
    }
  };

  // ── Edit Dialog ──
  if (editing) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) setEditing(false); }}>
        <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--admin-font-primary)" }}>Edit: {course.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
            <div className="space-y-1">
              <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Name *</Label>
              <Input style={inputStyle} value={String(editForm.name || "")} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Description</Label>
              <Textarea style={{ ...inputStyle, height: "auto", minHeight: 80 }} rows={3} value={String(editForm.description || "")} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="What students will learn in this course..." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Department</Label>
                <Input style={inputStyle} value={String(editForm.department || "")} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Credits</Label>
                <Input type="number" min={0} style={inputStyle} value={String(editForm.credits ?? "")} onChange={(e) => setEditForm({ ...editForm, credits: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Max Enrollment</Label>
                <Input type="number" min={0} style={inputStyle} value={String(editForm.maxEnrollment ?? "")} onChange={(e) => setEditForm({ ...editForm, maxEnrollment: e.target.value ? Number(e.target.value) : "" })} placeholder="No limit" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Grade Levels</Label>
                <Input style={inputStyle} value={String(editForm.gradeLevelsString || "")} onChange={(e) => setEditForm({ ...editForm, gradeLevelsString: e.target.value })} placeholder="9, 10, 11" />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Framework</Label>
                <Select value={String(editForm.frameworkType || "NONE")} onValueChange={(v) => setEditForm({ ...editForm, frameworkType: v === "NONE" ? "" : v })}>
                  <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="NONE">None</SelectItem><SelectItem value="AP">AP</SelectItem><SelectItem value="IB">IB</SelectItem><SelectItem value="NATIONAL">National</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Prerequisites (comma-separated codes)</Label>
              <Input style={inputStyle} value={String(editForm.prerequisitesString || "")} onChange={(e) => setEditForm({ ...editForm, prerequisitesString: e.target.value })} placeholder="MATH-101, ENG-101" />
            </div>
            <div className="flex items-center gap-3" style={{ padding: "4px 0" }}>
              <input type="checkbox" id="isHonors" checked={Boolean(editForm.isHonors)} onChange={(e) => setEditForm({ ...editForm, isHonors: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "#f59e0b" }} />
              <Label htmlFor="isHonors" style={{ fontSize: 13, color: "var(--admin-font-primary)", cursor: "pointer" }}>Honors course (weighted GPA)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setEditing(false)} style={{
              height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500,
              background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)", cursor: "pointer",
            }}>Cancel</button>
            <button onClick={handleSave} disabled={updateCourse.isPending} style={{
              height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
              background: "#065292", color: "#fff", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: updateCourse.isPending ? 0.6 : 1,
            }}>
              {updateCourse.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Check style={{ width: 14, height: 14 }} />}
              Save Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Detail View ──
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", maxWidth: 540, padding: 0, overflow: "hidden" }}>
        <DialogTitle className="sr-only">{course.name}</DialogTitle>

        {/* Hero header — FormMaps brand */}
        <div style={{ padding: "24px 28px 20px", background: "#065292", borderBottom: "1px solid var(--admin-border-default)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "#fff" }}>{course.code}</span>
            {course.frameworkType && <Badge style={{ fontSize: 10, background: "rgba(255,255,255,0.18)", color: "#fff", border: "none" }}>{course.frameworkType}</Badge>}
            {course.isHonors && <Badge style={{ fontSize: 10, background: "#FFD600", color: "#111", border: "none" }}>Honors</Badge>}
            <Badge style={{ fontSize: 10, background: course.status === "active" ? "rgba(5,150,105,0.95)" : "rgba(255,255,255,0.18)", color: "#fff", border: "none" }}>{course.status || "active"}</Badge>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>{course.name}</h2>
          {course.department && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>{course.department}</div>}
        </div>

        <div style={{ padding: "20px 28px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Description */}
          <div style={{ padding: "14px 16px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 13, color: course.description ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)", lineHeight: 1.6 }}>
              {course.description || "No description has been added for this course yet."}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)" }}>{course.credits}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>Credits</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)" }}>{enrolled}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>Enrolled</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: cap ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)" }}>{cap || "\u2014"}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>Capacity</div>
            </div>
          </div>

          {/* Enrollment bar */}
          {cap && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Enrollment</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: fillPct >= 90 ? "#ef4444" : fillPct >= 70 ? "#f59e0b" : "#10b981" }}>{enrolled} / {cap} ({fillPct.toFixed(0)}%)</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${fillPct}%`, background: fillPct >= 90 ? "#ef4444" : fillPct >= 70 ? "#f59e0b" : "#10b981", transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {/* Grade levels */}
          {(course.gradeLevels || []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Grade Levels</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {course.gradeLevels!.map((g: number) => (
                  <span key={g} style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Grade {g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Prerequisite Chain */}
          {(prereqChain?.chain?.length ?? 0) > 0 && (() => {
            interface ChainItem { code: string; name: string; department?: string; depth: number; isHonors?: boolean; frameworkType?: string | null; credits?: number }
            const chain: ChainItem[] = prereqChain!.chain;
            const depths = [...new Set(chain.map((c) => c.depth))].sort((a, b) => a - b);
            const depthLabel = (d: number) => d === 1 ? "Direct prerequisites" : `${d} steps away`;
            return (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Prerequisite Chain ({chain.length} course{chain.length !== 1 ? "s" : ""})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {depths.map((depth: number, di: number) => {
                    const courses = chain.filter((c) => c.depth === depth);
                    return (
                      <div key={depth}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: depth === 1 ? "#f59e0b" : "var(--admin-font-tertiary)", marginBottom: 4 }}>
                          {depthLabel(depth)}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {courses.map((p) => (
                            <div key={p.code} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                              borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{p.name}</div>
                                <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", fontFamily: "monospace" }}>{p.code}{p.department ? ` \u00b7 ${p.department}` : ""}</div>
                              </div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                {p.isHonors && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Honors</span>}
                                {p.frameworkType && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(59,130,246,0.1)", color: "#065292" }}>{p.frameworkType}</span>}
                                {Number(p.credits) > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{p.credits} cr</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                        {di < depths.length - 1 && (
                          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                            <div style={{ width: 1, height: 10, background: "var(--admin-border-default)" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {course.prerequisites && course.prerequisites.length > 0 && !prereqChain?.chain?.length && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                {prereqLoading ? "Loading Prerequisite Chain..." : "Prerequisites"}
              </div>
              {!prereqLoading && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {course.prerequisites.map((p: string) => (
                    <span key={p} style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontFamily: "monospace" }}>{p}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button onClick={openEdit} style={{
              flex: 1, height: 40, borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "var(--admin-accent-blue, #065292)", color: "#fff", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Save style={{ width: 14, height: 14 }} /> Edit Course
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} style={{
              width: 40, height: 40, borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.05)", color: "#ef4444", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
