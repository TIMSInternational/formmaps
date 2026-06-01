"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api/apiClient";
import { useStudents } from "@/hooks/useSchoolAdmin";
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
import { AdminTabBar } from "../_components/AdminTabBar";
import {
  FileText, Search, Download, ChevronLeft, ChevronRight, Target, Brain,
  Users, Loader2, Image, BarChart3, Briefcase, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

type TabKey = "pca" | "mil" | "360";

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("pca");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey;
    if (tab && ["pca", "mil", "360"].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    router.replace(`/school-admin/reports?tab=${key}`, { scroll: false });
  };

  const { data: studentsData, isLoading } = useStudents({ page, limit: 20, search: search || undefined });
  const students = studentsData?.data || [];
  const totalPages = studentsData?.totalPages || 1;

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>Reports</h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>Download assessment reports and data exports per student</p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "pca", label: "PCA / DISC Profile", icon: Target },
          { key: "mil", label: "MIL / LIA Cognitive", icon: Brain },
          { key: "360", label: "360° Evaluation", icon: Users },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder="Search students..." className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Student", "Email", "Grade", "Status", ""].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(5).fill(0).map((_, j) => (
                    <TableCell key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" style={{ background: "var(--admin-bg-hover)" }} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                  <FileText style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} /> No students found
                </TableCell>
              </TableRow>
            ) : students.map((student: any) => (
              <TableRow key={student.id} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                className="transition-colors"
                onClick={() => setSelectedStudent(student)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <TableCell className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #14b8a6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      {student.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{student.email}</TableCell>
                <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{student.gradeLevel || "—"}</TableCell>
                <TableCell className="py-3 px-4">
                  <Badge className="text-xs font-medium shadow-none border-0" style={{
                    background: student.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                    color: student.status === "active" ? "#10b981" : "#6b7280",
                  }}>{student.status || "active"}</Badge>
                </TableCell>
                <TableCell className="py-3 px-4">
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-accent-blue, #065292)" }}>View Reports →</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
            <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Student Report Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", maxWidth: 560, padding: 0, overflow: "hidden" }}>
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
  return <EvalReports student={student} />;
}

// ── PCA Reports ──
function PCAReports({ student }: { student: any }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pcaData, setPcaData] = useState<any>(null);
  const [competences, setCompetences] = useState<any>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: student.id } });
        setPcaData(res?.data || res);
      } catch {}
      try {
        const res = await apiRequest("/api/pcaapi/get-competences", { method: "POST", data: { UserId: student.id } });
        setCompetences(res?.data || res);
      } catch {}
      setFetched(true);
    })();
  }, [student.id]);

  const hasPCA = pcaData && pcaData.pcaD1 != null;

  const downloadChart = async () => {
    if (!pcaData?.pcaCod) return;
    setLoading("chart");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pcaapi/img-report?pcaCod=${pcaData.pcaCod}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `DISC-Chart-${student.name.replace(/\s+/g, "-")}.png`; a.click();
      toast.success("DISC chart downloaded");
    } catch { toast.error("Failed to download chart"); }
    setLoading(null);
  };

  const downloadFullReport = async () => {
    setLoading("full");
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
        competences: competences?.pcaCmps || null,
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
        ) : !hasPCA ? (
          <div style={{ padding: 24, textAlign: "center", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
            <XCircle style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No PCA Results</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>This student hasn't completed the PCA assessment yet.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Image} label="DISC Chart Image" desc="Visual chart of D/I/S/C profile across 3 graphs" format="PNG" loading={loading === "chart"} onDownload={downloadChart} />
            <ReportRow icon={FileText} label="Full PCA Report" desc="DISC scores, competences, and completion data" format="JSON" loading={loading === "full"} onDownload={downloadFullReport}
              onPrint={() => {
                const d = pcaData;
                const cmps = competences?.pcaCmps || [];
                openPrintableReport("PCA DISC Profile Report", student.name, [
                  { heading: "DISC Scores", content: `<table><tr><th></th><th>D</th><th>I</th><th>S</th><th>C</th></tr>
                    <tr><td>Work Adaptation</td><td>${d.pcaD1}</td><td>${d.pcaI1}</td><td>${d.pcaS1}</td><td>${d.pcaC1}</td></tr>
                    <tr><td>Under Pressure</td><td>${d.pcaD2}</td><td>${d.pcaI2}</td><td>${d.pcaS2}</td><td>${d.pcaC2}</td></tr>
                    <tr><td>Self-Image</td><td>${d.pcaD3}</td><td>${d.pcaI3}</td><td>${d.pcaS3}</td><td>${d.pcaC3}</td></tr></table>
                    <p style="font-size:12px;color:#888;">Completed: ${d.pcaFec || "—"}</p>` },
                  ...(cmps.length ? [{ heading: `Competences (${cmps.length})`, content: `<table><tr><th>Competency</th><th>Level</th></tr>${cmps.map((c: any) =>
                    `<tr><td>${c.cmpNom || c.CmpNom}</td><td><span class="badge" style="background:${(c.level || c.Level) >= 3 ? "#dcfce7;color:#16a34a" : (c.level || c.Level) >= 2 ? "#fef9c3;color:#ca8a04" : "#fee2e2;color:#dc2626"}">${c.level || c.Level}/3</span></td></tr>`).join("")}</table>` }] : []),
                ]);
              }}
            />
            {pcaData.pcaFec && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                <CheckCircle2 style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4, color: "#10b981" }} />
                Completed: {pcaData.pcaFec}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MIL Reports ──
function MILReports({ student }: { student: any }) {
  const [loading, setLoading] = useState<string | null>(null);
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
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>This student hasn't completed the cognitive assessments yet.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Brain} label="Cognitive Profile" desc="5 domains: Reasoning, Detection, Numeric, Memory, Orientation" format="JSON" loading={loading === "cognitive"} onDownload={downloadCognitive}
              onPrint={() => {
                const cp = milData.cognitiveProfile || {};
                const labels: Record<string, string> = { PatternRecognition: "Pattern Recognition", VerbalReasoning: "Verbal Reasoning", WorkingMemory: "Working Memory", NumericVelocity: "Numeric Velocity", VisualRotation: "Visual Rotation" };
                openPrintableReport("MIL / LIA Cognitive Profile", student.name, [
                  { heading: "Overall Score", content: `<p style="font-size:28px;font-weight:700;">${milData.overallScore || 0}%</p><p style="color:#888;">Completed ${milData.completedExams || 0} of ${milData.totalExams || 5} exams</p>` },
                  { heading: "Cognitive Domains", content: `<table><tr><th>Domain</th><th>Score</th><th>Visual</th></tr>${Object.entries(cp).map(([k, v]) => {
                    const pct = Number(v) || 0;
                    const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#ca8a04" : "#dc2626";
                    return `<tr><td>${labels[k] || k}</td><td style="font-weight:600;">${pct}%</td><td><div class="bar-container"><div class="bar" style="width:${pct}%;background:${color};"></div></div></td></tr>`;
                  }).join("")}</table>` },
                  ...(milData.strengths?.length ? [{ heading: "Strengths", content: `<ul>${milData.strengths.map((s: string) => `<li>${s}</li>`).join("")}</ul>` }] : []),
                  ...(milData.areasForGrowth?.length ? [{ heading: "Areas for Growth", content: `<ul>${milData.areasForGrowth.map((s: string) => `<li>${s}</li>`).join("")}</ul>` }] : []),
                ]);
              }}
            />
            <ReportRow icon={BarChart3} label="Exam Results History" desc="All exam attempts with scores, timing, and per-question data" format="JSON" loading={loading === "history"} onDownload={downloadExamHistory} />
            {milData.overallScore != null && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                Overall Score: <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{milData.overallScore}%</span>
                {milData.completedExams != null && <span> · {milData.completedExams}/{milData.totalExams} exams completed</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 360° Reports ──
function EvalReports({ student }: { student: any }) {
  const [loading, setLoading] = useState<string | null>(null);
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
      toast.success("360° report downloaded");
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

  return (
    <div>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users style={{ width: 20, height: 20, color: "#10b981" }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{student.name}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>360° Evaluation & Comprehensive Reports</div>
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
                const d = reportData || {};
                const s = d.student || {};
                const ac = d.academic || {};
                const ass = d.assessments || {};
                openPrintableReport("Comprehensive Student Report", student.name, [
                  { heading: "Student Information", content: `<table><tr><td><strong>Name:</strong> ${s.name || student.name}</td><td><strong>Email:</strong> ${s.email || student.email}</td></tr><tr><td><strong>Grade:</strong> ${s.gradeLevel || "—"}</td><td><strong>Status:</strong> ${s.status || "active"}</td></tr></table>` },
                  { heading: "Academic Summary", content: `<table><tr><td><strong>GPA:</strong> ${ac.gpa ?? "—"}</td><td><strong>Credits Earned:</strong> ${ac.creditsEarned ?? "—"}</td><td><strong>Courses:</strong> ${d.courses?.length ?? 0}</td></tr></table>` },
                  { heading: "Assessment Status", content: `<table><tr><th>Assessment</th><th>Status</th></tr><tr><td>PCA</td><td>${ass.pcaCount || 0} evaluations</td></tr><tr><td>MIL Average</td><td>${ass.milAverage || "—"}</td></tr><tr><td>360°</td><td>${ass.evalStatus || "—"}</td></tr></table>` },
                ]);
              }}
            />
            <ReportRow icon={Briefcase} label="Career Profile Report" desc="PCA evaluations, career matches, and AI insights" format="JSON" loading={loading === "pca"} onDownload={downloadPCAReport} />
            {reportData?.assessments && (
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
                PCA: {reportData.assessments.pcaCount || 0} evaluations ·
                MIL avg: {reportData.assessments.milAverage || "—"} ·
                360°: {reportData.assessments.evalStatus || "—"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared Report Row Component ──
// Open a printable HTML report in a new window (user can Ctrl+P to save as PDF)
function openPrintableReport(title: string, studentName: string, sections: { heading: string; content: string }[]) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ${studentName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 24px 0 12px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  .meta { font-size: 13px; color: #888; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bar-container { display: inline-block; width: 60px; height: 8px; background: #f0f0f0; border-radius: 4px; vertical-align: middle; margin-left: 8px; }
  .bar { height: 100%; border-radius: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta">${studentName} · Generated ${new Date().toLocaleDateString()}</div>
${sections.map(s => `<h2>${s.heading}</h2>${s.content}`).join("")}
<script>window.print();</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function ReportRow({ icon: Icon, label, desc, format, loading, onDownload, onPrint }: {
  icon: any; label: string; desc: string; format: string; loading: boolean; onDownload: () => void; onPrint?: () => void;
}) {
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
