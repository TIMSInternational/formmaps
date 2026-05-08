"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, Bell, ChevronRight, ChevronLeft } from "lucide-react";
import { useMyCounselorStudents } from "@/hooks/useSchoolProfileQueries";

const assessmentStatusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  not_started: "bg-gray-100 text-gray-600",
};

export default function CounselorStudentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyCounselorStudents({
    search: search || undefined,
    status: status || undefined,
    sortBy,
    sortOrder: "asc",
    page,
    limit: 10,
  });

  if (isLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Caseload</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t("counselor.students.title", "My Students")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("counselor.students.subtitle", "View and manage your assigned students.")}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search students..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="gpa">GPA</SelectItem>
            <SelectItem value="alertCount">Alerts</SelectItem>
            <SelectItem value="gradeLevel">Grade</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Students Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-foreground">Students</span>
            {data && <Badge variant="secondary">{data.total}</Badge>}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>GPA</TableHead>
                <TableHead>Credit Progress</TableHead>
                <TableHead>Assessments</TableHead>
                <TableHead>Career Path</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors"
                  onClick={() => router.push(`/counselor/students/${s.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.gradeLevel}</Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">{s.gpa ? s.gpa.toFixed(2) : "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[120px]">
                      <Progress value={s.creditProgress?.percentage ?? 0} className="h-2" />
                      <p className="text-xs text-muted-foreground">{s.creditProgress?.earned ?? 0}/{s.creditProgress?.required ?? 120}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {s.assessmentStatus ? Object.entries(s.assessmentStatus).map(([type, assessStatus]) => (
                        <Badge key={type} className={`text-xs ${assessmentStatusColors[assessStatus as string] || "bg-gray-100 text-gray-600"}`}>
                          {type}
                        </Badge>
                      )) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{s.careerPath || "—"}</TableCell>
                  <TableCell>
                    {s.alertCount && s.alertCount > 0 ? (
                      <Badge className="bg-red-100 text-red-700">
                        <Bell className="h-3 w-3 mr-1" />{s.alertCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.lastActive ? new Date(s.lastActive).toLocaleDateString() : (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—")}
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.data || data.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No students assigned to you yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-2 py-4 gap-4">
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            Displaying <span className="font-bold text-foreground">{((page - 1) * 10) + (data.data.length > 0 ? 1 : 0)}</span> – <span className="font-bold text-foreground">{Math.min(page * 10, data.total)}</span> of <span className="font-bold text-foreground">{data.total}</span> students
          </div>
          <div className="flex items-center gap-1.5 w-full justify-center sm:w-auto sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="h-8 rounded-lg px-3"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.pagination.previous", "Previous")}
            </Button>
            <div className="flex items-center px-2">
              <span className="text-sm font-semibold text-foreground">{page}</span>
              <span className="text-sm text-muted-foreground mx-1.5">/</span>
              <span className="text-sm text-muted-foreground font-medium">{data.totalPages || 1}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= (data.totalPages || 1)}
              className="h-8 rounded-lg px-3"
            >
              {t("common.pagination.next", "Next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
