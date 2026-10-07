"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader } from "./shared-ui";
import { RecordAnswers } from "./record-answers";
import { useStudentRecord } from "@/hooks/useStudentRecord";
import { getCareerInformeBlob } from "@/services/careerInformeService";
import { getPcaReportBlob, type PcaReportType } from "@/services/pcaImageService";
import {
  getAssessmentAnswersPdfBlob,
  getStudentRecordPdfBlob,
  saveBlob,
  type RecordLang,
  type StudentRecordAssessment,
  type StudentRecordReport,
  type StudentRecordStatus,
} from "@/services/studentRecordService";

/** Display order of the assessments, regardless of the order the API sends them in. */
export const ASSESSMENT_ORDER = ["lia", "personality", "eval360", "vocational360", "mil", "pca", "integrated", "careerfit"];

const STATUS_STYLE: Record<StudentRecordStatus, { bg: string; color: string }> = {
  completed: { bg: "rgba(16,185,129,0.1)", color: "#10b981" },
  in_progress: { bg: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" },
  not_started: { bg: "rgba(107,114,128,0.1)", color: "#6b7280" },
};

const PCA_TYPES: Record<string, PcaReportType> = { pca_pca: "pca", pca_gd: "gd", pca_coaching: "coaching" };

const slugify = (s: string) => (s || "student").trim().replace(/\s+/g, "-");

const buttonStyle = (variant: "primary" | "outline", disabled = false): React.CSSProperties => ({
  height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 6,
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  ...(variant === "primary"
    ? { background: "var(--admin-accent-blue)", color: "#fff", border: "none" }
    : { background: "transparent", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)" }),
});

export function RecordTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { t, i18n } = useTranslation("school_admin");
  const [lang, setLang] = useState<RecordLang>(i18n.language?.startsWith("es") ? "es" : "en");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useStudentRecord(studentId, lang);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "es" ? "es-CO" : "en-US", { month: "short", day: "numeric", year: "numeric" });

  const download = async (id: string, fetchBlob: () => Promise<Blob>, filename: string) => {
    setBusy(id);
    try {
      saveBlob(await fetchBlob(), filename);
      toast.success(t("studentRecord.reports.downloaded"));
    } catch {
      toast.error(t("studentRecord.reports.downloadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const name = slugify(data?.student.name || studentName);

  const downloadReport = (report: StudentRecordReport, reportLang: RecordLang) => {
    if (report.key === "career_informe") {
      return download(`${report.key}-${reportLang}`, () => getCareerInformeBlob(studentId, reportLang), `Informe-Orientacion-${name}-${reportLang}.pdf`);
    }
    const type = PCA_TYPES[report.key];
    if (!type || !report.pcaCod) return;
    return download(report.key, () => getPcaReportBlob(String(report.pcaCod), type, reportLang), `${slugify(report.title)}-${name}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-32" style={{ background: "var(--admin-bg-hover)" }} />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" style={{ background: "var(--admin-bg-hover)" }} />)}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <div role="alert" style={{ textAlign: "center", padding: "32px 16px" }}>
          <AlertCircle style={{ width: 24, height: 24, color: "#ef4444", margin: "0 auto 8px" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-secondary)", marginBottom: 12 }}>{t("studentRecord.loadError")}</p>
          <button type="button" onClick={() => refetch()} style={buttonStyle("outline")}>{t("studentRecord.retry")}</button>
        </div>
      </Card>
    );
  }

  const order = (k: string) => {
    const i = ASSESSMENT_ORDER.indexOf(k);
    return i === -1 ? ASSESSMENT_ORDER.length : i;
  };
  const assessments = [...data.assessments].sort((a, b) => order(a.key) - order(b.key));

  const langButton = (l: RecordLang) => (
    <button
      key={l}
      type="button"
      aria-pressed={lang === l}
      aria-label={t(l === "es" ? "studentRecord.reports.langEsFull" : "studentRecord.reports.langEnFull")}
      onClick={() => setLang(l)}
      style={{
        height: 24, padding: "0 8px", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
        borderRadius: 4,
        background: lang === l ? "var(--admin-accent-blue)" : "transparent",
        color: lang === l ? "#fff" : "var(--admin-font-secondary)",
      }}
    >
      {t(l === "es" ? "studentRecord.reports.langEs" : "studentRecord.reports.langEn")}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Reports */}
      <Card>
        <CardHeader icon={FileText} color="#8b5cf6" title={t("studentRecord.reports.title")} badge={
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("studentRecord.reports.language")}</span>
            <div role="group" aria-label={t("studentRecord.reports.language")} style={{ display: "inline-flex", padding: 2, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
              {langButton("es")}
              {langButton("en")}
            </div>
          </div>
        } />
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", margin: 0 }}>{t("studentRecord.reports.subtitle")}</p>
            <button
              type="button"
              disabled={busy === "record"}
              onClick={() => download("record", () => getStudentRecordPdfBlob(studentId, lang), `Expediente-${name}-${lang}.pdf`)}
              style={{ ...buttonStyle("primary", busy === "record"), height: 36, padding: "0 16px" }}
            >
              {busy === "record" ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Download style={{ width: 14, height: 14 }} />}
              {t("studentRecord.reports.downloadComplete")}
            </button>
          </div>
          {data.reports.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("studentRecord.reports.none")}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {data.reports.map((report) => {
                const reason = report.available ? undefined : (report.reason || t("studentRecord.reports.unavailable"));
                const variants: RecordLang[] = report.key === "career_informe" ? ["es", "en"] : [lang];
                return (
                  <div key={report.key} title={reason} style={{
                    border: "1px solid var(--admin-border-default)", borderRadius: 6, padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{report.title}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {variants.map((v) => {
                        const id = report.key === "career_informe" ? `${report.key}-${v}` : report.key;
                        const disabled = !report.available || busy === id;
                        const suffix = report.key === "career_informe" ? ` ${t(v === "es" ? "studentRecord.reports.langEs" : "studentRecord.reports.langEn")}` : "";
                        return (
                          <button
                            key={v}
                            type="button"
                            disabled={disabled}
                            title={reason}
                            aria-label={`${report.title}${suffix}`}
                            onClick={() => downloadReport(report, v)}
                            style={buttonStyle("outline", disabled)}
                          >
                            {busy === id ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Download style={{ width: 12, height: 12 }} />}
                            {report.key === "career_informe" ? t(v === "es" ? "studentRecord.reports.langEs" : "studentRecord.reports.langEn") : t("studentRecord.assessments.downloadPdf")}
                          </button>
                        );
                      })}
                    </div>
                    {reason && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{reason}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Assessments */}
      <Card>
        <CardHeader icon={ClipboardList} color="#14b8a6" title={t("studentRecord.assessments.title")} />
        {assessments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <ClipboardList style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4, color: "var(--admin-font-tertiary)" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("studentRecord.empty.title")}</div>
            <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>{t("studentRecord.empty.description")}</p>
          </div>
        ) : (
          <div>
            {assessments.map((a) => (
              <AssessmentRow
                key={a.key}
                a={a}
                open={openKey === a.key}
                onToggle={() => setOpenKey(openKey === a.key ? null : a.key)}
                busy={busy === `answers-${a.key}`}
                onDownload={() => download(`answers-${a.key}`, () => getAssessmentAnswersPdfBlob(studentId, a.key, lang), `${slugify(a.title)}-${name}-${lang}.pdf`)}
                fmtDate={fmtDate}
                studentId={studentId}
                lang={lang}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AssessmentRow({ a, open, onToggle, busy, onDownload, fmtDate, studentId, lang }: {
  a: StudentRecordAssessment; open: boolean; onToggle: () => void; busy: boolean; onDownload: () => void;
  fmtDate: (d: string) => string; studentId: string; lang: RecordLang;
}) {
  const { t } = useTranslation("school_admin");
  const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.not_started;
  const panelId = `record-answers-${a.key}`;
  return (
    <div data-testid={`record-assessment-${a.key}`} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
      <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0 }}>{a.title}</h3>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
              letterSpacing: "0.04em", background: st.bg, color: st.color,
            }}>
              {t(`studentRecord.status.${a.status}`)}
            </span>
            {a.completedAt && (
              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                {t("studentRecord.assessments.completedOn", { date: fmtDate(a.completedAt) })}
              </span>
            )}
          </div>
          {a.summary.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {a.summary.map((s, i) => (
                <span key={`${s.label}-${i}`} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 4,
                  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                  color: "var(--admin-font-secondary)",
                }}>
                  {s.label}: <strong style={{ color: "var(--admin-font-primary)" }}>{s.value}</strong>
                </span>
              ))}
            </div>
          )}
          {!a.answers.available && (
            <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 6 }}>
              {a.answers.reason || t("studentRecord.assessments.answersUnavailable")}
            </p>
          )}
        </div>
        {a.answers.available && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} style={buttonStyle("outline")}>
              {open ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
              {open ? t("studentRecord.assessments.hideAnswers") : t("studentRecord.assessments.viewAnswers", { count: a.answers.count })}
            </button>
            <button type="button" disabled={busy} onClick={onDownload} style={buttonStyle("outline", busy)}>
              {busy ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Download style={{ width: 14, height: 14 }} />}
              {t("studentRecord.assessments.downloadPdf")}
            </button>
          </div>
        )}
      </div>
      {open && (
        <div id={panelId} style={{ padding: "0 16px 16px" }}>
          <RecordAnswers studentId={studentId} assessmentKey={a.key} lang={lang} />
        </div>
      )}
    </div>
  );
}
