"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
    { limit: 1000 } // Fetch more for caching, adjust as needed backend side
  );
  // Fetch a larger pool of students for assignment 
  const { data: allStudents } = useStudents({ limit: 1000 });

  const assign = useAssignStudents();
  const unassign = useUnassignStudents();

  const assignedIds = useMemo(() => new Set(assignedStudents?.data?.map((s: any) => s.id) ?? []), [assignedStudents]);

  // Memoize available students with advanced filtering
  const availableStudents = useMemo(() => {
    return (allStudents?.data ?? []).filter((s: any) => {
      if (assignedIds.has(s.id)) return false;

      const matchesSearch = s.name?.toLowerCase().includes(search.toLowerCase());
      const matchesGrade = gradeFilter === "all" || String(s.gradeLevel) === gradeFilter;

      return matchesSearch && matchesGrade;
    });
  }, [allStudents, assignedIds, search, gradeFilter]);

  // Extract unique grades for filter dropdown
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
        className="cursor-pointer transition-colors hover:bg-teal-50/40 group border-b border-gray-100"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="rounded-l-xl pl-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`p-1 rounded-full transition-colors ${expanded ? "bg-teal-100/50 text-teal-600" : "text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-600"}`}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
            <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm">
              <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 font-bold border border-indigo-200">
                {counselor.name?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold text-gray-900 leading-tight">{counselor.name}</p>
              <p className="text-sm font-medium text-gray-500 mt-0.5">{counselor.email}</p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="capitalize text-indigo-700 border-indigo-200 bg-indigo-50/50 px-2.5 py-1">
            {counselor.role.replace('_', ' ')}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-gray-700">{assignedStudents?.total ?? 0}</span>
            <span className="text-gray-500 text-sm">assigned</span>
          </div>
        </TableCell>
        <TableCell className="rounded-r-xl pr-6 text-right" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            className="bg-white border-2 border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-300 shadow-sm rounded-xl font-semibold transition-all"
            onClick={() => setAssignOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Manage Students
          </Button>
        </TableCell>
      </TableRow>

      {/* Expanded Students List */}
      <AnimatePresence>
        {expanded && (
          <TableRow className="bg-gray-50/30 border-b border-gray-100">
            <TableCell colSpan={4} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-6 ml-12">
                  <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-teal-600" />
                    Current Caseload
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {loadingAssigned ? (
                      Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
                    ) : assignedStudents?.data?.length ? (
                      assignedStudents.data.map((s: any) => (
                        <div key={s.id} className="group flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-teal-200 transition-colors">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-teal-50 text-teal-700 font-bold border border-teal-100">
                                {s.name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-800 line-clamp-1">{s.name}</span>
                              {s.gradeLevel && <span className="text-xs font-semibold text-gray-500">Grade {s.gradeLevel}</span>}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-red-100"
                            onClick={() => handleUnassign(s.id)}
                            title="Remove from caseload"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full py-8 text-center bg-white rounded-xl border border-dashed border-gray-200">
                        <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Users className="h-5 w-5 text-gray-400" />
                        </div>
                        <p className="font-medium text-gray-900">No students assigned yet</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Click &quot;Manage Students&quot; to assign students to this counselor&apos;s caseload.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>

      {/* Advanced Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden bg-gray-50 flex flex-col max-h-[90vh]">
          <div className="bg-white p-6 border-b border-gray-100 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 bg-teal-50 rounded-xl">
                  <UserCheck className="h-6 w-6 text-teal-600" />
                </div>
                Assign Students to {counselor.name}
              </DialogTitle>
              <DialogDescription className="text-base text-gray-500 mt-1">
                Filter and select multiple students to efficiently build the caseload.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-4 flex-1 overflow-y-auto flex flex-col min-h-0">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search available students by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-12 rounded-xl border-gray-200 bg-white text-base shadow-sm focus:border-teal-400 focus:ring-teal-400/20"
                />
              </div>
              <div className="flex gap-2 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="h-4 w-4 text-gray-400" />
                </div>
                <select
                  className="h-12 pl-9 pr-8 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none appearance-none cursor-pointer"
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                >
                  <option value="all">All Grades</option>
                  {uniqueGrades.map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>

            {/* List Selection Header */}
            <div className="flex items-center justify-between px-2 pt-2 pb-1 shrink-0">
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={isAllVisibleSelected}
                  // Add indeterminate state visual conceptually if some are selected
                  className={`h-5 w-5 rounded ${isSomeVisibleSelected && !isAllVisibleSelected ? "bg-teal-50 border-teal-300" : ""}`}
                  onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                />
                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">
                  Select All
                </span>
              </label>
              <span className="text-sm font-semibold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">{selected.size} total selected</span>
            </div>

            {/* Virtualized List Container (CSS driven for simplicity in this file) */}
            <div className="flex-1 min-h-[250px] overflow-y-auto space-y-2 border border-gray-200 rounded-2xl bg-white p-2 shadow-inner custom-scrollbar">
              {availableStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <Search className="h-8 w-8 text-gray-300" />
                  </div>
                  <p className="text-lg font-bold text-gray-900">No students found</p>
                  <p className="text-sm text-gray-500 max-w-sm mt-2">
                    {search || gradeFilter !== "all"
                      ? "Try adjusting your search query or grade filters to see more results."
                      : "All available students have already been assigned to caseloads."}
                  </p>
                </div>
              ) : (
                // Use a standard map but with efficient styling
                availableStudents.map((s: any) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-4 py-3 px-4 rounded-xl border transition-all cursor-pointer select-none ${selected.has(s.id) ? "bg-teal-50/50 border-teal-200 shadow-sm" : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-200"
                      }`}
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      className="h-5 w-5 rounded border-gray-300 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selected);
                        if (checked) newSelected.add(s.id);
                        else newSelected.delete(s.id);
                        setSelected(newSelected);
                      }}
                    />
                    <Avatar className="h-9 w-9 border border-gray-100">
                      <AvatarFallback className="bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600 font-bold text-xs">{s.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col flex-1">
                      <span className="text-sm font-bold text-gray-900">{s.name}</span>
                      <span className="text-xs font-medium text-gray-500">{s.email || "No email provided"}</span>
                    </div>
                    {s.gradeLevel && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-700 font-semibold border-none">
                        Grade {s.gradeLevel}
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-6 border-t border-gray-100 shrink-0">
            <DialogFooter className="gap-3 sm:gap-0">
              <Button variant="ghost" className="rounded-xl h-12 px-6 font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100" onClick={() => { setAssignOpen(false); setSelected(new Set()); setSearch(""); setGradeFilter("all"); }}>Cancel</Button>
              <Button
                onClick={handleAssign}
                disabled={selected.size === 0 || assign.isPending}
                className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl h-12 px-8 font-bold shadow-md hover:shadow-lg transition-all"
              >
                {assign.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Confirm Assignments {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CounselorStudentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useSchoolUsers({ role: "counselor", limit: 100 });

  const counselors = (users?.data ?? []).filter(
    (u: SchoolUser) =>
      u.role.includes("counselor") &&
      (!search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.counselorStudents.title", "Student Caseload Management")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.counselorStudents.subtitle", "Organize and verify student assignments across your counseling department efficiently.")}
        </p>
      </motion.div>

      {/* Stats Cards */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50 rounded-3xl overflow-hidden hover:shadow-xl transition-shadow flex flex-col justify-center">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Staff</p>
              <p className="text-4xl font-black text-gray-900">{users?.total ?? 0}</p>
            </div>
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center shadow-inner">
              <Users className="h-7 w-7 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-teal-500 to-cyan-600 rounded-3xl overflow-hidden hover:shadow-xl transition-shadow flex flex-col justify-center text-white">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-teal-100 uppercase tracking-wider">System Status</p>
              <p className="text-3xl font-black tracking-tight">Active</p>
              <p className="text-sm font-medium text-teal-100 hidden lg:block">Caseloading enabled</p>
            </div>
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg border border-white/20">
              <UserCheck className="h-7 w-7 text-white" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-indigo-50/50 rounded-3xl overflow-hidden hover:shadow-xl transition-shadow flex flex-col justify-center">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-indigo-400 uppercase tracking-wider">All-Access</p>
              <p className="text-4xl font-black text-indigo-900">
                {counselors.filter((c) => c.accessScope === "all").length}
              </p>
            </div>
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center shadow-inner border border-indigo-50">
              <SortAsc className="h-7 w-7 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Table Container */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 shadow-xl rounded-3xl overflow-hidden bg-white/80 backdrop-blur-xl">
          <CardHeader className="bg-gradient-to-r from-gray-50/80 to-white border-b border-gray-100 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-100">
                  <Users className="h-5 w-5 text-gray-600" />
                </div>
                Counseling Department
              </CardTitle>
              <CardDescription className="text-sm mt-1">Select a counselor to view and manage their specific caseload.</CardDescription>
            </div>

            <div className="relative w-full sm:w-[320px] shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search staff members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-11 rounded-full bg-white border-gray-200 focus:bg-white focus:border-indigo-400 shadow-sm transition-all h-11"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {counselors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-gray-50/30">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-5 border border-gray-100">
                  <Search className="h-10 w-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Counselors Found</h3>
                <p className="text-gray-500 max-w-sm">
                  {search ? "Try adjusting your search terminology." : "You haven't added any counselors yet. Invite them from the Users & Roles tab."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-transparent border-b border-gray-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-gray-700 pl-8 py-5">Staff Member</TableHead>
                      <TableHead className="font-semibold text-gray-700 w-48">Designation</TableHead>
                      <TableHead className="font-semibold text-gray-700 w-48">Active Caseload</TableHead>
                      <TableHead className="font-semibold text-gray-700 w-48 text-right pr-6">Management Actions</TableHead>
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
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
