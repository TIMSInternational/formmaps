"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { apiRequest } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Loader2, Download, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ScoreBar, StudentInfoHeader, type ReportStudent } from "./ReportShared";
import { LiaResultsPanel } from "./LiaResultsPanel";

export function MILReports({ student }: { student: ReportStudent }) {
  const { t } = useTranslation("counselor");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [milData, setMilData] = useState<Record<string, unknown> | null>(null);
  const [fetched, setFetched] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/lia/${student.id}`);
        setMilData((res?.data || res) as Record<string, unknown>);
      } catch { /* empty */ }
      setFetched(true);
    })();
  }, [student.id]);

  const cognitiveProfile = milData?.cognitiveProfile as Record<string, number> | undefined;
  const hasMIL = cognitiveProfile && Object.keys(cognitiveProfile).length > 0;

  // API keys are the canonical ExamType names; older payloads used lowercase.
  const cognitiveScores = hasMIL ? [
    { label: "Reasoning", labelKey: "ui.reports.mil.reasoning", key: "VerbalReasoning", legacyKey: "reasoning", color: "#8b5cf6" },
    { label: "Detection", labelKey: "ui.reports.mil.detection", key: "PatternRecognition", legacyKey: "detection", color: "var(--admin-accent-blue)" },
    { label: "Numeric", labelKey: "ui.reports.mil.numeric", key: "NumericVelocity", legacyKey: "numeric", color: "#14b8a6" },
    { label: "Memory", labelKey: "ui.reports.mil.memory", key: "WorkingMemory", legacyKey: "memory", color: "#f59e0b" },
    { label: "Orientation", labelKey: "ui.reports.mil.orientation", key: "VisualRotation", legacyKey: "orientation", color: "#ef4444" },
  ] : [];

  const completedExams = (milData?.completedExams as number) ?? 0;
  const totalExams = (milData?.totalExams as number) ?? 5;

  const downloadCognitive = async () => {
    setDownloading("cognitive");
    try {
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "MIL / LIA Profile",
        generatedAt: new Date().toISOString(),
        ...milData,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `MIL-Profile-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success(t("ui.reports.mil.profileDownloaded"));
    } catch { toast.error(t("ui.reports.downloadFailed")); }
    setDownloading(null);
  };

  const downloadExamHistory = async () => {
    setDownloading("history");
    try {
      const res = await apiRequest(`/api/v1/mil/results/${student.id}`);
      const data = res?.data || res;
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "MIL Exam Results History",
        generatedAt: new Date().toISOString(),
        ...(data as Record<string, unknown>),
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `MIL-Exams-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success(t("ui.reports.mil.historyDownloaded"));
    } catch { toast.error(t("ui.reports.downloadFailed")); }
    setDownloading(null);
  };

  return (
    <div>
      <StudentInfoHeader student={student} icon={Brain} iconColor="var(--admin-accent-blue)" subtitle={t("ui.reports.mil.subtitle")} />
      <div className="p-5 space-y-5">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !hasMIL ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">{t("ui.reports.mil.noResults")}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("ui.reports.mil.noResultsDesc")}</div>
          </div>
        ) : (
          <>
            {/* Exam Completion Summary */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 gap-3"
            >
              <div className="rounded-lg border bg-card p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: "#14b8a6" }}>
                  {completedExams}/{totalExams}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t("ui.reports.mil.examsCompleted")}</div>
              </div>
              {milData?.overallScore != null && (
                <div className="rounded-lg border bg-card p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>
                    {milData.overallScore as number}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t("ui.reports.mil.overallScore")}</div>
                </div>
              )}
            </motion.div>

            {/* Cognitive Profile Bars */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="rounded-lg border bg-card p-4 space-y-3"
            >
              <div className="text-sm font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-[var(--admin-accent-blue)]" />
                {t("ui.reports.mil.profile")}
              </div>
              <div className="space-y-2.5">
                {cognitiveScores.map((s) => {
                  const val = cognitiveProfile![s.key] ?? cognitiveProfile![s.legacyKey] ?? cognitiveProfile![s.label.toLowerCase()] ?? 0;
                  return <ScoreBar key={s.key} label={t(s.labelKey)} value={val} color={s.color} />;
                })}
              </div>
            </motion.div>

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
                disabled={downloading === "cognitive"}
                onClick={downloadCognitive}
              >
                {downloading === "cognitive" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {t("ui.reports.mil.downloadProfile")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                disabled={downloading === "history"}
                onClick={downloadExamHistory}
              >
                {downloading === "history" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {t("ui.reports.mil.downloadHistory")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={() => setShowFullReport((v) => !v)}
              >
                <FileText className="h-3 w-3" />
                {showFullReport ? t("ui.reports.hideFullReport") : t("ui.reports.viewFullReport")}
              </Button>
            </motion.div>

            {/* Full tims-parity LIA report (percentiles, bands, narrative) */}
            {showFullReport && (
              <div className="pt-4 border-t">
                <LiaResultsPanel studentId={student.id} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
