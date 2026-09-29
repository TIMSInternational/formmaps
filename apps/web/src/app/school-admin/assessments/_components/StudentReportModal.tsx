"use client";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Award, Brain, Target, Users, Download, FileText, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { useStudentReport } from "@/hooks/useSchoolAdmin";
import { openPrintableReport, escapeHtml } from "@/lib/printableReport";
import type { StudentReport } from "@/types/student";
import { toast } from "sonner";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

// Strip anything that isn't safe in a download filename (path separators, etc.).
const safeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 80) || "student";

const scoreColor = (s: number) => (s >= 80 ? "#059669" : s >= 60 ? "#d97706" : "#dc2626");

// One completion chip (MIL / DISC / 360 / Overall).
function CompletionChip({ label, done }: { label: string; done: boolean }) {
  const { t } = useTranslation("school_admin");
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg" style={{
      background: "var(--admin-bg-hover)",
      border: `1px solid ${done ? "rgba(5,150,105,0.35)" : "var(--admin-border-default)"}`,
    }}>
      {done
        ? <CheckCircle2 style={{ width: 18, height: 18, color: "#059669", flexShrink: 0 }} />
        : <XCircle style={{ width: 18, height: 18, color: "var(--admin-font-tertiary)", flexShrink: 0, opacity: 0.5 }} />}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{label}</div>
        <div style={{ fontSize: 10, color: done ? "#059669" : "var(--admin-font-tertiary)" }}>
          {done ? t("ui.studentReport.completed") : t("ui.studentReport.pending")}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, color, title, sub }: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>; color: string; title: string; sub: string;
}) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
      <Icon style={{ width: 16, height: 16, color }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{title}</span>
      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>· {sub}</span>
    </div>
  );
}

// Build the printable PDF sections from the report DTO. All dynamic values are escaped.
function buildPrintableSections(r: StudentReport, t: TFunction) {
  const done = (v: boolean) => (v ? t("ui.studentReport.completed") : t("ui.studentReport.pending"));
  const sections = [];
  sections.push({
    heading: t("ui.studentReport.completionSummary"),
    content: `<table><tr><th>${t("ui.studentReport.component")}</th><th>${t("ui.studentReport.status")}</th></tr>
      <tr><td>MIL / LIA</td><td>${done(r.completion.lia)}</td></tr>
      <tr><td>PCA</td><td>${done(r.completion.disc)}</td></tr>
      <tr><td>${t("ui.studentReport.eval360")}</td><td>${done(r.completion.eval360)}</td></tr>
      <tr><td>${t("ui.studentReport.personality")}</td><td>${done(r.completion.personality)}</td></tr>
      <tr><td><strong>${t("ui.studentReport.overall")}</strong></td><td><strong>${r.completion.overall ? t("ui.studentReport.complete") : t("ui.studentReport.incomplete")}</strong></td></tr></table>`,
  });
  if (r.mil.sessions.length) {
    sections.push({
      heading: `${t("ui.studentReport.milExams")} (${t("ui.studentReport.milSub", { avg: r.mil.averageScore, count: r.mil.completedCount })})`,
      content: `<table><tr><th>${t("ui.studentReport.exam")}</th><th>${t("ui.studentReport.status")}</th><th>${t("ui.studentReport.score")}</th><th>${t("ui.studentReport.date")}</th></tr>${r.mil.sessions.map(s =>
        `<tr><td>${escapeHtml(s.examName || "—")}</td><td>${escapeHtml(s.status || "—")}</td><td>${s.completed ? `${s.scorePercentage}%` : "—"}</td><td>${escapeHtml(fmtDate(s.startTime))}</td></tr>`).join("")}</table>`,
    });
  }
  if (r.evaluation360.groups.length) {
    sections.push({
      heading: `${t("ui.studentReport.evaluations360")} (${t("ui.studentReport.completedOf", { completed: r.evaluation360.completed, total: r.evaluation360.total })})`,
      content: `<table><tr><th>${t("ui.studentReport.evaluator")}</th><th>${t("ui.studentReport.type")}</th><th>${t("ui.studentReport.status")}</th><th>${t("ui.studentReport.date")}</th></tr>${r.evaluation360.groups.map(g =>
        `<tr><td>${escapeHtml(g.evaluatorName || "—")}</td><td>${escapeHtml(g.groupType || "—")}</td><td>${done(g.isCompleted)}</td><td>${escapeHtml(fmtDate(g.completedDate))}</td></tr>`).join("")}</table>`,
    });
  }
  return sections;
}

