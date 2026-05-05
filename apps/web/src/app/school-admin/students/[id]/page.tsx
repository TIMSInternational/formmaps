"use client";

import { useState } from "react";
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
  Activity
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

import { format } from "date-fns";
import { toast } from "sonner";
import { StudentStatus } from "@/types/student";
import type { NoteType, CounselorNote } from "@/types/counselorNotes";
import type { CommunityServiceStatus } from "@/types/communityService";

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
          onClick={() => router.push("/school-admin/students")}
          style={{
            height: 36, borderRadius: 6, padding: "0 16px",
            fontSize: 12, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
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
      accepted: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6" },
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
        onClick={() => router.push("/school-admin/students")}
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
        <ArrowLeft style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #3b82f6)" }} />
        {t("schoolAdmin.students.backToList", "Back to Student Roster")}
      </button>

      {/* Profile Banner */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <Avatar className="h-16 w-16" style={{ borderRadius: 12, border: "2px solid var(--admin-border-default)" }}>
          <AvatarImage src={student.avatar || ""} className="object-cover" />
          <AvatarFallback style={{
            borderRadius: 12,
            background: "var(--admin-accent-blue, #3b82f6)",
            color: "#fff", fontSize: 18, fontWeight: 700,
          }}>
            {getInitials(student.name)}
          </AvatarFallback>
        </Avatar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
              {student.name}
            </h1>
            {statusBadge(student.status)}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--admin-font-tertiary)" }}>
              <Mail style={{ width: 12, height: 12 }} />
              <span>{student.email}</span>
            </div>
            {(student.createdAt || student.joinedAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                <Calendar style={{ width: 12, height: 12 }} />
                <span>{t("schoolAdmin.students.joined", "Joined")} {format(new Date(student.createdAt || student.joinedAt!), "MMM d, yyyy")}</span>
              </div>
            )}
            {student.id && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                <ShieldCheck style={{ width: 12, height: 12 }} />
                <span style={{ fontFamily: "monospace", fontSize: 10 }}>ID: {student.id.substring(0, 8).toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t("schoolAdmin.students.progress", "Course Progress"), value: `${student.progress}%`, icon: BookOpen, color: "#14b8a6" },
          { label: t("schoolAdmin.students.avgScore", "Average Score"), value: `${student.averageScore?.toFixed(1) ?? "\u2014"}%`, icon: Award, color: "#f59e0b" },
          { label: t("schoolAdmin.students.credits", "Earned Credits"), value: `${plan?.graduationProgress?.totalCreditsEarned ?? "0"} / ${plan?.graduationProgress?.totalCreditsRequired ?? "0"}`, icon: GraduationCap, color: "#6366f1" },
          { label: t("schoolAdmin.students.lastActive", "Last Seen"), value: student.lastActive ? format(new Date(student.lastActive), "MMM do") : "Never", icon: Activity, color: "#3b82f6" },
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
            { value: "overview", icon: User, label: "Snapshot" },
            { value: "courses", icon: BookOpen, label: "Enrollments" },
            { value: "assessments", icon: FileText, label: "Testing" },
            { value: "notes", icon: MessageSquare, label: "Records" },
            { value: "graduation", icon: Award, label: "Extracurriculars" },
            { value: "parents", icon: Users, label: "Guardians" },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} style={{ borderRadius: 6, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <tab.icon style={{ width: 14, height: 14 }} /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Graduation Progress */}
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
              }}>
                <GraduationCap style={{ width: 14, height: 14, color: "#6366f1" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {t("schoolAdmin.students.graduationProgress", "Graduation Pathway")}
                </span>
              </div>
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
                        {plan.graduationProgress.isOnTrack
                          ? t("schoolAdmin.students.onTrack", "On Track")
                          : t("schoolAdmin.students.atRisk", "At Risk")}
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
            </div>

            {/* Career Path */}
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
              }}>
                <Target style={{ width: 14, height: 14, color: "#8b5cf6" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {t("schoolAdmin.students.careerPath", "Career Affinities")}
                </span>
              </div>
              <div style={{ padding: 16, textAlign: "center" }}>
                <Target style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "16px auto 8px", opacity: 0.4 }} />
                <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 220, margin: "0 auto" }}>
                  {t("schoolAdmin.students.careerPathDesc", "No career assessment data available from the external integration yet.")}
                </p>
              </div>
            </div>

            {/* 360 Evaluation */}
            <div className="md:col-span-2" style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
              }}>
                <TrendingUp style={{ width: 14, height: 14, color: "#14b8a6" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {t("schoolAdmin.students.evaluationStatus", "360 Diagnostics")}
                </span>
              </div>
              <div style={{ padding: 16, textAlign: "center" }}>
                <TrendingUp style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", margin: "16px auto 8px", opacity: 0.3 }} />
                <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto 12px" }}>
                  {t("schoolAdmin.students.evaluationStatusDesc", "Comprehensive behavioral and academic 360-degree reviews will populate here when completed.")}
                </p>
                <button
                  onClick={() => router.push("/school-admin/evaluations")}
                  style={{
                    height: 32, borderRadius: 6, padding: "0 12px",
                    fontSize: 11, fontWeight: 600,
                    background: "transparent", color: "var(--admin-font-primary)",
                    border: "1px solid var(--admin-border-default)", cursor: "pointer",
                  }}
                >
                  {t("schoolAdmin.students.viewEvaluations", "Go to Evaluations Hub")}
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Courses Tab */}
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
                  {t("schoolAdmin.students.pendingRequests", "Action Required: Course Requests")}
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
                        {t("common.approve", "Approve")}
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
                        {t("common.reject", "Deny")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sequence Builder */}
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", overflow: "hidden",
          }}>
            <SequenceBuilder
              planData={coursePlan}
              isLoading={false}
              mode="counselor"
              onCounselorAdd={(payload) => adminAdd.mutate(payload)}
              onCounselorRemove={(enrollmentId) => adminRemove.mutate(enrollmentId)}
              isCounselorAddPending={adminAdd.isPending}
              isCounselorRemovePending={adminRemove.isPending}
            />
          </div>
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments" className="mt-4">
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
              display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
            }}>
              <FileText style={{ width: 14, height: 14, color: "#6366f1" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                {t("schoolAdmin.students.assessmentResults", "Academic Testing Portfolio")}
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ marginBottom: 16 }}>
                {[
                  { label: "LIA Benchmark", color: "#6366f1" },
                  { label: "PCA Diagnostics", color: "#8b5cf6" },
                  { label: "MIL Assessment", color: "#14b8a6" },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: "14px 16px", borderRadius: 6, textAlign: "center",
                    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: item.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)" }}>{"\u2014"}</div>
                  </div>
                ))}
              </div>

              <div style={{
                textAlign: "center", padding: "16px", borderRadius: 6,
                border: "1px dashed var(--admin-border-default)", color: "var(--admin-font-tertiary)", fontSize: 12,
              }}>
                {t("schoolAdmin.students.assessmentDesc", "Awaiting secure sync from district assessment repositories.")}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Add Note Form */}
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }} className="h-fit">
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
              }}>
                <Plus style={{ width: 14, height: 14, color: "#10b981" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {t("schoolAdmin.students.addNote", "New Entry")}
                </span>
              </div>
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
                    background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
                    border: "none", cursor: "pointer",
                    opacity: (!newNote.trim() || createNote.isPending) ? 0.6 : 1,
                  }}
                >
                  <Send style={{ width: 12, height: 12 }} />
                  {t("schoolAdmin.students.saveNote", "Publish to File")}
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="lg:col-span-2" style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--admin-bg-hover)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FileText style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                    {t("schoolAdmin.students.noteHistory", "Counselor File Ledger")}
                  </span>
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No file entries found</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
                      {t("schoolAdmin.students.noNotes", "There are currently no notes or documentation on file for this student.")}
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
            </div>
          </div>
        </TabsContent>

        {/* Extracurriculars / Community Service Tab */}
        <TabsContent value="graduation" className="mt-4">
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
              display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
            }}>
              <Heart style={{ width: 14, height: 14, color: "#ec4899" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Community Service Log</span>
            </div>
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
          </div>
        </TabsContent>

        {/* Parents & Guardians Tab */}
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
