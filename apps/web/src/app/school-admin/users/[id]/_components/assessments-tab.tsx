"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Target,
  Sparkles,
  Download,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardHeader, PCAChartImage } from "./shared-ui";
import { getPcaReportBlob, type PcaReportType } from "@/services/pcaImageService";
import { getCareerInformeBlob } from "@/services/careerInformeService";
import type { PCADISCResult } from "@/hooks/useStudentDetailData";
import type { MILResultsData } from "@/services/milService";
import type { PCAAssessmentResponse } from "@/services/pcaService";
import type { UseMutationResult } from "@tanstack/react-query";
import type { StudentReport } from "@/types/student";

interface AssessmentsTabProps {
  milData?: MILResultsData | null;
  pcaDISC?: PCADISCResult | null;
  pcaDISCLoading: boolean;
  registerPCA: UseMutationResult<PCAAssessmentResponse, Error, { PerNom: string; PerApe: string; PerNumIde: string; PerGen: "F" | "M"; PerMail: string }>;
  student: { id: string; name: string; email: string };
  studentReport?: StudentReport | null;
}

export function AssessmentsTab({
  milData,
  pcaDISC,
  pcaDISCLoading,
  registerPCA,
  student,
  studentReport,
}: AssessmentsTabProps) {
  const { t, i18n } = useTranslation();
  const [reportLoading, setReportLoading] = useState<string | null>(null);

  // Official TIMS PCA report PDFs (Informe PCA / Guía de Desarrollo / Coaching).
  // Backend /report-pdf enforces IDOR + the authoritative completion gate; school_admin
  // is authorized for same-school students, so we surface the buttons when DISC data exists.
  const downloadTimsReport = async (type: PcaReportType, slug: string) => {
    const pcaCod = pcaDISC?.pcaCod;
    if (!pcaCod) return;
    setReportLoading(type);
    try {
      const lang = i18n.language?.startsWith("es") ? "es" : "en";
      const blob = await getPcaReportBlob(String(pcaCod), type, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${slug}-${(student.name || "student").replace(/\s+/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(t("pca.reports.downloaded"));
    } catch { toast.error(t("pca.reports.downloadFailed")); }
    setReportLoading(null);
  };

  const downloadInforme = async () => {
    setReportLoading("informe");
    try {
      const lang = i18n.language?.startsWith("es") ? "es" : "en";
      const blob = await getCareerInformeBlob(student.id, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `Informe-Orientacion-${(student.name || "student").replace(/\s+/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(t("informe.downloaded"));
    } catch { toast.error(t("informe.downloadFailed")); }
    setReportLoading(null);
  };

  return (
    <div className="space-y-4">
      {/* MIL / LIA Results */}
      <Card>
        <CardHeader icon={Brain} color="#2E9098" title="MIL / LIA Assessment" badge={
          milData ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(99,102,241,0.1)", color: "#2E9098", marginLeft: 4 }}>
              {milData.completedExams}/{milData.totalExams} complete
            </span>
          ) : null
        } />
        <div style={{ padding: 16 }}>
          {milData && milData.completedExams > 0 ? (
            <div className="space-y-4">
              {/* Overall Score */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ padding: "12px 16px", borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", textAlign: "center", minWidth: 100 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#2E9098", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Overall Score</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)" }}>{milData.overallScore?.toFixed(0) ?? "\u2014"}%</div>
                </div>
                {milData.overallPercentile != null && (
                  <div style={{ padding: "12px 16px", borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", textAlign: "center", minWidth: 100 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Percentile</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)" }}>{milData.overallPercentile}th</div>
                  </div>
                )}
              </div>

              {/* Cognitive Profile */}
              {milData.cognitiveProfile && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>MIL Profile</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Object.entries(milData.cognitiveProfile).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)", textTransform: "capitalize" }}>
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: "var(--admin-bg-hover)", marginTop: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(Number(value) || 0, 100)}%`, borderRadius: 2, background: "#102B47" }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary)", minWidth: 35, textAlign: "right" }}>{Number(value)?.toFixed(0) ?? "\u2014"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual Exam Results */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Exam Results</div>
                <div className="space-y-2">
                  {milData.examResults?.map((exam) => (
                    <div key={exam.examId || exam.examName} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                    }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{exam.examName}</span>
                        {exam.completedAt && (
                          <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 8 }}>
                            {format(new Date(exam.completedAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {exam.scorePercentage != null && (
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--admin-font-primary)" }}>{exam.scorePercentage.toFixed(0)}%</span>
                        )}
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                          background: exam.status === "completed" ? "rgba(16,185,129,0.1)" : exam.status === "in_progress" ? "rgba(59,130,246,0.1)" : "rgba(107,114,128,0.1)",
                          color: exam.status === "completed" ? "#10b981" : exam.status === "in_progress" ? "#2E9098" : "#6b7280",
                        }}>
                          {exam.status?.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
              <Brain style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4 }} />
              No MIL/LIA assessment results yet.
            </div>
          )}
        </div>
      </Card>

      {/* PCA DISC Profile (TIMS) */}
      <Card>
        <CardHeader icon={Target} color="#8b5cf6" title="PCA Profile" badge={
          pcaDISC?.pcaFec ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(139,92,246,0.1)", color: "#8b5cf6", marginLeft: 4 }}>
              Completed {pcaDISC.pcaFec}
            </span>
          ) : null
        } />
        <div style={{ padding: 16 }}>
          {pcaDISCLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : pcaDISC && pcaDISC.pcaD1 != null ? (
            <div className="space-y-4">
              {[
                { title: "Work Adaptation", d: pcaDISC.pcaD1, i: pcaDISC.pcaI1, s: pcaDISC.pcaS1, c: pcaDISC.pcaC1 },
                { title: "Under Pressure", d: pcaDISC.pcaD2, i: pcaDISC.pcaI2, s: pcaDISC.pcaS2, c: pcaDISC.pcaC2 },
                { title: "Self-Image", d: pcaDISC.pcaD3, i: pcaDISC.pcaI3, s: pcaDISC.pcaS3, c: pcaDISC.pcaC3 },
              ].map((graph) => (
                <div key={graph.title}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 6 }}>{graph.title}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    {[
                      { label: "D", value: graph.d, color: "#ef4444" },
                      { label: "I", value: graph.i, color: "#f59e0b" },
                      { label: "S", value: graph.s, color: "#10b981" },
                      { label: "C", value: graph.c, color: "#2E9098" },
                    ].map((dim) => (
                      <div key={dim.label} style={{ textAlign: "center" }}>
                        <div style={{ height: 48, position: "relative", background: "var(--admin-bg-hover)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            position: "absolute", bottom: 0, left: 0, right: 0,
                            height: `${Math.min(100, (dim.value ?? 0))}%`,
                            background: dim.color, opacity: 0.7, borderRadius: "0 0 4px 4px",
                          }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: dim.color, marginTop: 2 }}>{dim.label}</div>
                        <div style={{ fontSize: 9, color: "var(--admin-font-tertiary)" }}>{dim.value ?? "\u2014"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <PCAChartImage pcaCod={pcaDISC.pcaCod} />

              {/* Official TIMS PCA report PDFs */}
              {pcaDISC.pcaCod && (
                <div style={{ borderTop: "1px solid var(--admin-border-default)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>
                    {t("pca.reports.title")}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {([
                      { type: "pca" as const, slug: "Informe-PCA", label: t("pca.reports.informePca") },
                      { type: "gd" as const, slug: "Guia-Desarrollo", label: t("pca.reports.guiaDesarrollo") },
                      { type: "coaching" as const, slug: "PCA-Coaching", label: t("pca.reports.coaching") },
                    ]).map((r) => (
                      <button
                        key={r.type}
                        onClick={() => downloadTimsReport(r.type, r.slug)}
                        disabled={reportLoading === r.type}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 600,
                          background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
                          border: "1px solid var(--admin-border-default)",
                          cursor: reportLoading === r.type ? "wait" : "pointer",
                          opacity: reportLoading === r.type ? 0.7 : 1,
                        }}
                      >
                        {reportLoading === r.type
                          ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                          : <Download style={{ width: 13, height: 13 }} />}
                        {r.label}
                      </button>
                    ))}
                    <button
                      onClick={downloadInforme}
                      disabled={reportLoading !== null}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        height: 32, borderRadius: 6, padding: "0 12px", fontSize: 12, fontWeight: 600,
                        background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)",
                        border: "1px solid var(--admin-border-default)",
                        cursor: reportLoading !== null ? "wait" : "pointer",
                        opacity: reportLoading !== null ? 0.7 : 1,
                      }}
                    >
                      {reportLoading === "informe"
                        ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                        : <Download style={{ width: 13, height: 13 }} />}
                      {t("informe.download")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Target style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4, color: "var(--admin-font-tertiary)" }} />
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 12 }}>
                No PCA results available.
              </div>
              <button
                onClick={() => {
                  const nameParts = (student.name || "").split(" ");
                  registerPCA.mutate({
                    PerNom: nameParts[0] || "",
                    PerApe: nameParts.slice(1).join(" ") || nameParts[0] || "",
                    PerNumIde: student.id,
                    PerGen: "M",
                    PerMail: student.email || "",
                  }, {
                    onSuccess: (res) => {
                      if (res.success && res.assessmentUrl) {
                        toast.success("PCA evaluation registered. Assessment link copied.");
                        navigator.clipboard.writeText(res.assessmentUrl);
                      } else {
                        toast.error(res.message || "Failed to register PCA evaluation");
                      }
                    },
                    onError: () => toast.error("Failed to register PCA evaluation"),
                  });
                }}
                disabled={registerPCA.isPending}
                style={{
                  padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer",
                  opacity: registerPCA.isPending ? 0.6 : 1,
                }}
              >
                {registerPCA.isPending ? "Registering..." : "Register for PCA Assessment"}
              </button>
              {registerPCA.data?.assessmentUrl && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>Assessment Link (share with student):</div>
                  <a href={registerPCA.data.assessmentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#8b5cf6", wordBreak: "break-all" }}>
                    {registerPCA.data.assessmentUrl}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Personality — status only (full narrative lives on the student's own results page) */}
      <Card>
        <CardHeader icon={Sparkles} color="#6366f1" title="Personality Assessment" badge={
          studentReport?.completion.personality ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(99,102,241,0.1)", color: "#6366f1", marginLeft: 4 }}>
              Complete
            </span>
          ) : null
        } />
        <div style={{ padding: 16 }}>
          {studentReport?.completion.personality ? (
            <div style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>
              This student has completed their Personality Assessment.
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
              <Sparkles style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4 }} />
              No Personality Assessment results yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