export function StudentReportModal({ studentId, open, onOpenChange }: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation("school_admin");
  const { data: report, isLoading, isError } = useStudentReport(studentId || "", !!studentId && open);

  const downloadPdf = () => {
    if (!report) return;
    openPrintableReport(t("ui.studentReport.title"), report.student.name, buildPrintableSections(report, t));
  };

  const downloadJson = () => {
    if (!report) return;
    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Assessment-Report-${safeFileName(report.student.name)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t("ui.studentReport.downloaded"));
    } catch { toast.error(t("ui.studentReport.downloadFailed")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" style={{
        background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)",
      }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--admin-font-primary)" }}>
            <Award style={{ width: 18, height: 18, color: "var(--admin-accent-blue)" }} />
            {t("ui.studentReport.title")}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
            {t("ui.studentReport.description")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: "var(--admin-font-light)" }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> {t("ui.studentReport.loading")}
          </div>
        ) : isError || !report ? (
          <div className="text-center py-12" style={{ color: "var(--admin-font-light)" }}>
            <FileText style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
            <p className="text-sm">{t("ui.studentReport.noReport")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Student header */}
            <div className="flex items-center gap-4 p-4 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", background: "#102B47",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 18, fontWeight: 700,
              }}>
                {report.student.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{report.student.name}</div>
                <div style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{report.student.email}</div>
                {report.student.gradeLevel != null && (
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("graduation.gradeLabel", { grade: report.student.gradeLevel })}</div>
                )}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                background: report.completion.overall ? "rgba(5,150,105,0.1)" : "var(--admin-bg-card)",
                color: report.completion.overall ? "#059669" : "var(--admin-font-tertiary)",
                border: `1px solid ${report.completion.overall ? "rgba(5,150,105,0.35)" : "var(--admin-border-default)"}`,
              }}>
                {report.completion.overall ? t("ui.studentReport.complete") : t("ui.studentReport.incomplete")}
              </span>
            </div>

            {/* Completion summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <CompletionChip label="MIL" done={report.completion.lia} />
              <CompletionChip label="PCA" done={report.completion.disc} />
              <CompletionChip label="360" done={report.completion.eval360} />
              <CompletionChip label={t("ui.studentReport.personality")} done={report.completion.personality} />
              <CompletionChip label={t("ui.studentReport.overall")} done={report.completion.overall} />
            </div>

            {/* Cognitive (MIL) */}
            <div>
              <SectionHeading icon={Brain} color="var(--admin-accent-blue)" title={t("ui.studentReport.milExams")}
                sub={t("ui.studentReport.milSub", { avg: report.mil.averageScore, count: report.mil.completedCount })} />
              {report.mil.sessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", padding: "8px 0" }}>{t("ui.studentReport.noMilSessions")}</div>
              ) : (
                <div className="space-y-2">
                  {report.mil.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.examName || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{s.status || "—"} · {fmtDate(s.startTime)}</div>
                      </div>
                      {s.completed
                        ? <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(s.scorePercentage) }}>{s.scorePercentage}%</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("ui.studentReport.inProgress")}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DISC / PCA */}
            <div>
              <SectionHeading icon={Target} color="#8b5cf6" title="PCA"
                sub={t("ui.studentReport.evaluationCount", { count: report.pca.evaluationCount })} />
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>
                {report.pca.completed
                  ? <><CheckCircle2 style={{ width: 14, height: 14, color: "#059669" }} /> {t("ui.studentReport.completed")}{report.pca.lastCompletedDate ? ` · ${fmtDate(report.pca.lastCompletedDate)}` : ""}</>
                  : <><XCircle style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", opacity: 0.5 }} /> {t("ui.studentReport.notCompleted")}</>}
              </div>
            </div>

            {/* 360 */}
            <div>
              <SectionHeading icon={Users} color="#10b981" title={t("ui.studentReport.eval360")}
                sub={t("ui.studentReport.completedOf", { completed: report.evaluation360.completed, total: report.evaluation360.total })} />
              {report.evaluation360.groups.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", padding: "8px 0" }}>{t("ui.studentReport.no360")}</div>
              ) : (
                <div className="space-y-2">
                  {report.evaluation360.groups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--admin-bg-hover)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{g.evaluatorName || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{g.groupType || "—"}</div>
                      </div>
                      {g.isCompleted
                        ? <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>{t("ui.studentReport.completed")}</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("ui.studentReport.pending")}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Download actions */}
            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--admin-border-default)" }}>
              <button onClick={downloadPdf} style={{
                height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
                border: "1px solid var(--admin-border-default)", cursor: "pointer",
              }}>
                <FileText style={{ width: 13, height: 13 }} /> {t("ui.studentReport.downloadPdf")}
              </button>
              <button onClick={downloadJson} style={{
                height: 34, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
              }}>
                <Download style={{ width: 13, height: 13 }} /> {t("ui.studentReport.downloadJson")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
