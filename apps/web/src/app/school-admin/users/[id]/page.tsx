"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Mail,
  Calendar,
  Clock,
  Award,
  BookOpen,
  AlertCircle,
  GraduationCap,
  Target,
  FileText,
  MessageSquare,
  TrendingUp,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  Heart,
  XCircle,
  ShieldCheck,
  User,
  Users,
  Activity,
  Brain,
  BarChart3,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InviteParentPanel } from "@/components/school-admin/InviteParentPanel";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { useStudent } from "@/hooks/useSchoolAdmin";
import {
  useStudentCoursePlan,
  useSchoolAdminAddCourse,
  useSchoolAdminRemoveCourse,
  useSchoolAdminStudentChangeRequests,
  useSchoolAdminReviewChangeRequest,
} from "@/hooks/useCoursePlanQueries";
import {
  useStudentNotes,
  useCreateNote,
  useDeleteNote,
} from "@/hooks/useCounselorNotesQueries";
import {
  useStudentCommunityService,
  useVerifyCommunityServiceEntry,
} from "@/hooks/useCommunityServiceQueries";
import {
  useStudentMILResults,
  useStudentPCAHistory,
  useStudentPCAResult,
  useRegisterPCA,
  useStudentEvalGroups,
  useStudentEvalProgress,
  useStudentAcademicGaps,
  useStudentRecommendations,
  useStudentTranscript,
  useStudentGpa,
} from "@/hooks/useStudentDetailData";
import type { PCADISCResult } from "@/hooks/useStudentDetailData";

import { format } from "date-fns";
import { toast } from "sonner";
import { StudentStatus } from "@/types/student";
import type { NoteType, CounselorNote } from "@/types/counselorNotes";

// PCA chart image — fetches through backend proxy to avoid CORS
function PCAChartImage({ pcaCod }: { pcaCod?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!pcaCod) return;
    let revoked = false;
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pcaapi/img-report?pcaCod=${pcaCod}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!revoked) setSrc(url);
      } catch { /* ignore */ }
    })();
    return () => { revoked = true; };
  }, [pcaCod]);
  if (!src) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <img src={src} alt="DISC Chart" style={{ width: "100%", borderRadius: 6, border: "1px solid var(--admin-border-default)" }} />
    </div>
  );
}

