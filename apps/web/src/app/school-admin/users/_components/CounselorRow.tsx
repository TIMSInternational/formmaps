"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UserCheck, Search, Users, Plus, Trash2, Loader2,
  ChevronDown, ChevronRight, Filter,
  ArrowRightLeft, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAssignStudents, useUnassignStudents, useCounselorStudents } from "@/hooks/useSchoolProfileQueries";
import { useStudents } from "@/hooks/useSchoolAdmin";
import type { SchoolUser } from "@/types/assessmentConfig";
import { ReassignDialog } from "./ReassignDialog";

interface StudentInfo {
  id: string;
  name?: string;
  email?: string;
  gradeLevel?: number | string | null;
  status?: string;
}

interface CounselorRowProps {
  counselor: SchoolUser;
  allCounselors: SchoolUser[];
  globalAssignedIds: Set<string>;
  onReportAssigned: (counselorId: string, studentIds: string[]) => void;
}

export function CounselorRow({
  counselor,
  allCounselors,
  globalAssignedIds,
  onReportAssigned,
}: CounselorRowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reassignStudent, setReassignStudent] = useState<StudentInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");

  const { data: assignedStudents, isLoading: loadingAssigned } = useCounselorStudents(
    counselor.id,
    { limit: 1000 }
  );
  const { data: allStudents } = useStudents({ limit: 1000 });

  const assign = useAssignStudents();
  const unassign = useUnassignStudents();

  const assignedIdsList = useMemo(() => assignedStudents?.data?.map((s: StudentInfo) => s.id) ?? [], [assignedStudents]);

  useEffect(() => {
    onReportAssigned(counselor.id, assignedIdsList);
  }, [assignedIdsList, counselor.id, onReportAssigned]);

  const availableStudents = useMemo(() => {
    return (allStudents?.data ?? []).filter((s: StudentInfo) => {
      if (globalAssignedIds.has(s.id)) return false;
      const matchesSearch = s.name?.toLowerCase().includes(search.toLowerCase());
      const matchesGrade = gradeFilter === "all" || String(s.gradeLevel) === gradeFilter;
      return matchesSearch && matchesGrade;
    });
  }, [allStudents, globalAssignedIds, search, gradeFilter]);

  const uniqueGrades = useMemo(() => {
    const grades = new Set<string>();
    (allStudents?.data ?? []).forEach((s: StudentInfo) => {
      if (s.gradeLevel) grades.add(String(s.gradeLevel));
    });
    return Array.from(grades).sort((a, b) => parseInt(a) - parseInt(b));
  }, [allStudents]);

  const handleAssign = () => {
    if (selected.size === 0) return;
    assign.mutate(
      { counselorId: counselor.id, payload: { studentIds: Array.from(selected) } },
      {
        onSuccess: () => {
          toast.success(`${selected.size} student(s) successfully assigned.`);
          setAssignOpen(false);
          setSelected(new Set());
          setSearch("");
          setGradeFilter("all");
        },
        onError: () => toast.error("Failed to assign students. Please try again."),
      }
    );
  };

  const handleUnassign = (studentId: string) => {
    unassign.mutate(
      { counselorId: counselor.id, payload: { studentIds: [studentId] } },
      {
        onSuccess: () => toast.success("Student removed from caseload."),
        onError: () => toast.error("Failed to remove student."),
      }
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelected = new Set(selected);
      availableStudents.forEach((s: StudentInfo) => newSelected.add(s.id));
      setSelected(newSelected);
    } else {
      const newSelected = new Set(selected);
      availableStudents.forEach((s: StudentInfo) => newSelected.delete(s.id));
      setSelected(newSelected);
    }
  };

  const isAllVisibleSelected = availableStudents.length > 0 && availableStudents.every((s: StudentInfo) => selected.has(s.id));
  const isSomeVisibleSelected = availableStudents.some((s: StudentInfo) => selected.has(s.id));

  const caseloadCount = assignedStudents?.total ?? 0;

  return (
    <>
      <TableRow
        style={{ cursor: "pointer", borderBottom: "1px solid var(--admin-border-default)" }}
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <TableCell className="pl-4">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: expanded ? "var(--admin-accent-blue, #065292)" : "var(--admin-font-tertiary)" }}>
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "var(--admin-bg-hover)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "var(--admin-font-primary)",
            }}>
              {counselor.name?.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{counselor.name}</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{counselor.email}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "rgba(99,102,241,0.1)", color: "#065292",
            textTransform: "capitalize",
          }}>
            {(counselor.role || "counselor").replace('_', ' ')}
          </span>
        </TableCell>
        <TableCell>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{caseloadCount}</span>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>students</span>
          </div>
        </TableCell>
        <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setAssignOpen(true)}
            style={{
              height: 30, borderRadius: 6, padding: "0 10px",
              fontSize: 11, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "transparent",
              color: "var(--admin-accent-blue, #065292)",
              border: "1px solid var(--admin-border-default)",
              cursor: "pointer",
            }}
          >
            <Plus style={{ width: 12, height: 12 }} /> Manage Students
          </button>
        </TableCell>
      </TableRow>

      {/* Expanded Students List */}
      {expanded && (
        <TableRow style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
          <TableCell colSpan={4} style={{ padding: 0 }}>
            <div style={{ padding: "16px 16px 16px 56px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <UserCheck style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #065292)" }} />
                Current Caseload ({caseloadCount} students)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {loadingAssigned ? (
                  Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--admin-bg-card)", borderRadius: 6 }} />)
                ) : assignedStudents?.data?.length ? (
                  assignedStudents.data.map((s: StudentInfo) => (
                    <div key={s.id} className="group" style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 6,
                      background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
                    }}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 0 }}
                        onClick={() => router.push(`/school-admin/users/${s.id}`)}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: "var(--admin-bg-hover)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "var(--admin-font-primary)", flexShrink: 0,
                        }}>
                          {s.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-accent-blue, #065292)", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                            <ExternalLink style={{ width: 10, height: 10, flexShrink: 0, opacity: 0 }} className="group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div style={{ display: "flex", gap: 4, fontSize: 10, color: "var(--admin-font-tertiary)" }}>
                            {s.gradeLevel && <span>Grade {s.gradeLevel}</span>}
                            {s.status && (
                              <span style={{
                                padding: "0 4px", borderRadius: 2,
                                background: s.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                                color: s.status === "active" ? "#10b981" : "#6b7280",
                              }}>
                                {s.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setReassignStudent(s)}
                          title="Reassign to another counselor"
                          style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                        >
                          <ArrowRightLeft style={{ width: 12, height: 12, color: "var(--admin-accent-blue, #065292)" }} />
                        </button>
                        <button
                          onClick={() => handleUnassign(s.id)}
                          title="Remove from caseload"
                          style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                        >
                          <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full" style={{ textAlign: "center", padding: "24px 0" }}>
                    <Users style={{ width: 20, height: 20, color: "var(--admin-font-tertiary)", margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>No students assigned yet</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Click &quot;Manage Students&quot; to assign students.</div>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--admin-border-default)" }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <UserCheck style={{ width: 18, height: 18, color: "var(--admin-accent-blue, #065292)" }} />
                Assign Students to {counselor.name}
              </DialogTitle>
              <DialogDescription style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                Filter and select multiple students to efficiently build the caseload.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div style={{ padding: 16, flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                <Input
                  placeholder="Search available students by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                  style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: "var(--admin-font-tertiary)" }} />
                <select
                  className="h-9 pl-8 pr-6 text-xs rounded-md"
                  style={{ border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", outline: "none", cursor: "pointer" }}
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                >
                  <option value="all">All Grades</option>
                  {uniqueGrades.map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Select All header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <Checkbox
                  checked={isAllVisibleSelected}
                  className={`h-4 w-4 ${isSomeVisibleSelected && !isAllVisibleSelected ? "opacity-60" : ""}`}
                  onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Select All</span>
              </label>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue, #065292)",
              }}>
                {selected.size} total selected
              </span>
            </div>

            {/* Student list */}
            <div style={{
              flex: 1, minHeight: 250, overflow: "auto",
              border: "1px solid var(--admin-border-default)", borderRadius: 6,
              padding: 4, display: "flex", flexDirection: "column", gap: 2,
            }}>
              {availableStudents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px" }}>
                  <Search style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 10px", opacity: 0.4 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No students found</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", maxWidth: 280, margin: "4px auto 0" }}>
                    {search || gradeFilter !== "all"
                      ? "Try adjusting your search query or grade filters."
                      : "All available students have already been assigned."}
                  </div>
                </div>
              ) : (
                availableStudents.map((s: StudentInfo) => (
                  <label
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      border: selected.has(s.id) ? "1px solid var(--admin-accent-blue, #065292)" : "1px solid transparent",
                      background: selected.has(s.id) ? "rgba(59,130,246,0.05)" : "transparent",
                    }}
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      className="h-4 w-4"
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selected);
                        if (checked) newSelected.add(s.id);
                        else newSelected.delete(s.id);
                        setSelected(newSelected);
                      }}
                    />
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: "var(--admin-bg-hover)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, color: "var(--admin-font-primary)",
                    }}>
                      {s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{s.email || "No email provided"}</div>
                    </div>
                    {s.gradeLevel && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                        background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                      }}>
                        Grade {s.gradeLevel}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--admin-border-default)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => { setAssignOpen(false); setSelected(new Set()); setSearch(""); setGradeFilter("all"); }}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600, background: "transparent",
                color: "var(--admin-font-primary)",
                border: "1px solid var(--admin-border-default)", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={selected.size === 0 || assign.isPending}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--admin-accent-blue, #065292)", color: "#fff",
                border: "none", cursor: "pointer",
                opacity: (selected.size === 0 || assign.isPending) ? 0.6 : 1,
              }}
            >
              {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Assignments {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign Dialog */}
      {reassignStudent && (
        <ReassignDialog
          open={!!reassignStudent}
          onOpenChange={(open) => { if (!open) setReassignStudent(null); }}
          student={reassignStudent}
          currentCounselorId={counselor.id}
          counselors={allCounselors}
          onReassigned={() => {
            queryClient.removeQueries({ queryKey: ["school-profile"] });
            queryClient.invalidateQueries({ queryKey: ["school-profile"] });
          }}
        />
      )}
    </>
  );
}
