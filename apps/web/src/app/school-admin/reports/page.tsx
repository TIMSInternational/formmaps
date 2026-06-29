"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { useStudents } from "@/hooks/useSchoolAdmin";
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
import { AdminTabBar } from "../_components/AdminTabBar";
import { FileText, Search, ChevronLeft, ChevronRight, Target, Brain, Users } from "lucide-react";
import { StudentReportPanel } from "./_components/StudentReportPanels";

type TabKey = "pca" | "mil" | "360";

interface StudentRecord {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string;
  status?: string;
}

export default function ReportsPage() {
  const { t } = useTranslation("school_admin");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("pca");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey;
    if (tab && ["pca", "mil", "360"].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    router.replace(`/school-admin/reports?tab=${key}`, { scroll: false });
  };

  const { data: studentsData, isLoading } = useStudents({ page, limit: 20, search: search || undefined });
  const students = studentsData?.data || [];
  const totalPages = studentsData?.totalPages || 1;

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>{t("reports.title")}</h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>{t("reports.subtitle")}</p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "pca", label: t("reports.tabs.pca"), icon: Target },
          { key: "mil", label: t("reports.tabs.mil"), icon: Brain },
          { key: "360", label: t("reports.tabs.eval360"), icon: Users },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder={t("reports.searchPlaceholder")} className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {[t("reports.table.student"), t("reports.table.email"), t("reports.table.grade"), t("reports.table.status"), ""].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(5).fill(0).map((_, j) => (
                    <TableCell key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" style={{ background: "var(--admin-bg-hover)" }} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                  <FileText style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} /> {t("reports.noStudents")}
                </TableCell>
              </TableRow>
            ) : students.map((student: StudentRecord) => (
              <TableRow key={student.id} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                className="transition-colors"
                onClick={() => setSelectedStudent(student)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <TableCell className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #14b8a6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      {student.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{student.email}</TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{student.gradeLevel || "\u2014"}</TableCell>
                <TableCell className="py-3 px-4">
                  <Badge className="text-xs font-medium shadow-none border-0" style={{
                    background: student.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                    color: student.status === "active" ? "#10b981" : "#6b7280",
                  }}>{student.status || t("reports.statusActive")}</Badge>
                </TableCell>
                <TableCell className="py-3 px-4">
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-accent-blue, #065292)" }}>{t("reports.viewReports")}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>{t("reports.pagination", { page, total: totalPages })}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Student Report Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", maxWidth: 560, padding: 0, overflow: "hidden" }}>
          <DialogTitle className="sr-only">{selectedStudent?.name} Reports</DialogTitle>
          {selectedStudent && <StudentReportPanel student={selectedStudent} type={activeTab} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
