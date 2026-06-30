"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/api/apiClient";
import { openPrintableReport, escapeHtml } from "@/lib/printableReport";
import { getPcaChartBlob, getPcaReportBlob, type PcaReportType } from "@/services/pcaImageService";
import { getCareerInformeBlob } from "@/services/careerInformeService";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Download, Target, Brain, Users, Loader2, Image, BarChart3,
  Briefcase, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

type TabKey = "pca" | "mil" | "360";

interface StudentRecord {
  id: string;
  name: string;
  email: string;
}

// ── Shared Report Row Component ──
interface ReportRowProps {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  desc: string;
  format: string;
  loading: boolean;
  onDownload: () => void;
  onPrint?: () => void;
}

function ReportRow({ icon: Icon, label, desc, format, loading, onDownload, onPrint }: ReportRowProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon style={{ width: 18, height: 18, color: "var(--admin-font-tertiary)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{desc}</div>
      </div>
      <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)" }}>{format}</Badge>
      <div style={{ display: "flex", gap: 4 }}>
        {onPrint && (
          <button onClick={onPrint} style={{
            height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
          }}>
            <FileText style={{ width: 12, height: 12 }} /> Print
          </button>
        )}
        <button onClick={onDownload} disabled={loading} style={{
          height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--admin-accent-blue, #065292)", color: "#fff",
          border: "none", cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Download style={{ width: 13, height: 13 }} />}
          Download
        </button>
      </div>
    </div>
  );
}

// ── Student Report Panel (router) ──
export function StudentReportPanel({ student, type }: { student: StudentRecord; type: TabKey }) {
  if (type === "pca") return <PCAReports student={student} />;
  if (type === "mil") return <MILReports student={student} />;
  return <EvalReports student={student} />;
}

// ── PCA Reports ──
function PCAReports({ student }: { student: StudentRecord }) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);
  const [pcaData, setPcaData] = useState<Record<string, unknown> | null>(null);
  const [competences, setCompetences] = useState<Record<string, unknown> | null>(null);
  // Authoritative completion gate (B7): downloads enable only when the student has a
  // completed PCA per the backend signal, not merely when DISC result data is present.
  const [pcaCompleted, setPcaCompleted] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/school-admin/results/${student.id}/pca-status`);
        const completed = (res?.data?.data ?? res?.data)?.completed === true;
        if (active) setPcaCompleted(completed);
      } catch { if (active) setPcaCompleted(false); }
      try {
        const res = await apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: student.id } });
        if (active) setPcaData(res?.data || res);
      } catch { /* no result */ }
      try {
        const res = await apiRequest("/api/pcaapi/get-competences", { method: "POST", data: { UserId: student.id } });
        if (active) setCompetences(res?.data || res);
      } catch { /* no result */ }
      if (active) setFetched(true);
    })();
    return () => { active = false; };
  }, [student.id]);

  const d = pcaData as Record<string, unknown> | null;

  const downloadChart = async () => {
    if (!d?.pcaCod) return;
    setLoading("chart");
    try {
      const blob = await getPcaChartBlob(String(d.pcaCod));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DISC-Chart-${student.name.replace(/\s+/g, "-")}.png`; a.click();
      URL.revokeObjectURL(url);
      toast.success("DISC chart downloaded");
    } catch { toast.error("Failed to download chart"); }
    setLoading(null);
  };

  // Official TIMS PCA report PDFs (Informe PCA / Guía de Desarrollo / Coaching).
  const downloadTimsReport = async (type: PcaReportType, slug: string) => {
    if (!d?.pcaCod) return;
    setLoading(type);
    try {
      const lang = i18n.language?.startsWith("es") ? "es" : "en";
      const blob = await getPcaReportBlob(String(d.pcaCod), type, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${slug}-${student.name.replace(/\s+/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(t("pca.reports.downloaded"));
    } catch { toast.error(t("pca.reports.downloadFailed")); }
    setLoading(null);
  };

  const downloadInforme = async () => {
    setLoading("informe");
    try {
      const lang = i18n.language?.startsWith("es") ? "es" : "en";
      const blob = await getCareerInformeBlob(student.id, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `Informe-Orientacion-${student.name.replace(/\s+/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(t("informe.downloaded"));
    } catch { toast.error(t("informe.downloadFailed")); }
    setLoading(null);
  };

  const downloadFullReport = async () => {
    setLoading("full");
    try {
      const report = {
        student: { name: student.name, email: student.email, id: student.id },
        type: "PCA DISC Profile Report",
        generatedAt: new Date().toISOString(),
        disc: d ? {
          workAdaptation: { D: d.pcaD1, I: d.pcaI1, S: d.pcaS1, C: d.pcaC1 },
          underPressure: { D: d.pcaD2, I: d.pcaI2, S: d.pcaS2, C: d.pcaC2 },
          selfImage: { D: d.pcaD3, I: d.pcaI3, S: d.pcaS3, C: d.pcaC3 },
          completionDate: d.pcaFec,
        } : null,
        competences: (competences as Record<string, unknown>)?.pcaCmps || null,
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `PCA-Full-Report-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Full PCA report downloaded");
    } catch { toast.error("Failed to generate report"); }
    setLoading(null);
  };

  return (
    <div>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Target style={{ width: 20, height: 20, color: "#8b5cf6" }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{student.name}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>PCA / DISC Profile Reports</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "20px 24px" }} className="space-y-3">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" style={{ background: "var(--admin-bg-hover)" }} />
            <Skeleton className="h-14 w-full" style={{ background: "var(--admin-bg-hover)" }} />
          </div>
        ) : !pcaCompleted ? (
          <div style={{ padding: 24, textAlign: "center", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <XCircle style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>PCA Not Completed</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Downloads unlock once this student completes the PCA assessment.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Image} label="DISC Chart Image" desc="Visual chart of D/I/S/C profile across 3 graphs" format="PNG" loading={loading === "chart"} onDownload={downloadChart} />
            <ReportRow icon={FileText} label={t("pca.reports.informePca")} desc={t("pca.reports.informePcaDesc")} format="PDF" loading={loading === "pca"} onDownload={() => downloadTimsReport("pca", "Informe-PCA")} />
            <ReportRow icon={FileText} label={t("pca.reports.guiaDesarrollo")} desc={t("pca.reports.guiaDesarrolloDesc")} format="PDF" loading={loading === "gd"} onDownload={() => downloadTimsReport("gd", "Guia-Desarrollo")} />
            <ReportRow icon={FileText} label={t("pca.reports.coaching")} desc={t("pca.reports.coachingDesc")} format="PDF" loading={loading === "coaching"} onDownload={() => downloadTimsReport("coaching", "PCA-Coaching")} />
            <ReportRow icon={FileText} label={t("informe.download")} desc={t("informe.desc")} format="PDF" loading={loading === "informe"} onDownload={downloadInforme} />
            <ReportRow icon={FileText} label="Full PCA Report" desc="DISC scores, competences, and completion data" format="JSON" loading={loading === "full"} onDownload={downloadFullReport}
              onPrint={() => {
                if (!d) return;
                const cmps = ((competences as Record<string, unknown>)?.pcaCmps || []) as Array<Record<string, unknown>>;
                openPrintableReport("PCA DISC Profile Report", student.name, [
                  { heading: "DISC Scores", content: `<table><tr><th></th><th>D</th><th>I</th><th>S</th><th>C</th></tr>
                    <tr><td>Work Adaptation</td><td>${escapeHtml(d.pcaD1)}</td><td>${escapeHtml(d.pcaI1)}</td><td>${escapeHtml(d.pcaS1)}</td><td>${escapeHtml(d.pcaC1)}</td></tr>
                    <tr><td>Under Pressure</td><td>${escapeHtml(d.pcaD2)}</td><td>${escapeHtml(d.pcaI2)}</td><td>${escapeHtml(d.pcaS2)}</td><td>${escapeHtml(d.pcaC2)}</td></tr>
                    <tr><td>Self-Image</td><td>${escapeHtml(d.pcaD3)}</td><td>${escapeHtml(d.pcaI3)}</td><td>${escapeHtml(d.pcaS3)}</td><td>${escapeHtml(d.pcaC3)}</td></tr></table>
                    <p style="font-size:12px;color:#888;">Completed: ${escapeHtml(d.pcaFec || "\u2014")}</p>` },
                  ...(cmps.length ? [{ heading: `Competences (${cmps.length})`, content: `<table><tr><th>Competency</th><th>Level</th></tr>${cmps.map((c) =>
                    `<tr><td>${escapeHtml(c.cmpNom || c.CmpNom)}</td><td><span class="badge" style="background:${(Number(c.level || c.Level)) >= 3 ? "#dcfce7;color:#16a34a" : (Number(c.level || c.Level)) >= 2 ? "#fef9c3;color:#ca8a04" : "#fee2e2;color:#dc2626"}">${escapeHtml(c.level || c.Level)}/3</span></td></tr>`).join("")}</table>` }] : []),
                ]);
              }}
            />
            {d?.pcaFec && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                <CheckCircle2 style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4, color: "#10b981" }} />
                Completed: {String(d.pcaFec)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MIL Reports ──
function MILReports({ student }: { student: StudentRecord }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [milData, setMilData] = useState<Record<string, unknown> | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/lia/${student.id}`);
        setMilData(res?.data || res);
      } catch { /* no result */ }
      setFetched(true);
    })();
  }, [student.id]);

  const hasMIL = milData?.cognitiveProfile && Object.keys(milData.cognitiveProfile as object).length > 0;

  const downloadCognitive = async () => {
    setLoading("cognitive");
    try {
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "MIL / LIA Cognitive Profile",
        generatedAt: new Date().toISOString(),
        ...milData,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `MIL-Cognitive-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Cognitive profile downloaded");
    } catch { toast.error("Failed"); }
    setLoading(null);
  };

  const downloadExamHistory = async () => {
    setLoading("history");
    try {
      const res = await apiRequest(`/api/v1/mil/results/${student.id}`);
      const data = res?.data || res;
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "MIL Exam Results History",
        generatedAt: new Date().toISOString(),
        ...data,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `MIL-Exams-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Exam history downloaded");
    } catch { toast.error("Failed"); }
    setLoading(null);
  };

  return (
    <div>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Brain style={{ width: 20, height: 20, color: "#065292" }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{student.name}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>MIL / LIA Cognitive Assessment Reports</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "20px 24px" }} className="space-y-3">
        {!fetched ? (
          <Skeleton className="h-14 w-full" style={{ background: "var(--admin-bg-hover)" }} />
        ) : !hasMIL ? (
          <div style={{ padding: 24, textAlign: "center", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <XCircle style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No MIL/LIA Results</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>This student hasn&apos;t completed the cognitive assessments yet.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Brain} label="Cognitive Profile" desc="5 domains: Reasoning, Detection, Numeric, Memory, Orientation" format="JSON" loading={loading === "cognitive"} onDownload={downloadCognitive}
              onPrint={() => {
                const cp = (milData?.cognitiveProfile || {}) as Record<string, unknown>;
                const labels: Record<string, string> = { PatternRecognition: "Pattern Recognition", VerbalReasoning: "Verbal Reasoning", WorkingMemory: "Working Memory", NumericVelocity: "Numeric Velocity", VisualRotation: "Visual Rotation" };
                openPrintableReport("MIL / LIA Cognitive Profile", student.name, [
                  { heading: "Overall Score", content: `<p style="font-size:28px;font-weight:700;">${escapeHtml(milData?.overallScore || 0)}%</p><p style="color:#888;">Completed ${escapeHtml(milData?.completedExams || 0)} of ${escapeHtml(milData?.totalExams || 5)} exams</p>` },
                  { heading: "Cognitive Domains", content: `<table><tr><th>Domain</th><th>Score</th><th>Visual</th></tr>${Object.entries(cp).map(([k, v]) => {
                    const pct = Number(v) || 0;
                    const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#ca8a04" : "#dc2626";
                    return `<tr><td>${escapeHtml(labels[k] || k)}</td><td style="font-weight:600;">${pct}%</td><td><div class="bar-container"><div class="bar" style="width:${pct}%;background:${color};"></div></div></td></tr>`;
                  }).join("")}</table>` },
                  ...((milData?.strengths as string[])?.length ? [{ heading: "Strengths", content: `<ul>${(milData.strengths as string[]).map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` }] : []),
                  ...((milData?.areasForGrowth as string[])?.length ? [{ heading: "Areas for Growth", content: `<ul>${(milData.areasForGrowth as string[]).map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` }] : []),
                ]);
              }}
            />
            <ReportRow icon={BarChart3} label="Exam Results History" desc="All exam attempts with scores, timing, and per-question data" format="JSON" loading={loading === "history"} onDownload={downloadExamHistory} />
            {milData?.overallScore != null && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                Overall Score: <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{String(milData.overallScore)}%</span>
                {milData.completedExams != null && <span> · {String(milData.completedExams)}/{String(milData.totalExams)} exams completed</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 360 Reports ──
function EvalReports({ student }: { student: StudentRecord }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/user-report/${student.id}`);
        setReportData(res?.data || res);
      } catch { /* no result */ }
      setFetched(true);
    })();
  }, [student.id]);

  const downloadComprehensive = async () => {
    setLoading("comprehensive");
    try {
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "Comprehensive Student Report",
        generatedAt: new Date().toISOString(),
        ...reportData,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `360-Report-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("360 report downloaded");
    } catch { toast.error("Failed"); }
    setLoading(null);
  };

  const downloadPCAReport = async () => {
    setLoading("pca");
    try {
      const res = await apiRequest(`/api/v1/reports/pca/${student.id}`);
      const data = res?.data || res;
      const blob = new Blob([JSON.stringify({
        student: { name: student.name, email: student.email },
        type: "PCA Career Profile Report",
        generatedAt: new Date().toISOString(),
        ...data,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `Career-Profile-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Career profile downloaded");
    } catch { toast.error("Failed"); }
    setLoading(null);
  };

  const assessments = reportData?.assessments as Record<string, unknown> | undefined;

  return (
    <div>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users style={{ width: 20, height: 20, color: "#10b981" }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{student.name}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>360 Evaluation & Comprehensive Reports</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "20px 24px" }} className="space-y-3">
        {!fetched ? (
          <Skeleton className="h-14 w-full" style={{ background: "var(--admin-bg-hover)" }} />
        ) : (
          <>
            <ReportRow icon={FileText} label="Comprehensive Student Report" desc="Academic, assessments, courses, and career data combined" format="JSON" loading={loading === "comprehensive"} onDownload={downloadComprehensive}
              onPrint={() => {
                const rd = reportData || {};
                const s = (rd.student || {}) as Record<string, unknown>;
                const ac = (rd.academic || {}) as Record<string, unknown>;
                const ass = (rd.assessments || {}) as Record<string, unknown>;
                const courses = rd.courses as unknown[] | undefined;
                openPrintableReport("Comprehensive Student Report", student.name, [
                  { heading: "Student Information", content: `<table><tr><td><strong>Name:</strong> ${escapeHtml(s.name || student.name)}</td><td><strong>Email:</strong> ${escapeHtml(s.email || student.email)}</td></tr><tr><td><strong>Grade:</strong> ${escapeHtml(s.gradeLevel || "\u2014")}</td><td><strong>Status:</strong> ${escapeHtml(s.status || "active")}</td></tr></table>` },
                  { heading: "Academic Summary", content: `<table><tr><td><strong>GPA:</strong> ${escapeHtml(ac.gpa ?? "\u2014")}</td><td><strong>Credits Earned:</strong> ${escapeHtml(ac.creditsEarned ?? "\u2014")}</td><td><strong>Courses:</strong> ${courses?.length ?? 0}</td></tr></table>` },
                  { heading: "Assessment Status", content: `<table><tr><th>Assessment</th><th>Status</th></tr><tr><td>PCA</td><td>${escapeHtml(ass.pcaCount || 0)} evaluations</td></tr><tr><td>MIL Average</td><td>${escapeHtml(ass.milAverage || "\u2014")}</td></tr><tr><td>360</td><td>${escapeHtml(ass.evalStatus || "\u2014")}</td></tr></table>` },
                ]);
              }}
            />
            <ReportRow icon={Briefcase} label="Career Profile Report" desc="PCA evaluations, career matches, and AI insights" format="JSON" loading={loading === "pca"} onDownload={downloadPCAReport} />
            {assessments && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                PCA: {String(assessments.pcaCount || 0)} evaluations ·
                MIL avg: {String(assessments.milAverage || "\u2014")} ·
                360: {String(assessments.evalStatus || "\u2014")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
