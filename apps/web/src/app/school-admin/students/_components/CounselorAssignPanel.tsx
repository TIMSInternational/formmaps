"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCheck, Search, Users, Plus, Trash2, Loader2, ChevronDown, ChevronRight, Filter, SortAsc } from "lucide-react";
import { toast } from "sonner";
import { useSchoolUsers, useAssignStudents, useUnassignStudents, useCounselorStudents } from "@/hooks/useSchoolProfileQueries";
import { useStudents } from "@/hooks/useSchoolAdmin";
import type { SchoolUser } from "@/types/assessmentConfig";

function CounselorRow({ counselor }: { counselor: SchoolUser }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
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

  const assignedIds = useMemo(() => new Set(assignedStudents?.data?.map((s: any) => s.id) ?? []), [assignedStudents]);

  const availableStudents = useMemo(() => {
    return (allStudents?.data ?? []).filter((s: any) => {
      if (assignedIds.has(s.id)) return false;
      const matchesSearch = s.name?.toLowerCase().includes(search.toLowerCase());
      const matchesGrade = gradeFilter === "all" || String(s.gradeLevel) === gradeFilter;
      return matchesSearch && matchesGrade;
    });
  }, [allStudents, assignedIds, search, gradeFilter]);

  const uniqueGrades = useMemo(() => {
    const grades = new Set<string>();
    (allStudents?.data ?? []).forEach((s: any) => {
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
          toast.success(t("schoolAdmin.counselorStudents.assigned", `${selected.size} student(s) successfully assigned.`));
          setAssignOpen(false);
          setSelected(new Set());
          setSearch("");
          setGradeFilter("all");
        },
        onError: () => toast.error(t("schoolAdmin.counselorStudents.assignError", "Failed to assign students. Please try again.")),
      }
    );
  };

  const handleUnassign = (studentId: string) => {
    unassign.mutate(
      { counselorId: counselor.id, payload: { studentIds: [studentId] } },
      {
        onSuccess: () => toast.success(t("schoolAdmin.counselorStudents.unassigned", "Student removed from caseload.")),
        onError: () => toast.error(t("schoolAdmin.counselorStudents.unassignError", "Failed to remove student.")),
      }
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelected = new Set(selected);
      availableStudents.forEach((s: any) => newSelected.add(s.id));
      setSelected(newSelected);
    } else {
      const newSelected = new Set(selected);
      availableStudents.forEach((s: any) => newSelected.delete(s.id));
      setSelected(newSelected);
    }
  };

  const isAllVisibleSelected = availableStudents.length > 0 && availableStudents.every((s: any) => selected.has(s.id));
  const isSomeVisibleSelected = availableStudents.some((s: any) => selected.has(s.id));

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
            <div style={{ color: expanded ? "var(--admin-accent-blue, #3b82f6)" : "var(--admin-font-tertiary)" }}>
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
            background: "rgba(99,102,241,0.1)", color: "#6366f1",
            textTransform: "capitalize",
          }}>
            {counselor.role.replace('_', ' ')}
          </span>
        </TableCell>
        <TableCell>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{assignedStudents?.total ?? 0}</span>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>assigned</span>
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
              color: "var(--admin-accent-blue, #3b82f6)",
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
                <UserCheck style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #3b82f6)" }} />
                Current Caseload
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {loadingAssigned ? (
                  Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" style={{ background: "var(--admin-bg-card)", borderRadius: 6 }} />)
                ) : assignedStudents?.data?.length ? (
                  assignedStudents.data.map((s: any) => (
                    <div key={s.id} className="group" style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 6,
                      background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: "var(--admin-bg-hover)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "var(--admin-font-primary)",
                        }}>
                          {s.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.name}</div>
                          {s.gradeLevel && <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>Grade {s.gradeLevel}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnassign(s.id)}
                        title="Remove from caseload"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                      </button>
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
                <UserCheck style={{ width: 18, height: 18, color: "var(--admin-accent-blue, #3b82f6)" }} />
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
                background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue, #3b82f6)",
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
                availableStudents.map((s: any) => (
                  <label
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      border: selected.has(s.id) ? "1px solid var(--admin-accent-blue, #3b82f6)" : "1px solid transparent",
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
                background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
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
    </>
  );
}

export function CounselorAssignPanel() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useSchoolUsers({ role: "counselor", limit: 100 });

  const counselors = (users?.data ?? []).filter(
    (u: SchoolUser) =>
      (u.role || u.roleName || "").toLowerCase().includes("counselor") &&
      (!search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("schoolAdmin.counselorStudents.title", "Student Caseload Management")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("schoolAdmin.counselorStudents.subtitle", "Organize and verify student assignments across your counseling department efficiently.")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Total Staff", value: users?.total ?? 0, icon: Users, color: "#6b7280" },
          { label: "System Status", value: "Active", sub: "Caseloading enabled", icon: UserCheck, color: "#3b82f6" },
          { label: "All-Access", value: counselors.filter((c) => c.accessScope === "all").length, icon: SortAsc, color: "#6366f1" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", marginTop: 2 }}>{stat.value}</div>
              {stat.sub && <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{stat.sub}</div>}
            </div>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <stat.icon style={{ width: 18, height: 18, color: stat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "var(--admin-bg-hover)",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #3b82f6)" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Counseling Department</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Select a counselor to view and manage their specific caseload.</div>
            </div>
          </div>
          <div className="relative" style={{ width: 280 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
            <Input
              placeholder="Search staff members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
              style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
            />
          </div>
        </div>

        {counselors.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <Search style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>No Counselors Found</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
              {search ? "Try adjusting your search terminology." : "You haven't added any counselors yet. Invite them from the Users & Roles tab."}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Staff Member</TableHead>
                  <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Designation</TableHead>
                  <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Active Caseload</TableHead>
                  <TableHead className="w-40 text-right pr-4" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counselors.map((counselor) => (
                  <CounselorRow key={counselor.id} counselor={counselor} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
