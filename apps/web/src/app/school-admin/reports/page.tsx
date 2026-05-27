"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { useStudents } from "@/hooks/useSchoolAdmin";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminTabBar } from "../_components/AdminTabBar";
import {
  FileText, Search, Download, ChevronLeft, ChevronRight, Target, Brain,
  Users, CheckCircle2, Clock, AlertTriangle, Loader2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type TabKey = "pca" | "mil" | "360";

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("pca");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>Reports</h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>Download assessment reports for individual students</p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "pca", label: "PCA / DISC Profile", icon: Target },
          { key: "mil", label: "MIL / LIA Cognitive", icon: Brain },
          { key: "360", label: "360° Evaluation", icon: Users },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder="Search students..." className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* Student Table with Download Actions */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Student", "Email", "Grade", "Status", "Report"].map((h) => (
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
                  <FileText style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                  No students found
                </TableCell>
              </TableRow>
            ) : students.map((student: any) => (
              <TableRow key={student.id} style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                className="transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <TableCell className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 11, fontWeight: 600,
                    }}>{student.name?.charAt(0)?.toUpperCase()}</div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{student.email}</TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{student.gradeLevel || "—"}</TableCell>
                <TableCell className="py-3 px-4">
                  <Badge className="text-xs font-medium shadow-none border-0" style={{
                    background: student.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                    color: student.status === "active" ? "#10b981" : "#6b7280",
                  }}>{student.status || "active"}</Badge>
                </TableCell>
                <TableCell className="py-3 px-4">
                  <ReportAction studentId={student.id} studentName={student.name} type={activeTab} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
              Page <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{page}</span> of {totalPages}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Report action button per student per assessment type
function ReportAction({ studentId, studentName, type }: { studentId: string; studentName: string; type: TabKey }) {
  const [loading, setLoading] = useState(false);

  const handleDownloadPCA = async () => {
    setLoading(true);
    try {
      // Get PCA result which contains the chart image URL
      const res = await apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: studentId } });
      const data = res?.data || res;
      if (!data || data.pcaD1 == null) {
        toast.error(`No PCA results available for ${studentName}`);
        setLoading(false);
        return;
      }
      // Download chart image through our proxy
      const pcaCod = data.pcaCod;
      if (pcaCod) {
        const imgRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pcaapi/img-report?pcaCod=${pcaCod}`,
          { credentials: "include" }
        );
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `PCA-DISC-${studentName.replace(/\s+/g, "-")}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`PCA chart downloaded for ${studentName}`);
        } else {
          toast.error("Failed to download PCA chart");
        }
      } else {
        toast.error("No PCA code found");
      }
    } catch { toast.error("Failed to fetch PCA data"); }
    setLoading(false);
  };

  const handleDownloadMIL = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/v1/reports/lia/${studentId}`);
      const data = res?.data || res;
      if (!data?.cognitiveProfile) {
        toast.error(`No MIL/LIA results available for ${studentName}`);
        setLoading(false);
        return;
      }
      // Export as JSON (can be enhanced to PDF later)
      const blob = new Blob([JSON.stringify({
        student: studentName,
        type: "MIL / LIA Cognitive Profile",
        generatedAt: new Date().toISOString(),
        ...data,
      }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MIL-Report-${studentName.replace(/\s+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`MIL report downloaded for ${studentName}`);
    } catch { toast.error("Failed to fetch MIL data"); }
    setLoading(false);
  };

  const handleDownload360 = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/v1/reports/user-report/${studentId}`);
      const data = res?.data || res;
      if (!data) {
        toast.error(`No report data available for ${studentName}`);
        setLoading(false);
        return;
      }
      // Export comprehensive report as JSON
      const blob = new Blob([JSON.stringify({
        student: studentName,
        type: "360° Evaluation Report",
        generatedAt: new Date().toISOString(),
        ...data,
      }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `360-Report-${studentName.replace(/\s+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`360° report downloaded for ${studentName}`);
    } catch { toast.error("Failed to fetch 360° data"); }
    setLoading(false);
  };

  const handleDownload = () => {
    if (type === "pca") handleDownloadPCA();
    else if (type === "mil") handleDownloadMIL();
    else handleDownload360();
  };

  const label = type === "pca" ? "DISC Chart" : type === "mil" ? "Cognitive Report" : "360° Report";

  return (
    <button onClick={handleDownload} disabled={loading} style={{
      height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
      display: "flex", alignItems: "center", gap: 6,
      background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
      border: "1px solid var(--admin-border-default)", cursor: loading ? "wait" : "pointer",
      opacity: loading ? 0.6 : 1,
    }}>
      {loading ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Download style={{ width: 12, height: 12 }} />}
      {label}
    </button>
  );
}
