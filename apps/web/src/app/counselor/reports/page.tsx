"use client";

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/api/apiClient";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Search, Target, Brain, BarChart3, Eye } from "lucide-react";
import { PCAReports } from "./_components/PCAReports";
import { MILReports } from "./_components/MILReports";
import { AcademicReports } from "./_components/AcademicReports";
import type { ReportStudent } from "./_components/ReportShared";

type TabKey = "pca" | "mil" | "academic";

export default function CounselorReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("pca");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<ReportStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<ReportStudent | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
        const items = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        setStudents(Array.isArray(items) ? items : []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "pca", label: "PCA / DISC Profile", icon: Target },
    { key: "mil", label: "MIL / LIA Cognitive", icon: Brain },
    { key: "academic", label: "Full Academic Summary", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dash-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              View and download assessment reports for your assigned students
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          className="pl-9 h-9 rounded-lg text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Students Table */}
      <div className="dash-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Student</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Grade</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(5).fill(0).map((_, j) => (
                    <TableCell key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                  <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  No students found
                </TableCell>
              </TableRow>
            ) : filtered.map((student) => (
              <TableRow
                key={student.id}
                className="hover:bg-muted/50 transition-colors"
              >
                <TableCell className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white text-xs font-semibold">
                      {student.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4 text-sm text-muted-foreground">{student.email}</TableCell>
                <TableCell className="py-3 px-4 text-sm text-muted-foreground">{student.gradeLevel || "\u2014"}</TableCell>
                <TableCell className="py-3 px-4">
                  <Badge variant="secondary" className={`text-xs ${student.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {student.status || "active"}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 px-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs gap-1.5"
                    onClick={() => setSelectedStudent(student)}
                  >
                    <Eye className="h-3 w-3" />
                    View Report
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Student Report Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">{selectedStudent?.name} Reports</DialogTitle>
          {selectedStudent && (
            activeTab === "pca" ? <PCAReports student={selectedStudent} /> :
            activeTab === "mil" ? <MILReports student={selectedStudent} /> :
            <AcademicReports student={selectedStudent} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
