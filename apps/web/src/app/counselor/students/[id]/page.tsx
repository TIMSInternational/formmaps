"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Mail,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Award,
  MessageSquare,
  Users,
  Bell,
  Clock,
  Send,
  Trash2,
  Target,
  LoaderCircle,
  Brain,
  CheckCircle2,
  Circle,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import type { NoteType, CounselorNote } from "@/types/counselorNotes";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-red-100 text-red-700",
  inactive: "bg-gray-100 text-gray-500",
};

const ASSESSMENT_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-gray-100 text-gray-500",
};

const PCA_EXAM_NAMES: Record<string, string> = {
  PatternRecognition: "Pattern Recognition",
  VerbalReasoning: "Verbal Reasoning",
  WorkingMemory: "Working Memory",
  NumericVelocity: "Numeric Velocity",
  VisualRotation: "Visual Rotation",
};

const PCA_EXAM_KEYS = [
  "PatternRecognition",
  "VerbalReasoning",
  "WorkingMemory",
  "NumericVelocity",
  "VisualRotation",
] as const;

export default function CounselorStudentDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const { data: student, isLoading, error } = useMyCounselorStudentDetail(studentId);
  const { data: notesData } = useStudentNotes(studentId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  // Course plan
  const { data: coursePlan, isLoading: planLoading } = useStudentCoursePlan(studentId);
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

  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");

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
        <h2 className="text-2xl font-bold text-gray-900">Student not found</h2>
        <Button onClick={() => router.push("/counselor/students")}>
          Back to Students
        </Button>
      </div>
    );
  }

  const notes: CounselorNote[] = notesData?.data ?? [];

  const initials = (student.name || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote.mutate(
      { studentId, content: newNote.trim(), type: noteType, isPrivate: false },
      { onSuccess: () => setNewNote("") }
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <Button
          variant="ghost"
          className="mb-2 hover:bg-gray-100"
          onClick={() => router.push("/counselor/students")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Students
        </Button>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-7 mt-2">
          <Avatar className="h-20 w-20 border-4 border-white shadow-lg shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
              <Badge className={cn("capitalize", STATUS_COLORS[student.status] || "bg-gray-100 text-gray-700")}>
                {student.status?.replace("_", " ")}
              </Badge>
              {student.alertCount > 0 && (
                <Badge className="bg-red-100 text-red-700 gap-1">
                  <Bell className="h-3 w-3" />
                  {student.alertCount} alert{student.alertCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex flex-col md:flex-row gap-4 text-gray-500 text-sm pt-1">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                {student.email}
              </div>
              <div className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                Grade {student.gradeLevel}
              </div>
              {student.careerPath && (
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-gray-400" />
                  {student.careerPath}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">GPA</CardTitle>
            <Award className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.gpa ? student.gpa.toFixed(2) : "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Credits</CardTitle>
            <BookOpen className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {student.creditProgress?.earned ?? "—"}/{student.creditProgress?.required ?? "—"}
            </div>
            {student.creditProgress && (
              <Progress
                value={student.creditProgress.percentage}
                className="h-1.5 mt-2"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Last Active</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {student.lastActive
                ? format(new Date(student.lastActive), "MMM d")
                : "Never"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Assessments</CardTitle>
            <TrendingUp className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 flex-wrap pt-1">
              {student.assessmentStatus
                ? Object.entries(student.assessmentStatus).map(([type, status]) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className={cn(
                        "text-xs capitalize",
                        ASSESSMENT_COLORS[status as string] || "bg-gray-100 text-gray-600"
                      )}
                    >
                      {type}
                    </Badge>
                  ))
                : <span className="text-sm text-gray-400">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="notes">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="notes">
            <MessageSquare className="h-4 w-4 mr-2" />
            Counselor Notes
          </TabsTrigger>
          <TabsTrigger value="assessments">
            <Brain className="h-4 w-4 mr-2" />
            Assessments
          </TabsTrigger>
          <TabsTrigger value="grades">
            <Award className="h-4 w-4 mr-2" />
            Grades
          </TabsTrigger>
          <TabsTrigger value="course-plan">
            <BookOpen className="h-4 w-4 mr-2" />
            Course Plan
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users className="h-4 w-4 mr-2" />
            Parents
          </TabsTrigger>
        </TabsList>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                Add Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={noteType}
                onValueChange={(v) => setNoteType(v as NoteType)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                  <SelectItem value="career">Career</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Type your note here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
              />
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.trim() || createNote.isPending}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {createNote.isPending ? "Saving…" : "Save Note"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Note History ({notes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No counselor notes yet for this student.
                </p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note: CounselorNote) => (
                    <div key={note.id} className="p-4 border rounded-xl space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {note.type}
                          </Badge>
                          {note.isPrivate && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                              Private
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {note.createdAt && format(new Date(note.createdAt), "MMM d, yyyy")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                            onClick={() => deleteNote.mutate({ noteId: note.id, studentId })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      {note.followUpDate && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Follow-up: {format(new Date(note.followUpDate), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments" className="mt-6 space-y-5">
          {assessmentsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {/* Overall Completion */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="h-4 w-4 text-violet-600" />
                    Overall Assessment Completion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const pct = assessmentProgress?.overallCompletion?.percentageComplete ?? 0;
                    const completed = assessmentProgress?.overallCompletion?.completedAssessments ?? 0;
                    const total = assessmentProgress?.overallCompletion?.totalAssessments ?? 3;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{completed}/{total} assessments completed</span>
                          <span className="font-semibold text-gray-900">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2.5" />
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* PCA Cognitive Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-indigo-600" />
                      PCA Cognitive Assessment
                    </div>
                    {(() => {
                      const examStatuses = milHistory?.examStatus ?? [];
                      const completedCount = examStatuses.filter(
                        (e: any) => e.status === "completed"
                      ).length;
                      return (
                        <span className="text-sm font-normal text-gray-500">
                          {completedCount}/5 completed
                        </span>
                      );
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PCA_EXAM_KEYS.map((examKey) => {
                      const displayName = PCA_EXAM_NAMES[examKey];
                      // Match by exam name from API data
                      const examStatuses = milHistory?.examStatus ?? [];
                      const match = examStatuses.find(
                        (e: any) =>
                          e.examName === displayName ||
                          e.examName?.replace(/\s+/g, "") === examKey
                      );
                      const status: string = match?.status ?? "not_started";
                      const statusLabel =
                        status === "completed"
                          ? "Completed"
                          : status === "in_progress"
                            ? "In Progress"
                            : "Not Started";
                      const StatusIcon =
                        status === "completed"
                          ? CheckCircle2
                          : status === "in_progress"
                            ? RotateCw
                            : Circle;
                      const iconColor =
                        status === "completed"
                          ? "text-emerald-500"
                          : status === "in_progress"
                            ? "text-amber-500"
                            : "text-gray-300";

                      return (
                        <div
                          key={examKey}
                          className="flex items-center justify-between p-3 border rounded-xl"
                        >
                          <div className="flex items-center gap-2.5">
                            <StatusIcon className={cn("h-4 w-4", iconColor)} />
                            <span className="text-sm font-medium text-gray-700">
                              {displayName}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              ASSESSMENT_COLORS[status] || "bg-gray-100 text-gray-500"
                            )}
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* MIL/LIA Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-teal-600" />
                      MIL / LIA Assessment
                    </div>
                    {(() => {
                      const status = assessmentProgress?.milAssessment?.status ?? "not_started";
                      const statusLabel =
                        status === "completed"
                          ? "Completed"
                          : status === "in_progress"
                            ? "In Progress"
                            : "Not Started";
                      return (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            ASSESSMENT_COLORS[status] || "bg-gray-100 text-gray-500"
                          )}
                        >
                          {statusLabel}
                        </Badge>
                      );
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const mil = assessmentProgress?.milAssessment;
                    const enhanced = mil?.enhancedData;
                    if (!mil || mil.status === "not_started") {
                      return (
                        <p className="text-sm text-gray-400 text-center py-4">
                          Student has not started the MIL/LIA assessment.
                        </p>
                      );
                    }
                    return (
                      <div className="flex items-center gap-6 text-sm">
                        {enhanced && (
                          <>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exams</p>
                              <p className="text-lg font-bold text-gray-900 mt-0.5">
                                {enhanced.completedExams}/{enhanced.totalExams}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completion</p>
                              <p className="text-lg font-bold text-gray-900 mt-0.5">
                                {Math.round(enhanced.completionPercentage)}%
                              </p>
                            </div>
                          </>
                        )}
                        {mil.progress?.averageScore > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</p>
                            <p className="text-lg font-bold text-gray-900 mt-0.5">
                              {Math.round(mil.progress.averageScore)}%
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* 360° Evaluation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      360° Evaluation
                    </div>
                    {(() => {
                      const status = assessmentProgress?.evaluationAssessment?.status ?? "not_started";
                      const statusLabel =
                        status === "completed"
                          ? "Completed"
                          : status === "in_progress"
                            ? "In Progress"
                            : "Not Started";
                      return (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            ASSESSMENT_COLORS[status] || "bg-gray-100 text-gray-500"
                          )}
                        >
                          {statusLabel}
                        </Badge>
                      );
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const evalData = assessmentProgress?.evaluationAssessment;
                    const groups = evalGroups ?? evalData?.evaluationGroups ?? [];
                    if (!groups.length) {
                      return (
                        <p className="text-sm text-gray-400 text-center py-4">
                          No evaluators have been added yet.
                        </p>
                      );
                    }
                    const completedCount = groups.filter(
                      (g: any) => g.isEvaluationCompleted
                    ).length;
                    return (
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evaluators</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {completedCount}/{groups.length} completed
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Response Rate</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {groups.length > 0
                              ? Math.round((completedCount / groups.length) * 100)
                              : 0}%
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Grades Tab */}
        <TabsContent value="grades" className="mt-6 space-y-5">
          {/* GPA Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-amber-600" />
                GPA Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gpaData ? (
                <div className="space-y-3">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Weighted GPA</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {gpaData.gpaWeighted?.toFixed(2) ?? "\u2014"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unweighted GPA</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {gpaData.gpaUnweighted?.toFixed(2) ?? "\u2014"}
                      </p>
                    </div>
                    {gpaData.classRank && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Class Rank</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          #{gpaData.classRank}{" "}
                          <span className="text-sm text-gray-400 font-normal">/ {gpaData.classSize}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Total Credits: {gpaData.totalCredits}
                    {gpaData.computedAt && ` | Last computed: ${format(new Date(gpaData.computedAt), "MMM d, yyyy")}`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No GPA data computed yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Transcript / Grades Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-indigo-600" />
                Transcript
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transcriptData?.grades && Object.keys(transcriptData.grades).length > 0 ? (
                <div className="space-y-5">
                  {Object.entries(transcriptData.grades)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([year, courses]) => (
                      <div key={year}>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-100">
                          {year}
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 uppercase">
                                <th className="text-left py-1.5 pr-3 font-medium">Code</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Course</th>
                                <th className="text-center py-1.5 pr-3 font-medium">Credits</th>
                                <th className="text-center py-1.5 pr-3 font-medium">Grade</th>
                                <th className="text-center py-1.5 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(courses as any[]).map((c: any) => (
                                <tr key={c.id} className="border-t border-gray-50">
                                  <td className="py-1.5 pr-3 text-gray-600 font-medium">{c.courseCode || "N/A"}</td>
                                  <td className="py-1.5 pr-3 text-gray-700">{c.courseLevel || "Regular"}</td>
                                  <td className="py-1.5 pr-3 text-center text-gray-500">{c.credits}</td>
                                  <td className={cn(
                                    "py-1.5 pr-3 text-center font-semibold",
                                    c.grade === "A" || c.grade === "A+" || c.grade === "A-" ? "text-emerald-600" :
                                    c.grade === "B" || c.grade === "B+" || c.grade === "B-" ? "text-blue-600" :
                                    c.grade === "F" ? "text-red-600" : "text-gray-700"
                                  )}>
                                    {c.grade || (c.status === "in_progress" ? "IP" : "\u2014")}
                                  </td>
                                  <td className="py-1.5 text-center">
                                    <Badge variant="secondary" className={cn(
                                      "text-xs capitalize",
                                      c.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                                      c.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                                      "bg-gray-100 text-gray-600"
                                    )}>
                                      {c.status?.replace("_", " ") || "enrolled"}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">
                  No transcript data available for this student.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Course Plan Tab */}
        <TabsContent value="course-plan" className="mt-6 space-y-6">
          {/* Pending change requests from student */}
          {pendingRequests.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Student Change Requests ({pendingRequests.length} pending)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between bg-white rounded-lg border border-amber-100 px-4 py-3 text-sm"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {req.action}
                        </Badge>
                        <span className="font-medium truncate">{req.courseName}</span>
                        <span className="text-gray-400 text-xs">
                          {req.courseCode} · {req.credits} cr · Gr.{req.gradeLevel} · {req.semester}
                        </span>
                      </div>
                      {req.studentNote && (
                        <p className="text-xs text-gray-500 italic">
                          &ldquo;{req.studentNote}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        onClick={() =>
                          reviewRequest.mutate({
                            requestId: req.id,
                            payload: { status: "approved" },
                          })
                        }
                        disabled={reviewRequest.isPending}
                      >
                        {reviewRequest.isPending && reviewRequest.variables?.requestId === req.id && reviewRequest.variables?.payload.status === "approved" ? (
                          <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : null}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-red-300 text-red-600 hover:bg-red-50 text-xs"
                        onClick={() =>
                          reviewRequest.mutate({
                            requestId: req.id,
                            payload: { status: "rejected" },
                          })
                        }
                        disabled={reviewRequest.isPending}
                      >
                        {reviewRequest.isPending && reviewRequest.variables?.requestId === req.id && reviewRequest.variables?.payload.status === "rejected" ? (
                          <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : null}
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Sequence Builder — counselor direct edit mode */}
          <SequenceBuilder
            planData={coursePlan}
            isLoading={planLoading}
            mode="counselor"
            onCounselorAdd={(payload) => counselorAdd.mutate(payload)}
            onCounselorRemove={(enrollmentId) => counselorRemove.mutate(enrollmentId)}
            isCounselorAddPending={counselorAdd.isPending}
            isCounselorRemovePending={counselorRemove.isPending}
            recommendations={recsData}
            academicGaps={gapsData}
          />
        </TabsContent>

        {/* Parents Tab */}
        <TabsContent value="parents" className="mt-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <InviteParentPanel studentId={studentId} studentName={student.name} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

