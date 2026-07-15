"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Mail,
  Calendar,
  Award,
  BookOpen,
  AlertCircle,
  GraduationCap,
  FileText,
  MessageSquare,
  User,
  Users,
  Activity,
  Brain,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteParentPanel } from "@/components/school-admin/InviteParentPanel";
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
  useStudentPCAResult,
  useRegisterPCA,
  useStudentEvalGroups,
  useStudentRecommendations,
  useStudentTranscript,
  useStudentGpa,
  useStudentAcademicGaps,
} from "@/hooks/useStudentDetailData";
import { getInitials as _getInitials } from "@/lib/stringUtils";

import { format } from "date-fns";
import { StudentStatus } from "@/types/student";

import { OverviewTab } from "./_components/overview-tab";
import { AssessmentsTab } from "./_components/assessments-tab";
import { AcademicsTab } from "./_components/academics-tab";
import { NotesTab } from "./_components/notes-tab";
import { ExtracurricularsTab } from "./_components/extracurriculars-tab";

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

  const { data: milData } = useStudentMILResults(studentId);
  const { data: pcaDISC, isLoading: pcaDISCLoading } = useStudentPCAResult(studentId);
  const registerPCA = useRegisterPCA(studentId);
  const { data: evalGroups } = useStudentEvalGroups(studentId);
  const { data: gapsData } = useStudentAcademicGaps(studentId);
  const { data: recsData } = useStudentRecommendations(studentId);
  const { data: transcriptData } = useStudentTranscript(studentId);
  const { data: gpaData } = useStudentGpa(studentId);

  const getInitials = (name: string) => name ? _getInitials(name) : "ST";

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
            background: "var(--admin-accent-blue, #2E9098)", color: "#fff",
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
      accepted: { bg: "rgba(59,130,246,0.1)", color: "#2E9098" },
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

  const milCompleted = milData ? milData.completedExams : 0;
  const milTotal = milData ? milData.totalExams : 5;
  const pcaCompleted = pcaDISC?.pcaD1 != null ? 1 : 0;
  const pcaTotal = 1;
  const evalTotal = evalGroups?.length ?? 0;
  const evalCompleted = evalGroups?.filter((g) => g.isEvaluationCompleted).length ?? 0;

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
        <ArrowLeft style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #2E9098)" }} />
        {t("schoolAdmin.students.backToList", "Back to Student Roster")}
      </button>

      {/* Profile Banner */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <Avatar className="h-28 w-28" style={{ borderRadius: "50%", border: "3px solid var(--admin-border-default)" }}>
          <AvatarImage src={student.avatar || ""} className="object-cover" />
          <AvatarFallback style={{ borderRadius: "50%", background: "#102B47", color: "#fff", fontSize: 36, fontWeight: 600 }}>
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
            {(student as unknown as { gradeLevel?: string }).gradeLevel && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--admin-font-secondary)" }}>
                <GraduationCap style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                <span>Grade {(student as unknown as { gradeLevel?: string }).gradeLevel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right-aligned meta */}
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
          { label: "Credits", value: `${plan?.graduationProgress?.totalCreditsEarned ?? gpaData?.totalCredits ?? "0"} / ${plan?.graduationProgress?.totalCreditsRequired ?? "0"}`, icon: GraduationCap, color: "#2E9098" },
          { label: "Assessments", value: `${milCompleted + pcaCompleted + evalCompleted} / ${milTotal + pcaTotal + evalTotal}`, icon: FileText, color: "#14b8a6" },
          { label: "Last Seen", value: student.lastActive ? format(new Date(student.lastActive), "MMM do") : "Never", icon: Activity, color: "#2E9098" },
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

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            graduationProgress={plan?.graduationProgress}
            gpaData={gpaData}
            milCompleted={milCompleted}
            milTotal={milTotal}
            pcaCompleted={pcaCompleted}
            pcaTotal={pcaTotal}
            evalCompleted={evalCompleted}
            evalTotal={evalTotal}
            evalGroups={evalGroups}
          />
        </TabsContent>

        <TabsContent value="assessments" className="mt-4">
          <AssessmentsTab
            milData={milData}
            pcaDISC={pcaDISC}
            pcaDISCLoading={pcaDISCLoading}
            registerPCA={registerPCA}
            student={{ id: student.id, name: student.name, email: student.email }}
          />
        </TabsContent>

        <TabsContent value="courses" className="mt-4">
          <AcademicsTab
            pendingRequests={pendingRequests}
            reviewRequest={reviewRequest}
            gapsData={gapsData}
            recsData={recsData}
            transcriptData={transcriptData}
            coursePlan={coursePlan}
            adminAdd={adminAdd}
            adminRemove={adminRemove}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesTab
            studentId={studentId}
            notes={notes}
            createNote={createNote}
            deleteNote={deleteNote}
          />
        </TabsContent>

        <TabsContent value="graduation" className="mt-4">
          <ExtracurricularsTab csData={csData} verifyEntry={verifyEntry} />
        </TabsContent>

        <TabsContent value="parents" className="mt-4">
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: "20px 24px",
          }}>
            <InviteParentPanel studentId={studentId} studentName={student.name} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