// Reusable card header
function CardHeader({ icon: Icon, color, title, badge }: { icon: any; color: string; title: string; badge?: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
      display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
    }}>
      <Icon style={{ width: 14, height: 14, color }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{title}</span>
      {badge}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

export default function StudentDetailsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const { data: student, isLoading, error } = useStudent(studentId);
  const { data: coursePlan } = useStudentCoursePlan(studentId);
  const { data: notesData } = useStudentNotes(studentId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const { data: csData } = useStudentCommunityService(studentId);
  const verifyEntry = useVerifyCommunityServiceEntry();

  const adminAdd = useSchoolAdminAddCourse(studentId);
  const adminRemove = useSchoolAdminRemoveCourse(studentId);
  const { data: changeRequestsData } = useSchoolAdminStudentChangeRequests(studentId, "pending");
  const reviewRequest = useSchoolAdminReviewChangeRequest(studentId);

  // New data hooks
  const { data: milData } = useStudentMILResults(studentId);
  const { data: pcaData } = useStudentPCAHistory(studentId);
  const { data: pcaDISC, isLoading: pcaDISCLoading } = useStudentPCAResult(studentId);
  const registerPCA = useRegisterPCA(studentId);
  const { data: evalGroups } = useStudentEvalGroups(studentId);
  const { data: evalProgress } = useStudentEvalProgress(studentId);
  const { data: gapsData } = useStudentAcademicGaps(studentId);
  const { data: recsData } = useStudentRecommendations(studentId);
  const { data: transcriptData } = useStudentTranscript(studentId);
  const { data: gpaData } = useStudentGpa(studentId);

  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");

  const getInitials = (name: string) => {
    if (!name) return "ST";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-40" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div style={{ textAlign: "center", padding: "60px 16px" }}>
        <AlertCircle style={{ width: 36, height: 36, color: "#ef4444", margin: "0 auto 12px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--admin-font-primary)", marginBottom: 6 }}>
          {t("schoolAdmin.students.error.title", "Student Profile Not Found")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", maxWidth: 350, margin: "0 auto 16px" }}>
          {t("schoolAdmin.students.error.description", "The student record you are trying to access does not exist or may have been removed.")}
        </p>
        <button
          onClick={() => router.push("/school-admin/users")}
          style={{
            height: 36, borderRadius: 6, padding: "0 16px",
            fontSize: 12, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--admin-accent-blue, #065292)", color: "#fff",
            border: "none", cursor: "pointer",
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          {t("schoolAdmin.students.backToList", "Return to Students Roster")}
        </button>
      </div>
    );
  }

  const statusBadge = (status: StudentStatus) => {
    const styles: Record<string, { bg: string; color: string }> = {
      active: { bg: "rgba(16,185,129,0.1)", color: "#10b981" },
      pending: { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" },
      accepted: { bg: "rgba(59,130,246,0.1)", color: "#065292" },
      inactive: { bg: "rgba(107,114,128,0.1)", color: "#6b7280" },
    };
    const s = styles[status] || styles.inactive;
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
        background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {t(`schoolAdmin.students.status.${student.status}`, student.status.charAt(0).toUpperCase() + student.status.slice(1))}
      </span>
    );
  };

  const plan = coursePlan?.plan;
  const notes = notesData?.data || [];
  const pendingRequests = changeRequestsData?.data ?? [];

  // Computed assessment stats
  const milCompleted = milData ? milData.completedExams : 0;
  const milTotal = milData ? milData.totalExams : 5;
  const pcaCompleted = pcaDISC?.pcaD1 != null ? 1 : (pcaData?.completedExams ?? 0);
  const pcaTotal = 1;
  const evalTotal = evalGroups?.length ?? 0;
  const evalCompleted = evalGroups?.filter((g: any) => g.isEvaluationCompleted).length ?? 0;

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote.mutate(
      { studentId, type: noteType, content: newNote, isPrivate: false },
      {
        onSuccess: () => setNewNote(""),
        onError: (err: Error) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/school-admin/users")}
        style={{
          height: 32, borderRadius: 6, padding: "0 12px",
          fontSize: 12, fontWeight: 600,
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "transparent",
          color: "var(--admin-font-primary)",
          border: "1px solid var(--admin-border-default)",
          cursor: "pointer",
        }}
      >
        <ArrowLeft style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #065292)" }} />
        {t("schoolAdmin.students.backToList", "Back to Student Roster")}
      </button>

      {/* Profile Banner — OSF ClientInfo style */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <Avatar className="h-28 w-28" style={{ borderRadius: "50%", border: "3px solid var(--admin-border-default)" }}>
          <AvatarImage src={student.avatar || ""} className="object-cover" />
          <AvatarFallback style={{
            borderRadius: "50%",
            background: "#065292",
            color: "#fff", fontSize: 36, fontWeight: 600,
          }}>
            {getInitials(student.name)}
          </AvatarFallback>
        </Avatar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {student.name}
            </h1>
            {statusBadge(student.status)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 14, color: "var(--admin-font-tertiary)" }}>
            <Mail style={{ width: 14, height: 14 }} />
            <span>{student.email}</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 8 }}>
            {(student.createdAt || student.joinedAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--admin-font-secondary)" }}>
                <Calendar style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                <span>{t("schoolAdmin.students.joined", "Joined")} {format(new Date(student.createdAt || student.joinedAt!), "MMM d, yyyy")}</span>
              </div>
            )}
            {(student as any).gradeLevel && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--admin-font-secondary)" }}>
                <GraduationCap style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                <span>Grade {(student as any).gradeLevel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right-aligned meta (OSF style) */}
        <div style={{ textAlign: "right", alignSelf: "flex-start", flexShrink: 0 }}>
          {student.id && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--admin-font-light)", justifyContent: "flex-end" }}>
              <ShieldCheck style={{ width: 12, height: 12 }} />
              <span style={{ fontFamily: "monospace", fontSize: 10 }}>ID: {student.id.substring(0, 8).toUpperCase()}</span>
            </div>
          )}
          {student.lastActive && (
            <div style={{ fontSize: 11, color: "var(--admin-font-light)", marginTop: 4 }}>
              Last active: {format(new Date(student.lastActive), "MMM d, yyyy")}
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "GPA", value: gpaData?.gpaWeighted?.toFixed(2) ?? gpaData?.gpaUnweighted?.toFixed(2) ?? "\u2014", icon: Award, color: "#f59e0b" },
          { label: "Credits", value: `${plan?.graduationProgress?.totalCreditsEarned ?? gpaData?.totalCredits ?? "0"} / ${plan?.graduationProgress?.totalCreditsRequired ?? "0"}`, icon: GraduationCap, color: "#065292" },
          { label: "Assessments", value: `${milCompleted + pcaCompleted + evalCompleted} / ${milTotal + pcaTotal + evalTotal}`, icon: FileText, color: "#14b8a6" },
          { label: "Last Seen", value: student.lastActive ? format(new Date(student.lastActive), "MMM do") : "Never", icon: Activity, color: "#065292" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "14px 16px",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8,
            }}>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>{stat.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList style={{
          background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
          borderRadius: 8, padding: 2, height: "auto",
        }} className="flex flex-wrap">
          {[
            { value: "overview", icon: User, label: "Overview" },
            { value: "assessments", icon: Brain, label: "Assessments" },
            { value: "courses", icon: BookOpen, label: "Academics" },
            { value: "notes", icon: MessageSquare, label: "Notes" },
            { value: "graduation", icon: Heart, label: "Extracurriculars" },
            { value: "parents", icon: Users, label: "Guardians" },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} style={{ borderRadius: 6, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <tab.icon style={{ width: 14, height: 14 }} /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ==================== OVERVIEW TAB ==================== */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Graduation Progress */}
            <Card>
              <CardHeader icon={GraduationCap} color="#065292" title="Graduation Pathway" />
              <div style={{ padding: 16 }}>
                {plan?.graduationProgress ? (
                  <div className="space-y-4">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Credits Acquired</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                          {plan.graduationProgress.totalCreditsEarned} <span style={{ fontSize: 14, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {plan.graduationProgress.totalCreditsRequired} req.</span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
                        background: plan.graduationProgress.isOnTrack ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                        color: plan.graduationProgress.isOnTrack ? "#10b981" : "#ef4444",
                      }}>
                        {plan.graduationProgress.isOnTrack ? "On Track" : "At Risk"}
                      </span>
                    </div>
                    <Progress
                      value={plan.graduationProgress.totalCreditsRequired ? (plan.graduationProgress.totalCreditsEarned / plan.graduationProgress.totalCreditsRequired) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                    Graduation data is not fully calculated yet.
                  </div>
                )}
              </div>
            </Card>

            {/* GPA & Transcript Summary */}
            <Card>
              <CardHeader icon={BarChart3} color="#f59e0b" title="GPA & Academic Standing" />
              <div style={{ padding: 16 }}>
                {gpaData ? (
                  <div className="space-y-3">
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Weighted GPA</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                          {gpaData.gpaWeighted?.toFixed(2) ?? "\u2014"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Unweighted</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                          {gpaData.gpaUnweighted?.toFixed(2) ?? "\u2014"}
                        </div>
                      </div>
                      {gpaData.classRank && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Class Rank</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                            #{gpaData.classRank} <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {gpaData.classSize}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                      Total Credits: {gpaData.totalCredits} {gpaData.computedAt && `| Last computed: ${format(new Date(gpaData.computedAt), "MMM d, yyyy")}`}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                    No GPA data computed yet.
                  </div>
                )}
              </div>
            </Card>

            {/* Assessment Completion Summary */}
            <Card>
              <CardHeader icon={TrendingUp} color="#14b8a6" title="Assessment Completion" />
              <div style={{ padding: 16 }} className="space-y-3">
                {[
                  { label: "MIL / LIA", completed: milCompleted, total: milTotal, color: "#065292" },
                  { label: "PCA Exams", completed: pcaCompleted, total: pcaTotal || 1, color: "#8b5cf6" },
                  { label: "360 Evaluations", completed: evalCompleted, total: evalTotal || 1, color: "#14b8a6" },
                ].map((item) => {
                  const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{item.label}</span>
                        <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{item.completed}/{item.total} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: item.color, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 360 Evaluation Status */}
            <Card>
              <CardHeader icon={Users} color="#ec4899" title="360 Evaluation Status" badge={
                evalTotal > 0 ? (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(236,72,153,0.1)", color: "#ec4899", marginLeft: 4 }}>
                    {evalCompleted}/{evalTotal} complete
                  </span>
                ) : null
              } />
              <div style={{ padding: 16 }}>
                {evalGroups && evalGroups.length > 0 ? (
                  <div className="space-y-2">
                    {evalGroups.map((g: any) => (
                      <div key={g.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                        background: g.isEvaluationCompleted ? "rgba(16,185,129,0.03)" : "var(--admin-bg-card)",
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{g.evaluatorName}</div>
                          <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{g.relation} | {g.evaluatorEmail}</div>
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                          background: g.isEvaluationCompleted ? "rgba(16,185,129,0.1)" : g.isTokenUsed ? "rgba(59,130,246,0.1)" : "rgba(245,158,11,0.1)",
                          color: g.isEvaluationCompleted ? "#10b981" : g.isTokenUsed ? "#065292" : "#f59e0b",
                          textTransform: "uppercase",
                        }}>
                          {g.isEvaluationCompleted ? "Completed" : g.isTokenUsed ? "In Progress" : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
                    No 360 evaluations assigned yet.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== ASSESSMENTS TAB ==================== */}
        <TabsContent value="assessments" className="mt-4 space-y-4">
          {/* MIL / LIA Results */}
          <Card>
            <CardHeader icon={Brain} color="#065292" title="MIL / LIA Cognitive Assessment" badge={
              milData ? (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(99,102,241,0.1)", color: "#065292", marginLeft: 4 }}>
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
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#065292", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Overall Score</div>
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
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Cognitive Profile</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {Object.entries(milData.cognitiveProfile).map(([key, value]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)", textTransform: "capitalize" }}>
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </div>
                              <div style={{ height: 4, borderRadius: 2, background: "var(--admin-bg-hover)", marginTop: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(Number(value) || 0, 100)}%`, borderRadius: 2, background: "#065292" }} />
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
                      {milData.examResults?.map((exam: any) => (
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
                              color: exam.status === "completed" ? "#10b981" : exam.status === "in_progress" ? "#065292" : "#6b7280",
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
            <CardHeader icon={Target} color="#8b5cf6" title="PCA DISC Profile" badge={
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
                  {/* 3 DISC Graphs */}
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
                          { label: "C", value: graph.c, color: "#065292" },
                        ].map((dim) => (
                          <div key={dim.label} style={{ textAlign: "center" }}>
                            <div style={{
                              height: 48, position: "relative", background: "var(--admin-bg-hover)", borderRadius: 4, overflow: "hidden",
                            }}>
                              <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                height: `${Math.min(100, (dim.value ?? 0))}%`,
                                background: dim.color, opacity: 0.7, borderRadius: "0 0 4px 4px",
                              }} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: dim.color, marginTop: 2 }}>{dim.label}</div>
                            <div style={{ fontSize: 9, color: "var(--admin-font-tertiary)" }}>{dim.value ?? "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Chart image from TIMS (proxied through backend to avoid CORS) */}
                  <PCAChartImage pcaCod={pcaDISC.pcaCod} />
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Target style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4, color: "var(--admin-font-tertiary)" }} />
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 12 }}>
                    No PCA DISC results available.
                  </div>
                  <button
                    onClick={() => {
                      if (!student) return;
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
        </TabsContent>

        {/* ==================== ACADEMICS TAB ==================== */}
        <TabsContent value="courses" className="mt-4 space-y-4">
          {/* Pending change requests */}
          {pendingRequests.length > 0 && (
            <div style={{
              borderRadius: 8, border: "1px solid rgba(245,158,11,0.3)",
              background: "rgba(245,158,11,0.05)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(245,158,11,0.2)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <AlertCircle style={{ width: 16, height: 16, color: "#f59e0b" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  Action Required: Course Requests
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                  background: "rgba(245,158,11,0.15)", color: "#f59e0b", marginLeft: 4,
                }}>
                  {pendingRequests.length} pending
                </span>
              </div>
              <div style={{ padding: 16 }} className="space-y-3">
                {pendingRequests.map((req: any) => (
                  <div key={req.id} style={{
                    display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12,
                    padding: "12px 14px", borderRadius: 6,
                    background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
                    flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                          background: req.action === 'add' ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          color: req.action === 'add' ? "#10b981" : "#ef4444",
                        }}>
                          {req.action === "add" ? "Enrollment Request" : "Drop Request"}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{req.courseName}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>{req.courseCode}</span>
                        <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>Grade {req.gradeLevel}</span>
                        <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>{req.semester}</span>
                      </div>
                      {req.studentNote && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--admin-font-tertiary)", fontStyle: "italic", display: "flex", alignItems: "start", gap: 6 }}>
                          <MessageSquare style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
                          &quot;{req.studentNote}&quot;
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        disabled={reviewRequest.isPending}
                        onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "approved" } })}
                        style={{
                          height: 30, borderRadius: 6, padding: "0 10px",
                          fontSize: 11, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 4,
                          background: "#10b981", color: "#fff",
                          border: "none", cursor: "pointer",
                          opacity: reviewRequest.isPending ? 0.6 : 1,
                        }}
                      >
                        <CheckCircle2 style={{ width: 12, height: 12 }} />
                        Approve
                      </button>
                      <button
                        disabled={reviewRequest.isPending}
                        onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "rejected" } })}
                        style={{
                          height: 30, borderRadius: 6, padding: "0 10px",
                          fontSize: 11, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 4,
                          background: "transparent", color: "#ef4444",
                          border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer",
                          opacity: reviewRequest.isPending ? 0.6 : 1,
                        }}
                      >
                        <XCircle style={{ width: 12, height: 12 }} />
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Academic Gaps */}
          {gapsData && gapsData.creditGaps && gapsData.creditGaps.length > 0 && (
            <Card>
              <CardHeader icon={AlertTriangle} color="#ef4444" title="Academic Gaps" badge={
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                  background: gapsData.overallStatus === "on_track" ? "rgba(16,185,129,0.1)" : gapsData.overallStatus === "at_risk" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                  color: gapsData.overallStatus === "on_track" ? "#10b981" : gapsData.overallStatus === "at_risk" ? "#f59e0b" : "#ef4444",
                  marginLeft: 4, textTransform: "uppercase",
                }}>
                  {gapsData.overallStatus?.replace("_", " ")}
                </span>
              } />
              <div style={{ padding: 16 }} className="space-y-2">
                {gapsData.creditGaps.map((gap: any) => (
                  <div key={gap.category} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                  }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{gap.category}</span>
                      <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 8 }}>
                        {gap.creditsEarned}/{gap.creditsRequired} credits
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {gap.deficit > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>-{gap.deficit}</span>
                      )}
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                        background: gap.severity === "critical" ? "rgba(239,68,68,0.1)" : gap.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                        color: gap.severity === "critical" ? "#ef4444" : gap.severity === "warning" ? "#f59e0b" : "#065292",
                      }}>
                        {gap.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Course Recommendations */}
          {recsData && (recsData.nextSemester?.length > 0 || recsData.longTerm?.length > 0) && (
            <Card>
              <CardHeader icon={Lightbulb} color="#f59e0b" title="Course Recommendations" />
              <div style={{ padding: 16 }} className="space-y-4">
                {recsData.nextSemester?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Next Semester</div>
                    <div className="space-y-2">
                      {recsData.nextSemester.map((rec: any) => (
                        <div key={rec.courseId || rec.courseCode} style={{
                          padding: "10px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>{rec.courseCode}</span>
                            <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{rec.reason}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{rec.credits} cr</span>
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                              background: rec.priority === "high" ? "rgba(239,68,68,0.1)" : rec.priority === "medium" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                              color: rec.priority === "high" ? "#ef4444" : rec.priority === "medium" ? "#f59e0b" : "#065292",
                            }}>
                              {rec.priority}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {recsData.longTerm?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Long-Term Plan</div>
                    <div className="space-y-2">
                      {recsData.longTerm.map((rec: any) => (
                        <div key={rec.courseId || rec.courseCode} style={{
                          padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>{rec.courseCode} | {rec.credits} cr</span>
                          </div>
                          <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", maxWidth: 200, textAlign: "right" }}>{rec.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Transcript */}
          {transcriptData?.grades && Object.keys(transcriptData.grades).length > 0 && (
            <Card>
              <CardHeader icon={FileText} color="#065292" title="Transcript" />
              <div style={{ padding: 16 }} className="space-y-4">
                {Object.entries(transcriptData.grades).sort(([a], [b]) => b.localeCompare(a)).map(([year, courses]) => (
                  <div key={year}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid var(--admin-border-default)" }}>
                      {year}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 12px", fontSize: 11 }}>
                      {(courses as any[]).map((c: any) => (
                        <div key={c.id} style={{ display: "contents" }}>
                          <span style={{ color: "var(--admin-font-primary)", fontWeight: 500 }}>{c.courseCode || "N/A"}</span>
                          <span style={{ color: "var(--admin-font-tertiary)" }}>{c.credits} cr</span>
                          <span style={{ color: "var(--admin-font-tertiary)", textTransform: "capitalize" }}>{c.courseLevel || "regular"}</span>
                          <span style={{
                            fontWeight: 600,
                            color: c.grade === "A" || c.grade === "A+" || c.grade === "A-" ? "#10b981" :
                              c.grade === "B" || c.grade === "B+" || c.grade === "B-" ? "#065292" :
                              c.grade === "F" ? "#ef4444" : "var(--admin-font-primary)",
                          }}>
                            {c.grade || (c.status === "in_progress" ? "IP" : "\u2014")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Sequence Builder */}
          <Card>
            <SequenceBuilder
              planData={coursePlan}
              isLoading={false}
              mode="counselor"
              onCounselorAdd={(payload) => adminAdd.mutate(payload)}
              onCounselorRemove={(enrollmentId) => adminRemove.mutate(enrollmentId)}
              isCounselorAddPending={adminAdd.isPending}
              isCounselorRemovePending={adminRemove.isPending}
              recommendations={recsData}
              academicGaps={gapsData}
            />
          </Card>
        </TabsContent>

        {/* ==================== NOTES TAB ==================== */}
        <TabsContent value="notes" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Add Note Form */}
            <Card className="h-fit">
              <CardHeader icon={Plus} color="#10b981" title="New Entry" />
              <div style={{ padding: 16 }} className="space-y-3">
                <div className="space-y-1">
                  <label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</label>
                  <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                    <SelectTrigger className="h-9 text-xs" style={{ borderRadius: 6 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Observation</SelectItem>
                      <SelectItem value="meeting">Meeting Summary</SelectItem>
                      <SelectItem value="follow_up">Action items / Follow-up</SelectItem>
                      <SelectItem value="academic">Academic Intervention</SelectItem>
                      <SelectItem value="career">Career Guidance</SelectItem>
                      <SelectItem value="personal">Personal / Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</label>
                  <Textarea
                    placeholder={t("schoolAdmin.students.notePlaceholder", "Document interaction details here...")}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={5}
                    className="text-xs resize-none"
                    style={{ borderRadius: 6 }}
                  />
                </div>

                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || createNote.isPending}
                  style={{
                    width: "100%", height: 36, borderRadius: 6,
                    fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "var(--admin-accent-blue, #065292)", color: "#fff",
                    border: "none", cursor: "pointer",
                    opacity: (!newNote.trim() || createNote.isPending) ? 0.6 : 1,
                  }}
                >
                  <Send style={{ width: 12, height: 12 }} />
                  Publish to File
                </button>
              </div>
            </Card>

            {/* Notes List */}
            <div className="lg:col-span-2">
              <Card>
                <div style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--admin-bg-hover)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <FileText style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Counselor Notes</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                      border: "1px solid var(--admin-border-default)",
                    }}>
                      {notes.length} entries
                    </span>
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  {notes.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 16px" }}>
                      <MessageSquare style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No notes found</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
                        There are currently no notes on file for this student.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note: CounselorNote) => (
                        <div key={note.id} className="group" style={{
                          padding: "12px 14px", borderRadius: 6,
                          border: "1px solid var(--admin-border-default)",
                          background: "var(--admin-bg-card)",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                                textTransform: "uppercase", letterSpacing: "0.03em",
                              }}>
                                {note.type.replace('_', ' ')}
                              </span>
                              {note.isPrivate && (
                                <span style={{
                                  fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                  background: "rgba(245,158,11,0.1)", color: "#f59e0b",
                                  textTransform: "uppercase", letterSpacing: "0.03em",
                                }}>
                                  Confidential
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>
                                {note.createdAt && format(new Date(note.createdAt), "MMM d, yyyy")}
                              </span>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => deleteNote.mutate({ noteId: note.id, studentId })}
                                title="Delete entry"
                                style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                              >
                                <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                              </button>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--admin-font-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5, padding: "8px 10px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>
                            {note.content}
                          </div>

                          {note.followUpDate && (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, background: "rgba(245,158,11,0.08)", width: "fit-content" }}>
                              <Clock style={{ width: 11, height: 11, color: "#f59e0b" }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Follow-up: {format(new Date(note.followUpDate), "MMM d, yyyy")}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ==================== EXTRACURRICULARS TAB ==================== */}
        <TabsContent value="graduation" className="mt-4">
          <Card>
            <CardHeader icon={Heart} color="#ec4899" title="Community Service Log" />
            <div style={{ padding: 16 }}>
              {/* Progress */}
              <div style={{
                padding: "14px 16px", borderRadius: 6,
                border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Service Requirement</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                      {csData?.totalHoursVerified ?? 0} <span style={{ fontSize: 14, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {csData?.totalHoursRequired ?? 40} hrs</span>
                    </div>
                  </div>
                  <Heart style={{ width: 20, height: 20, color: "#ec4899", opacity: 0.5 }} />
                </div>
                <Progress
                  value={((csData?.totalHoursVerified ?? 0) / (csData?.totalHoursRequired ?? 40)) * 100}
                  className="h-2"
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>0 hrs</span>
                  <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>Goal: {csData?.totalHoursRequired ?? 40} hrs</span>
                </div>
              </div>

              {/* Entries */}
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--admin-border-default)" }}>Activity Ledger</div>
              {csData?.entries && csData.entries.length > 0 ? (
                <div className="space-y-3">
                  {csData.entries.map((entry) => {
                    const isPending = entry.status === "pending";
                    return (
                      <div key={entry.id} style={{
                        padding: "12px 14px", borderRadius: 6,
                        border: "1px solid var(--admin-border-default)",
                        background: isPending ? "rgba(245,158,11,0.03)" : "var(--admin-bg-card)",
                        display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12,
                        flexWrap: "wrap",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{entry.organization}</span>
                            {entry.status === "verified" && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Verified</span>
                            )}
                            {entry.status === "rejected" && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(107,114,128,0.1)", color: "#6b7280" }}>Rejected</span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                              <Clock style={{ width: 10, height: 10 }} /> {entry.hours} hours
                            </span>
                            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                              <Calendar style={{ width: 10, height: 10 }} /> {format(new Date(entry.date), "MMM d, yyyy")}
                            </span>
                          </div>
                          {entry.description && (
                            <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 6, lineHeight: 1.4 }}>{entry.description}</p>
                          )}
                        </div>

                        {isPending && (
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              disabled={verifyEntry.isPending}
                              onClick={() => verifyEntry.mutate({ entryId: entry.id, payload: { status: "verified" } })}
                              style={{
                                height: 28, borderRadius: 5, padding: "0 8px",
                                fontSize: 10, fontWeight: 600,
                                display: "flex", alignItems: "center", gap: 3,
                                background: "rgba(16,185,129,0.1)", color: "#10b981",
                                border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer",
                              }}
                            >
                              <CheckCircle2 style={{ width: 11, height: 11 }} /> Approve
                            </button>
                            <button
                              disabled={verifyEntry.isPending}
                              onClick={() => verifyEntry.mutate({ entryId: entry.id, payload: { status: "rejected" } })}
                              style={{
                                height: 28, borderRadius: 5, padding: "0 8px",
                                fontSize: 10, fontWeight: 600,
                                display: "flex", alignItems: "center", gap: 3,
                                background: "rgba(239,68,68,0.05)", color: "#ef4444",
                                border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer",
                              }}
                            >
                              <XCircle style={{ width: 11, height: 11 }} /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <Heart style={{ width: 20, height: 20, color: "var(--admin-font-tertiary)", margin: "0 auto 6px", opacity: 0.4 }} />
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>No community service entries logged yet.</div>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ==================== GUARDIANS TAB ==================== */}
        <TabsContent value="parents" className="mt-4">
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "20px 24px",
          }}>
            <InviteParentPanel
              studentId={studentId}
              studentName={student.name}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
