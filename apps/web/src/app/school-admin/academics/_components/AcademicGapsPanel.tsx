"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, AlertTriangle, Target, BarChart3, ChevronLeft, ChevronRight, GraduationCap,
  TrendingDown, CheckCircle2, XCircle,
} from "lucide-react";
import { useAllGraduationProgress } from "@/hooks/useGraduationQueries";

export function AcademicGapsPanel() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: gradProgress, isLoading: gradLoading } = useAllGraduationProgress({
    page, limit: 20, status: statusFilter === "all" ? undefined : statusFilter, sortBy: "name",
  });

  const students = gradProgress?.data || [];
  const total = gradProgress?.total || 0;
  const onTrack = students.filter((s: any) => s.status === "on_track").length;
  const atRisk = students.filter((s: any) => s.status === "at_risk").length;
  const offTrack = students.filter((s: any) => s.status === "off_track").length;
  const avgProgress = students.length > 0
    ? Math.round(students.reduce((sum: number, s: any) => sum + (s.progressPercent || 0), 0) / students.length)
    : 0;

  const filtered = search
    ? students.filter((s: any) => s.studentName?.toLowerCase().includes(search.toLowerCase()))
    : students;

  if (gradLoading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
      </div>
      <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Students", value: total, icon: BarChart3, color: "var(--admin-font-primary)" },
          { label: "On Track", value: onTrack, icon: CheckCircle2, color: "#10b981" },
          { label: "At Risk", value: atRisk, icon: AlertTriangle, color: "#f59e0b" },
          { label: "Off Track", value: offTrack, icon: XCircle, color: "#ef4444" },
          { label: "Avg Progress", value: `${avgProgress}%`, icon: Target, color: "#065292" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--admin-bg-hover)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingDown style={{ width: 16, height: 16, color: "#ef4444" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Academic Gap Analysis</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Click a student to view gaps and get AI course recommendations</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-light)" }} />
              <Input placeholder="Search students..." className="pl-9 h-8 rounded-md text-xs w-48"
                style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[120px] rounded-md text-xs"
                style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
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

        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Student", "Grade", "Credits", "Progress", "Gaps", "Status"].map((h) => (
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
                <TableCell colSpan={6} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                  <GraduationCap style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                  {total === 0 ? "Set up graduation rules to track academic gaps" : "No students match your filters"}
                </TableCell>
              </TableRow>
            ) : filtered.map((s: any) => {
              const statusColor = s.status === "on_track" ? "#10b981" : s.status === "at_risk" ? "#f59e0b" : "#ef4444";
              const StatusIcon = s.status === "on_track" ? CheckCircle2 : s.status === "at_risk" ? AlertTriangle : XCircle;
              const deficit = (s.creditsRequired || 0) - (s.creditsCompleted || 0);
              return (
                <TableRow key={s.studentId} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                  className="transition-colors"
                  onClick={() => router.push(`/school-admin/academics/gaps/${s.studentId}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${statusColor}40, ${statusColor}20)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: statusColor, fontSize: 11, fontWeight: 600,
                      }}>{s.studentName?.charAt(0)?.toUpperCase() || "?"}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{s.gradeLevel ? `Gr. ${s.gradeLevel}` : "—"}</TableCell>
                  <TableCell className="py-3 px-4">
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.creditsCompleted || 0}</span>
                    <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}> / {s.creditsRequired || 0}</span>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, s.progressPercent || 0)}%`, background: statusColor }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, minWidth: 32, textAlign: "right" }}>{s.progressPercent || 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    {deficit > 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>-{deficit} credits</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Complete</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: `${statusColor}15`, color: statusColor }}>
                      <StatusIcon style={{ width: 12, height: 12 }} />{s.status?.replace("_", " ")}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {gradProgress && (gradProgress.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>{((page - 1) * 20) + 1}–{Math.min(page * 20, gradProgress.total)} of {gradProgress.total}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="flex items-center px-2 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{page}/{gradProgress.totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= (gradProgress.totalPages || 1)} onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
