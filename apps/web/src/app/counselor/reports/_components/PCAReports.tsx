"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { apiRequest } from "@/lib/api/apiClient";
import { getPcaChartBlob } from "@/services/pcaImageService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, Loader2, Download, Image, Briefcase, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ScoreBar, StudentInfoHeader, type ReportStudent } from "./ReportShared";

export function PCAReports({ student }: { student: ReportStudent }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pcaData, setPcaData] = useState<Record<string, unknown> | null>(null);
  const [careerData, setCareerData] = useState<Record<string, unknown> | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pcaRes, careerRes] = await Promise.allSettled([
          apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: student.id } }),
          apiRequest(`/api/v1/reports/pca/${student.id}`),
        ]);
        if (pcaRes.status === "fulfilled") setPcaData((pcaRes.value?.data || pcaRes.value) as Record<string, unknown>);
        if (careerRes.status === "fulfilled") setCareerData((careerRes.value?.data || careerRes.value) as Record<string, unknown>);
      } catch { /* empty */ }
      setFetched(true);
    })();
  }, [student.id]);

  const hasPCA = pcaData && pcaData.pcaD1 != null;

  const discScores = hasPCA ? [
    { label: "Dominance (D)", value: pcaData.pcaD1 as number, color: "#ef4444" },
    { label: "Influence (I)", value: pcaData.pcaI1 as number, color: "#065292" },
    { label: "Solidity (S)", value: pcaData.pcaS1 as number, color: "#22c55e" },
    { label: "Control (C)", value: pcaData.pcaC1 as number, color: "#eab308" },
  ] : [];

  const careerMatches = (careerData?.careerMatches || careerData?.careers || careerData?.topCareers || []) as Record<string, unknown>[];

  const downloadChart = async () => {
    if (!pcaData?.pcaCod) return;
    setDownloading("chart");
    try {
      const blob = await getPcaChartBlob(String(pcaData.pcaCod));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DISC-Chart-${student.name.replace(/\s+/g, "-")}.png`; a.click();
      URL.revokeObjectURL(url);
      toast.success("DISC chart downloaded");
    } catch { toast.error("Failed to download chart"); }
    setDownloading(null);
  };

  const downloadFullReport = async () => {
    setDownloading("full");
    try {
      const report = {
        student: { name: student.name, email: student.email, id: student.id },
        type: "PCA DISC Profile Report",
        generatedAt: new Date().toISOString(),
        disc: pcaData ? {
          workAdaptation: { D: pcaData.pcaD1, I: pcaData.pcaI1, S: pcaData.pcaS1, C: pcaData.pcaC1 },
          underPressure: { D: pcaData.pcaD2, I: pcaData.pcaI2, S: pcaData.pcaS2, C: pcaData.pcaC2 },
          selfImage: { D: pcaData.pcaD3, I: pcaData.pcaI3, S: pcaData.pcaS3, C: pcaData.pcaC3 },
          completionDate: pcaData.pcaFec,
        } : null,
        career: careerData || null,
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `PCA-Full-Report-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Full PCA report downloaded");
    } catch { toast.error("Failed to generate report"); }
    setDownloading(null);
  };

  return (
    <div>
      <StudentInfoHeader student={student} icon={Target} iconColor="#8b5cf6" subtitle="PCA / DISC Profile Report" />
      <div className="p-5 space-y-5">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !hasPCA ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">No PCA Results</div>
            <div className="text-xs text-muted-foreground mt-1">This student hasn&apos;t completed the PCA assessment yet.</div>
          </div>
        ) : (
          <>
            {/* DISC Scores */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-lg border bg-card p-4 space-y-3"
            >
              <div className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-500" />
                DISC Profile — Work Adaptation
              </div>
              <div className="space-y-2.5">
                {discScores.map((s) => (
                  <ScoreBar key={s.label} label={s.label} value={s.value} color={s.color} />
                ))}
              </div>
            </motion.div>

            {/* Under Pressure + Self Image */}
            {(pcaData.pcaD2 != null || pcaData.pcaD3 != null) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="grid grid-cols-2 gap-3"
              >
                {pcaData.pcaD2 != null && (
                  <div className="rounded-lg border bg-card p-4 space-y-2.5">
                    <div className="text-xs font-semibold text-muted-foreground">Under Pressure</div>
                    {[
                      { label: "D", value: pcaData.pcaD2 as number, color: "#ef4444" },
                      { label: "I", value: pcaData.pcaI2 as number, color: "#eab308" },
                      { label: "S", value: pcaData.pcaS2 as number, color: "#22c55e" },
                      { label: "C", value: pcaData.pcaC2 as number, color: "#065292" },
                    ].map((s) => (
                      <ScoreBar key={s.label} label={s.label} value={s.value} color={s.color} />
                    ))}
                  </div>
                )}
                {pcaData.pcaD3 != null && (
                  <div className="rounded-lg border bg-card p-4 space-y-2.5">
                    <div className="text-xs font-semibold text-muted-foreground">Self Image</div>
                    {[
                      { label: "D", value: pcaData.pcaD3 as number, color: "#ef4444" },
                      { label: "I", value: pcaData.pcaI3 as number, color: "#eab308" },
                      { label: "S", value: pcaData.pcaS3 as number, color: "#22c55e" },
                      { label: "C", value: pcaData.pcaC3 as number, color: "#065292" },
                    ].map((s) => (
                      <ScoreBar key={s.label} label={s.label} value={s.value} color={s.color} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Top Career Matches */}
            {careerMatches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="rounded-lg border bg-card p-4 space-y-2"
              >
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-amber-500" />
                  Top Career Matches
                </div>
                <div className="space-y-1.5">
                  {careerMatches.slice(0, 3).map((career, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                      <span className="text-sm">{String(career.name || career.title || career.career || `Career ${idx + 1}`)}</span>
                      {Boolean(career.match || career.score) && (
                        <Badge variant="outline" className="text-xs">{String(career.match || career.score)}%</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {pcaData.pcaFec && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Completed: {pcaData.pcaFec as string}
              </div>
            )}

            {/* Download Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex items-center gap-2 pt-2 border-t"
            >
              {Boolean(pcaData.pcaCod) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs gap-1.5"
                  disabled={downloading === "chart"}
                  onClick={downloadChart}
                >
                  {downloading === "chart" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3" />}
                  Download Chart
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                disabled={downloading === "full"}
                onClick={downloadFullReport}
              >
                {downloading === "full" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Download Full Report
              </Button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
