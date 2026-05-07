"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, FileText, FilePlus, Download, Eye, Award, Clock, Target,
} from "lucide-react";
import { useStudentResults, useStudentDetailResult } from "@/hooks/useSchoolAdmin";
import { exportResults } from "@/services/schoolAdminService";
import { toast } from "sonner";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import GradeImportForm from "@/components/school-admin/GradeImportForm";

export default function ResultsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const limit = 10;

  const { data: results, isLoading, refetch } = useStudentResults({
    page, limit,
    assessmentType: typeFilter !== "all" ? typeFilter : undefined,
  });
  const { data: studentDetail, isLoading: detailLoading } = useStudentDetailResult(
    selectedStudentId || "", !!selectedStudentId && isDetailOpen
  );

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      const blob = await exportResults({ format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `results.${format}`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Results exported");
    } catch { toast.error("Failed to export"); }
  };

  const getScoreStyle = (score: number) =>
    score >= 80 ? { bg: "rgba(16,185,129,0.1)", color: "#10b981" }
    : score >= 60 ? { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" }
    : { bg: "rgba(239,68,68,0.1)", color: "#ef4444" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            Student Results
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            View and export student assessment results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsImportOpen(true)} style={{
            height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--admin-bg-icon-box)", border: "1px solid var(--admin-border-default)",
            color: "var(--admin-font-secondary)", cursor: "pointer",
          }}>
            <FilePlus style={{ width: 14, height: 14 }} /> Import Grades
          </button>
          <button onClick={() => handleExport("csv")} style={{
            height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--admin-bg-icon-box)", border: "1px solid var(--admin-border-default)",
            color: "var(--admin-font-secondary)", cursor: "pointer",
          }}>
            <Download style={{ width: 14, height: 14 }} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3" style={{
        padding: 12, borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
      }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input
            placeholder="Search by student name..."
            className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
            <SelectValue placeholder="Assessment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="career">Career Assessment</SelectItem>
            <SelectItem value="skills">Skills Assessment</SelectItem>
            <SelectItem value="personality">Personality Test</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Student", "Assessment", "Type", "Score", "Duration", "Date", "Actions"].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton columnCount={7} rowCount={5} />
            ) : !(Array.isArray(results?.data) ? results.data : (results?.data as any)?.data)?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <FileText className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm font-medium">No results found</p>
                  <p className="text-xs mt-1" style={{ color: "var(--admin-font-tertiary)" }}>Results will appear as students complete assessments</p>
                </TableCell>
              </TableRow>
            ) : (
              (Array.isArray(results.data) ? results.data : (results.data as any)?.data || []).map((result: any) => {
                const scoreStyle = getScoreStyle(result.score);
                return (
                  <TableRow key={result.id} style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                    className="transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 12, fontWeight: 600,
                        }}>
                          {result.student?.name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{result.student?.name}</div>
                          <div style={{ fontSize: 11, color: "var(--admin-font-light)" }}>{result.student?.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                      {result.assessmentName}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant="outline" className="text-xs" style={{
                        borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)",
                        background: "var(--admin-bg-hover)",
                      }}>
                        {result.assessmentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
                        background: scoreStyle.bg, color: scoreStyle.color,
                      }}>
                        {result.score}%
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                        <Clock style={{ width: 12, height: 12 }} />
                        {result.duration} min
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                      {new Date(result.completedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <button onClick={() => { setSelectedStudentId(result.student?.id); setIsDetailOpen(true); }}
                        style={{
                          height: 28, borderRadius: 4, padding: "0 10px", fontSize: 11, fontWeight: 500,
                          display: "flex", alignItems: "center", gap: 4,
                          background: "transparent", border: "1px solid var(--admin-border-default)",
                          color: "var(--admin-font-secondary)", cursor: "pointer",
                        }}>
                        <Eye style={{ width: 12, height: 12 }} /> View
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {results && results.totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{
            borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
          }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
              Page <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{page}</span> of{" "}
              <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{results.totalPages}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1} className="h-7 rounded-md text-xs"
                style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}
                disabled={page >= (results?.totalPages || results?.data?.totalPages || 1)} className="h-7 rounded-md text-xs"
                style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Student Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" style={{
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          color: "var(--admin-font-primary)",
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--admin-font-primary)" }}>
              <Award style={{ width: 18, height: 18, color: "#14b8a6" }} />
              Student Performance Detail
            </DialogTitle>
            <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
              Detailed assessment history and performance breakdown
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-12" style={{ color: "var(--admin-font-light)" }}>Loading...</div>
          ) : studentDetail ? (
            <div className="space-y-5">
              {/* Student Info */}
              <div className="flex items-center gap-4 p-4 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 18, fontWeight: 700,
                }}>
                  {studentDetail.student?.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{studentDetail.student?.name}</div>
                  <div style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{studentDetail.student?.email}</div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Assessments", value: studentDetail.summary?.totalAssessments || 0, color: "#14b8a6" },
                  { label: "Avg. Score", value: `${(studentDetail.summary?.averageScore || 0).toFixed(1)}%`, color: "#8b5cf6" },
                  { label: "Time Spent", value: `${studentDetail.summary?.totalTimeSpent || 0}m`, color: "#f59e0b" },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Assessment History */}
              {studentDetail.assessments?.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>Assessment History</div>
                  <div className="space-y-2">
                    {studentDetail.assessments.map((a: any) => {
                      const ss = getScoreStyle(a.score);
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{a.name}</div>
                            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{new Date(a.completedAt).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <span style={{ fontSize: 14, fontWeight: 700, color: ss.color }}>{a.score}%</span>
                            <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{a.duration} min</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12" style={{ color: "var(--admin-font-light)" }}>
              <FileText style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
              <p className="text-sm">No details available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Grade Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <GradeImportForm onClose={() => setIsImportOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
