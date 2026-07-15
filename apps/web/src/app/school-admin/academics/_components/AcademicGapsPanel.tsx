"use client";

import { useState, useMemo } from "react";
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
  TrendingDown, CheckCircle2, XCircle, BookX,
} from "lucide-react";
import { useAcademicGapSummary } from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";

const PAGE_SIZE = 20;
const statusMeta = (s: string) => s === "on_track"
  ? { color: "#10b981", Icon: CheckCircle2 }
  : s === "at_risk" ? { color: "#f59e0b", Icon: AlertTriangle }
  : { color: "#ef4444", Icon: XCircle };

export function AcademicGapsPanel() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  // /academic-gaps/summary returns the full list (real credit deficit + missing
  // required courses per student) — filter/search/paginate client-side.
  const { data, isLoading } = useAcademicGapSummary();
  const all: AcademicGapSummaryItem[] = data?.data ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    return all.filter((s) =>
      (statusFilter === "all" || s.overallStatus === statusFilter) &&
      (!search || s.studentName?.toLowerCase().includes(search.toLowerCase())),
    );
  }, [all, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const avgProgress = all.length > 0
    ? Math.round(all.reduce((sum, s) => sum + (s.progressPercent || 0), 0) / all.length)
    : 0;

  if (isLoading) return (
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
          { label: "Total Students", value: summary?.totalStudents ?? all.length, icon: BarChart3, color: "var(--admin-font-primary)" },
          { label: "On Track", value: summary?.onTrack ?? 0, icon: CheckCircle2, color: "#10b981" },
          { label: "At Risk", value: summary?.atRisk ?? 0, icon: AlertTriangle, color: "#f59e0b" },
          { label: "Off Track", value: summary?.offTrack ?? 0, icon: XCircle, color: "#ef4444" },
          { label: "Avg Progress", value: `${avgProgress}%`, icon: Target, color: "#2E9098" },
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
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Credit deficit + missing required courses per student. Click a student for the full breakdown + AI course plan.</div>
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
              {["Student", "Grade", "Credits", "Credit Gap", "Missing Courses", "Status"].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                  <GraduationCap style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                  {all.length === 0 ? "Set up graduation rules to track academic gaps" : "No students match your filters"}
                </TableCell>
              </TableRow>
            ) : pageRows.map((s) => {
              const { color, Icon } = statusMeta(s.overallStatus);
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
                        background: `linear-gradient(135deg, ${color}40, ${color}20)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color, fontSize: 11, fontWeight: 600,
                      }}>{s.studentName?.charAt(0)?.toUpperCase() || "?"}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{s.gradeLevel ? `Gr. ${s.gradeLevel}` : "—"}</TableCell>
                  <TableCell className="py-3 px-4">
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.creditsEarned ?? 0}</span>
                    <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}> / {s.creditsRequired ?? 0}</span>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    {(s.creditDeficit || 0) > 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>-{s.creditDeficit} credits</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Complete</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    {(s.missingRequiredCourses || 0) > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                        <BookX style={{ width: 12, height: 12 }} />{s.missingRequiredCourses} {s.missingRequiredCourses === 1 ? "category" : "categories"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: `${color}15`, color }}>
                      <Icon style={{ width: 12, height: 12 }} />{s.overallStatus?.replace("_", " ")}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>{((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="flex items-center px-2 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{safePage}/{totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
