"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Bell, MessageSquare, Brain, Award, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteParentPanel } from "@/components/school-admin/InviteParentPanel";
import { useMyCounselorStudentDetail } from "@/hooks/useSchoolProfileQueries";
import {
  useStudentNotes,
  useCreateNote,
  useDeleteNote,
} from "@/hooks/useCounselorNotesQueries";
import {
  useStudentCoursePlan,
  useCounselorAddCourse,
  useCounselorRemoveCourse,
  useStudentChangeRequests,
  useReviewChangeRequest,
} from "@/hooks/useCoursePlanQueries";
import {
  useStudentRecommendations,
  useStudentAcademicGaps,
  useStudentTranscript,
  useStudentGpa,
} from "@/hooks/useStudentDetailData";
import {
  useAssessmentProgress,
  useMILHistory,
  useEvaluationGroups,
} from "@/hooks/useAssessmentQueries";
import type { CounselorNote } from "@/types/counselorNotes";

import { StudentProfileHeader } from "./_components/StudentProfileHeader";
import { StudentStatCards } from "./_components/StudentStatCards";
import { NotesTab } from "./_components/NotesTab";
import { AssessmentsTab } from "./_components/AssessmentsTab";
import { GradesTab } from "./_components/GradesTab";
import { CoursePlanTab } from "./_components/CoursePlanTab";

export default function CounselorStudentDetailPage() {
  const router = useRouter();
  const { t } = useTranslation("counselor");
  const params = useParams();
  const studentId = params.id as string;

  const { data: student, isLoading, error } = useMyCounselorStudentDetail(studentId);
  const { data: notesData } = useStudentNotes(studentId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  // Course plan. formmaps#95: the counselor read endpoint returns rows carrying no
  // gradeLevel of their own, so the student's own grade is what places them in the
  // grid. Passed from here rather than resolved inside the service because this page
  // is what knows the student.
  const { data: coursePlan, isLoading: planLoading } = useStudentCoursePlan(
    studentId,
    student?.gradeLevel
  );
  const counselorAdd = useCounselorAddCourse(studentId);
  const counselorRemove = useCounselorRemoveCourse(studentId);
  const { data: recsData } = useStudentRecommendations(studentId);
  const { data: gapsData } = useStudentAcademicGaps(studentId);
  const { data: transcriptData } = useStudentTranscript(studentId);
  const { data: gpaData } = useStudentGpa(studentId);
  const { data: changeRequestsData } = useStudentChangeRequests(studentId, "pending");
  const reviewRequest = useReviewChangeRequest(studentId);
  const pendingRequests = changeRequestsData?.data ?? [];

  // Assessment data
  const { data: assessmentProgress, isLoading: assessmentsLoading } = useAssessmentProgress(studentId);
  const { data: milHistory } = useMILHistory(studentId);
  const { data: evalGroups } = useEvaluationGroups(studentId);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20 space-y-4">
        <Bell className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-2xl font-bold text-gray-900">{t("studentDetail.notFound", "Student not found")}</h2>
        <Button onClick={() => router.push("/counselor/students")}>
          {t("studentDetail.backToStudents", "Back to Students")}
        </Button>
      </div>
    );
  }

  const notes: CounselorNote[] = notesData?.data ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <StudentProfileHeader
        student={student}
        onBack={() => router.push("/counselor/students")}
      />

      <StudentStatCards student={student} />

      <Tabs defaultValue="notes">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="notes">
            <MessageSquare className="h-4 w-4 mr-2" />
            {t("studentDetail.tabNotes", "Counselor Notes")}
          </TabsTrigger>
          <TabsTrigger value="assessments">
            <Brain className="h-4 w-4 mr-2" />
            {t("studentDetail.tabAssessments", "Assessments")}
          </TabsTrigger>
          <TabsTrigger value="grades">
            <Award className="h-4 w-4 mr-2" />
            {t("studentDetail.tabGrades", "Grades")}
          </TabsTrigger>
          <TabsTrigger value="course-plan">
            <BookOpen className="h-4 w-4 mr-2" />
            {t("studentDetail.tabCoursePlan", "Course Plan")}
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users className="h-4 w-4 mr-2" />
            {t("studentDetail.tabParents", "Parents")}
          </TabsTrigger>
        </TabsList>

        <NotesTab
          studentId={studentId}
          notes={notes}
          createNote={createNote}
          deleteNote={deleteNote}
        />

        <AssessmentsTab
          isLoading={assessmentsLoading}
          assessmentProgress={assessmentProgress as never}
          milHistory={milHistory}
          evalGroups={evalGroups}
        />

        <GradesTab gpaData={gpaData ?? undefined} transcriptData={transcriptData} />

        <CoursePlanTab
          studentId={studentId}
          studentGradeLevel={student.gradeLevel}
          coursePlan={coursePlan}
          planLoading={planLoading}
          pendingRequests={pendingRequests}
          reviewRequest={reviewRequest as never}
          counselorAdd={counselorAdd as never}
          counselorRemove={counselorRemove}
          recommendations={recsData}
          academicGaps={gapsData}
        />

        <TabsContent value="parents" className="mt-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <InviteParentPanel studentId={studentId} studentName={student.name} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
