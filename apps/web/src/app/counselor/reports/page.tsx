"use client";

import { useState, useEffect } from "react";
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
              Download assessment reports for your assigned students
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
              <TableHead className="text-xs font-semibold uppercase text-muted-foreground"></TableHead>
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
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedStudent(student)}
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
                <TableCell className="py-3 px-4">
                  <span className="text-xs font-semibold text-indigo-600">View Reports &rarr;</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Student Report Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent className="max-w-[560px] p-0 overflow-hidden">
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

// -- PCA Reports --
function PCAReports({ student }: { student: any }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pcaData, setPcaData] = useState<any>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/pcaapi/get-result", { method: "POST", data: { UserId: student.id } });
        setPcaData(res?.data || res);
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
      <div className="p-5 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-violet-500" />
          <div>
            <div className="text-base font-bold">{student.name}</div>
            <div className="text-xs text-muted-foreground">PCA / DISC Profile Reports</div>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {!fetched ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !hasPCA ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">No PCA Results</div>
            <div className="text-xs text-muted-foreground mt-1">This student hasn&apos;t completed the PCA assessment yet.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Image} label="DISC Chart Image" desc="Visual chart of D/I/S/C profile across 3 graphs" format="PNG" loading={loading === "chart"} onDownload={downloadChart} />
            <ReportRow icon={FileText} label="Full PCA Report" desc="DISC scores and completion data" format="JSON" loading={loading === "full"} onDownload={downloadFullReport} />
            {pcaData.pcaFec && (
              <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Completed: {pcaData.pcaFec}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -- MIL Reports --
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
      <div className="p-5 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-blue-500" />
          <div>
            <div className="text-base font-bold">{student.name}</div>
            <div className="text-xs text-muted-foreground">MIL / LIA Cognitive Assessment Reports</div>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {!fetched ? (
          <Skeleton className="h-14 w-full" />
        ) : !hasMIL ? (
          <div className="text-center py-6 rounded-lg bg-muted/30 border">
            <XCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <div className="text-sm font-semibold">No MIL/LIA Results</div>
            <div className="text-xs text-muted-foreground mt-1">This student hasn&apos;t completed the cognitive assessments yet.</div>
          </div>
        ) : (
          <>
            <ReportRow icon={Brain} label="Cognitive Profile" desc="5 domains: Reasoning, Detection, Numeric, Memory, Orientation" format="JSON" loading={loading === "cognitive"} onDownload={downloadCognitive} />
            <ReportRow icon={BarChart3} label="Exam Results History" desc="All exam attempts with scores, timing, and per-question data" format="JSON" loading={loading === "history"} onDownload={downloadExamHistory} />
            {milData.overallScore != null && (
              <div className="text-xs text-muted-foreground mt-2">
                Overall Score: <span className="font-semibold text-foreground">{milData.overallScore}%</span>
                {milData.completedExams != null && <span> &middot; {milData.completedExams}/{milData.totalExams} exams completed</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -- Academic Summary Reports --
function AcademicReports({ student }: { student: any }) {
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
      a.download = `Academic-Summary-${student.name.replace(/\s+/g, "-")}.json`; a.click();
      toast.success("Academic summary downloaded");
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
      <div className="p-5 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-emerald-500" />
          <div>
            <div className="text-base font-bold">{student.name}</div>
            <div className="text-xs text-muted-foreground">Full Academic Summary &amp; Career Reports</div>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {!fetched ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <>
            <ReportRow icon={FileText} label="Comprehensive Student Report" desc="Academic, assessments, courses, and career data combined" format="JSON" loading={loading === "comprehensive"} onDownload={downloadComprehensive} />
            <ReportRow icon={Briefcase} label="Career Profile Report" desc="PCA evaluations, career matches, and AI insights" format="JSON" loading={loading === "pca"} onDownload={downloadPCAReport} />
            {reportData?.assessments && (
              <div className="text-xs text-muted-foreground mt-2">
                PCA: {reportData.assessments.pcaCount || 0} evaluations &middot;
                MIL avg: {reportData.assessments.milAverage || "\u2014"} &middot;
                360: {reportData.assessments.evalStatus || "\u2014"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -- Shared Report Row --
function ReportRow({ icon: Icon, label, desc, format, loading, onDownload }: {
  icon: any; label: string; desc: string; format: string; loading: boolean; onDownload: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Badge variant="outline" className="text-xs">{format}</Badge>
      <Button
        size="sm"
        onClick={onDownload}
        disabled={loading}
        className="h-8 px-3 text-xs gap-1.5"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        Download
      </Button>
    </div>
  );
}
