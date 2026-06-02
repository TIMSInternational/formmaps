"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { apiRequest } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Loader2, Download, GraduationCap, BookOpen,
  BarChart3, Briefcase, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StudentInfoHeader, type ReportStudent } from "./ReportShared";

export function AcademicReports({ student }: { student: ReportStudent }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/user-report/${student.id}`);
        setReportData((res?.data || res) as Record<string, unknown>);
      } catch { /* empty */ }
      setFetched(true);
    })();
  }, [student.id]);

  const gpa = (reportData?.gpa || (reportData?.academic as Record<string, unknown> | undefined)?.gpa) as Record<string, unknown> | number | undefined;
  const weightedGpa = typeof gpa === "object" && gpa ? ((gpa.weighted ?? gpa.weightedGpa) as number | undefined) : undefined;
  const unweightedGpa = typeof gpa === "object" && gpa ? ((gpa.unweighted ?? gpa.unweightedGpa ?? gpa.value) as number | undefined) : (typeof gpa === "number" ? gpa : undefined);
  const hasGpa = unweightedGpa != null && typeof unweightedGpa === "number";

  const credits = (reportData?.credits || (reportData?.academic as Record<string, unknown> | undefined)?.credits) as Record<string, unknown> | undefined;
  const creditsEarned = ((credits?.earned ?? credits?.completed) as number) ?? 0;
  const creditsRequired = ((credits?.required ?? credits?.total) as number) ?? 0;
  const hasCredits = creditsRequired > 0;

  const grades = (reportData?.grades || (reportData?.academic as Record<string, unknown> | undefined)?.grades || reportData?.recentGrades || []) as Record<string, unknown>[];
  const recentGrades = Array.isArray(grades) ? grades.slice(0, 10) : [];

  const assessments = reportData?.assessments as Record<string, unknown> | undefined;

  const downloadComprehensive = async () => {
    setDownloading("comprehensive");
    try {
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "Comprehensive Student Report",
        generatedAt: new Date().toISOString(),
        ...reportData,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `Academic-Summary-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Academic summary downloaded");
    } catch { toast.error("Failed"); }
    setDownloading(null);
  };

  const downloadPCAReport = async () => {
    setDownloading("pca");
    try {
      const res = await apiRequest(`/api/v1/reports/pca/${student.id}`);
      const data = res?.data || res;
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "PCA Career Profile Report",
        generatedAt: new Date().toISOString(),
        ...(data as Record<string, unknown>),
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `Career-Profile-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Career profile downloaded");
    } catch { toast.error("Failed"); }
    setDownloading(null);
  };

  return (
    <div>
      <StudentInfoHeader student={student} icon={Users} iconColor="#10b981" subtitle="Full Academic Summary & Career Reports" />
      <div className="p-5 space-y-5">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !reportData ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">No Academic Data</div>
            <div className="text-xs text-muted-foreground mt-1">No academic report is available for this student yet.</div>
          </div>
        ) : (
          <>
            {/* GPA + Credits row */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 gap-3"
            >
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                  <GraduationCap className="h-3.5 w-3.5" />
                  GPA
                </div>
                {hasGpa ? (
                  <div>
                    <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>
                      {typeof unweightedGpa === "number" ? unweightedGpa.toFixed(2) : unweightedGpa}
                    </div>
                    {weightedGpa != null && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Weighted: <span className="font-semibold text-foreground">{typeof weightedGpa === "number" ? weightedGpa.toFixed(2) : weightedGpa}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{"\u2014"}</div>
                )}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Credits
                </div>
                {hasCredits ? (
                  <div>
                    <div className="text-2xl font-bold" style={{ color: "#14b8a6" }}>
                      {creditsEarned}<span className="text-sm font-normal text-muted-foreground">/{creditsRequired}</span>
                    </div>
                    <div className="mt-2">
                      <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover, hsl(var(--muted)))", overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.round((creditsEarned / creditsRequired) * 100))}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          style={{ height: "100%", borderRadius: 4, background: "#14b8a6" }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{"\u2014"}</div>
                )}
              </div>
            </motion.div>

            {/* Recent Grades */}
            {recentGrades.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="rounded-lg border bg-card p-4 space-y-2"
              >
                <div className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  Recent Grades
                </div>
                <div className="space-y-1">
                  {recentGrades.map((g, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{(g.courseCode || g.course || g.name || `Course ${idx + 1}`) as string}</span>
                        {g.credits != null && (
                          <Badge variant="outline" className="text-[10px] shrink-0">{g.credits as number} cr</Badge>
                        )}
                      </div>
                      <span className="font-bold shrink-0 ml-2" style={{
                        color: (g.grade === "A" || g.grade === "A+" || g.grade === "A-" || (typeof g.grade === "number" && g.grade >= 90))
                          ? "#10b981"
                          : (g.grade === "B" || g.grade === "B+" || g.grade === "B-" || (typeof g.grade === "number" && g.grade >= 80))
                            ? "#065292"
                            : (g.grade === "C" || g.grade === "C+" || g.grade === "C-" || (typeof g.grade === "number" && g.grade >= 70))
                              ? "#f59e0b"
                              : "#ef4444",
                      }}>
                        {(g.grade ?? g.score ?? "\u2014") as string | number}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Assessment stats */}
            {assessments && (
              <div className="text-xs text-muted-foreground">
                PCA: {(assessments.pcaCount as number) || 0} evaluations &middot;
                MIL avg: {(assessments.milAverage as string) || "\u2014"} &middot;
                360: {(assessments.evalStatus as string) || "\u2014"}
              </div>
            )}

            {/* Download Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="flex items-center gap-2 pt-2 border-t"
            >
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                disabled={downloading === "comprehensive"}
                onClick={downloadComprehensive}
              >
                {downloading === "comprehensive" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Download Full Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                disabled={downloading === "pca"}
                onClick={downloadPCAReport}
              >
                {downloading === "pca" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Briefcase className="h-3 w-3" />}
                Download Career Profile
              </Button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
