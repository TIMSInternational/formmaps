"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { apiRequest } from "@/lib/api/apiClient";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, Search, Download, Target, Brain, Users,
  Loader2, Image, BarChart3, Briefcase, CheckCircle2, XCircle,
  Eye, GraduationCap, BookOpen,
} from "lucide-react";
import { toast } from "sonner";

type TabKey = "pca" | "mil" | "academic";

export default function CounselorReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("pca");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
        const items = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        setStudents(Array.isArray(items) ? items : []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "pca", label: "PCA / DISC Profile", icon: Target },
    { key: "mil", label: "MIL / LIA Cognitive", icon: Brain },
    { key: "academic", label: "Full Academic Summary", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dash-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              View and download assessment reports for your assigned students
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          className="pl-9 h-9 rounded-lg text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Students Table */}
      <div className="dash-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Student</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Grade</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(5).fill(0).map((_, j) => (
                    <TableCell key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                  <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  No students found
                </TableCell>
              </TableRow>
            ) : filtered.map((student) => (
              <TableRow
                key={student.id}
                className="hover:bg-muted/50 transition-colors"
              >
                <TableCell className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white text-xs font-semibold">
                      {student.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4 text-sm text-muted-foreground">{student.email}</TableCell>
                <TableCell className="py-3 px-4 text-sm text-muted-foreground">{student.gradeLevel || "\u2014"}</TableCell>
                <TableCell className="py-3 px-4">
                  <Badge variant="secondary" className={`text-xs ${student.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {student.status || "active"}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 px-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs gap-1.5"
                    onClick={() => setSelectedStudent(student)}
                  >
                    <Eye className="h-3 w-3" />
                    View Report
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Student Report Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">{selectedStudent?.name} Reports</DialogTitle>
          {selectedStudent && <StudentReportPanel student={selectedStudent} type={activeTab} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentReportPanel({ student, type }: { student: any; type: TabKey }) {
  if (type === "pca") return <PCAReports student={student} />;
  if (type === "mil") return <MILReports student={student} />;
  return <AcademicReports student={student} />;
}

/* ------------------------------------------------------------------ */
/*  Score Bar                                                          */
/* ------------------------------------------------------------------ */
function ScoreBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{value}{max === 100 ? "%" : `/${max}`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover, hsl(var(--muted)))", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: color }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Student Info Header (shared)                                       */
/* ------------------------------------------------------------------ */
function StudentInfoHeader({ student, icon: Icon, iconColor, subtitle }: {
  student: any; icon: React.ElementType; iconColor: string; subtitle: string;
}) {
  return (
    <div className="p-5 border-b bg-muted/30">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" style={{ color: iconColor }} />
        <div className="flex-1">
          <div className="text-base font-bold">{student.name}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span>{student.email}</span>
        {student.gradeLevel && <span>Grade {student.gradeLevel}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PCA / DISC Profile Reports                                         */
/* ------------------------------------------------------------------ */
function PCAReports({ student }: { student: any }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pcaData, setPcaData] = useState<any>(null);
  const [careerData, setCareerData] = useState<any>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pcaRes, careerRes] = await Promise.allSettled([
          apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: student.id } }),
          apiRequest(`/api/v1/reports/pca/${student.id}`),
        ]);
        if (pcaRes.status === "fulfilled") setPcaData(pcaRes.value?.data || pcaRes.value);
        if (careerRes.status === "fulfilled") setCareerData(careerRes.value?.data || careerRes.value);
      } catch {}
      setFetched(true);
    })();
  }, [student.id]);

  const hasPCA = pcaData && pcaData.pcaD1 != null;

  const discScores = hasPCA ? [
    { label: "Dominance (D)", value: pcaData.pcaD1, color: "#ef4444" },
    { label: "Influence (I)", value: pcaData.pcaI1, color: "#eab308" },
    { label: "Steadiness (S)", value: pcaData.pcaS1, color: "#22c55e" },
    { label: "Conscientiousness (C)", value: pcaData.pcaC1, color: "#065292" },
  ] : [];

  const careerMatches = careerData?.careerMatches || careerData?.careers || careerData?.topCareers || [];

  const downloadChart = async () => {
    if (!pcaData?.pcaCod) return;
    setDownloading("chart");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pcaapi/img-report?pcaCod=${pcaData.pcaCod}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `DISC-Chart-${student.name.replace(/\s+/g, "-")}.png`; a.click();
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

            {/* Under Pressure + Self Image (compact) */}
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
                      { label: "D", value: pcaData.pcaD2, color: "#ef4444" },
                      { label: "I", value: pcaData.pcaI2, color: "#eab308" },
                      { label: "S", value: pcaData.pcaS2, color: "#22c55e" },
                      { label: "C", value: pcaData.pcaC2, color: "#065292" },
                    ].map((s) => (
                      <ScoreBar key={s.label} label={s.label} value={s.value} color={s.color} />
                    ))}
                  </div>
                )}
                {pcaData.pcaD3 != null && (
                  <div className="rounded-lg border bg-card p-4 space-y-2.5">
                    <div className="text-xs font-semibold text-muted-foreground">Self Image</div>
                    {[
                      { label: "D", value: pcaData.pcaD3, color: "#ef4444" },
                      { label: "I", value: pcaData.pcaI3, color: "#eab308" },
                      { label: "S", value: pcaData.pcaS3, color: "#22c55e" },
                      { label: "C", value: pcaData.pcaC3, color: "#065292" },
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
                  {careerMatches.slice(0, 3).map((career: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                      <span className="text-sm">{career.name || career.title || career.career || `Career ${idx + 1}`}</span>
                      {(career.match || career.score) && (
                        <Badge variant="outline" className="text-xs">{career.match || career.score}%</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {pcaData.pcaFec && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Completed: {pcaData.pcaFec}
              </div>
            )}

            {/* Download Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex items-center gap-2 pt-2 border-t"
            >
              {pcaData.pcaCod && (
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

/* ------------------------------------------------------------------ */
/*  MIL / LIA Cognitive Reports                                        */
/* ------------------------------------------------------------------ */
function MILReports({ student }: { student: any }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [milData, setMilData] = useState<any>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/lia/${student.id}`);
        setMilData(res?.data || res);
      } catch {}
      setFetched(true);
    })();
  }, [student.id]);

  const hasMIL = milData?.cognitiveProfile && Object.keys(milData.cognitiveProfile).length > 0;

  const cognitiveScores = hasMIL ? [
    { label: "Reasoning", key: "reasoning", color: "#8b5cf6" },
    { label: "Detection", key: "detection", color: "#065292" },
    { label: "Numeric", key: "numeric", color: "#14b8a6" },
    { label: "Memory", key: "memory", color: "#f59e0b" },
    { label: "Orientation", key: "orientation", color: "#ef4444" },
  ] : [];

  const completedExams = milData?.completedExams ?? 0;
  const totalExams = milData?.totalExams ?? 5;

  const downloadCognitive = async () => {
    setDownloading("cognitive");
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
        ...data,
      }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `MIL-Exams-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Exam history downloaded");
    } catch { toast.error("Failed"); }
    setDownloading(null);
  };

  return (
    <div>
      <StudentInfoHeader student={student} icon={Brain} iconColor="#065292" subtitle="MIL / LIA Cognitive Assessment" />
      <div className="p-5 space-y-5">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !hasMIL ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">No MIL/LIA Results</div>
            <div className="text-xs text-muted-foreground mt-1">This student hasn&apos;t completed the cognitive assessments yet.</div>
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
                <div className="text-xs text-muted-foreground mt-1">Exams Completed</div>
              </div>
              {milData.overallScore != null && (
                <div className="rounded-lg border bg-card p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>
                    {milData.overallScore}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Overall Score</div>
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
                <Brain className="h-4 w-4 text-blue-500" />
                Cognitive Profile
              </div>
              <div className="space-y-2.5">
                {cognitiveScores.map((s) => {
                  const val = milData.cognitiveProfile[s.key] ?? milData.cognitiveProfile[s.label.toLowerCase()] ?? 0;
                  return <ScoreBar key={s.key} label={s.label} value={val} color={s.color} />;
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
                Download Profile
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                disabled={downloading === "history"}
                onClick={downloadExamHistory}
              >
                {downloading === "history" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Download Exam History
              </Button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Academic Summary Reports                                           */
/* ------------------------------------------------------------------ */
function AcademicReports({ student }: { student: any }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest(`/api/v1/reports/user-report/${student.id}`);
        setReportData(res?.data || res);
      } catch {}
      setFetched(true);
    })();
  }, [student.id]);

  const gpa = reportData?.gpa || reportData?.academic?.gpa;
  const weightedGpa = gpa?.weighted ?? gpa?.weightedGpa;
  const unweightedGpa = gpa?.unweighted ?? gpa?.unweightedGpa ?? gpa?.value ?? gpa;
  const hasGpa = unweightedGpa != null && typeof unweightedGpa === "number";

  const credits = reportData?.credits || reportData?.academic?.credits;
  const creditsEarned = credits?.earned ?? credits?.completed ?? 0;
  const creditsRequired = credits?.required ?? credits?.total ?? 0;
  const hasCredits = creditsRequired > 0;

  const grades = reportData?.grades || reportData?.academic?.grades || reportData?.recentGrades || [];
  const recentGrades = Array.isArray(grades) ? grades.slice(0, 10) : [];

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
        ...data,
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
              {/* GPA Card */}
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

              {/* Credits Card */}
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
                  {recentGrades.map((g: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{g.courseCode || g.course || g.name || `Course ${idx + 1}`}</span>
                        {g.credits != null && (
                          <Badge variant="outline" className="text-[10px] shrink-0">{g.credits} cr</Badge>
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
                        {g.grade ?? g.score ?? "\u2014"}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Assessment stats */}
            {reportData?.assessments && (
              <div className="text-xs text-muted-foreground">
                PCA: {reportData.assessments.pcaCount || 0} evaluations &middot;
                MIL avg: {reportData.assessments.milAverage || "\u2014"} &middot;
                360: {reportData.assessments.evalStatus || "\u2014"}
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
