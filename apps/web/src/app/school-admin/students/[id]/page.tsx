"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
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
      <div className="max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-48 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-[600px] rounded-3xl" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20 space-y-6">
        <div className="inline-flex items-center justify-center p-6 bg-red-50 rounded-full border border-red-100 shadow-sm">
          <AlertCircle className="h-12 w-12 text-red-500" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900">
          {t("schoolAdmin.students.error.title", "Student Profile Not Found")}
        </h2>
        <p className="text-gray-500 max-w-md mx-auto">
          {t(
            "schoolAdmin.students.error.description",
            "The student record you are trying to access does not exist or may have been removed."
          )}
        </p>
        <Button onClick={() => router.push("/school-admin/students")} className="bg-gray-900 hover:bg-black rounded-xl h-11 px-8 text-white shadow-md">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("schoolAdmin.students.backToList", "Return to Students Roster")}
        </Button>
      </div>
    );
  }

  const getStatusBadge = (status: StudentStatus) => {
    const styles = {
      active: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
      accepted: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
      inactive: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
    };
    const style = styles[status] || styles.inactive;
    return (
      <Badge className={`${style.bg} ${style.text} ${style.border} border shadow-none font-bold uppercase tracking-wider px-2.5 py-1 text-[10px]`}>
        {t(`schoolAdmin.students.status.${student.status}`, student.status.charAt(0).toUpperCase() + student.status.slice(1))}
      </Badge>
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
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Back button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <Button
          variant="ghost"
          className="mb-2 hover:bg-white/60 bg-white/40 backdrop-blur-sm border border-gray-200/50 rounded-xl px-4 py-2 font-semibold text-gray-700 shadow-sm"
          onClick={() => router.push("/school-admin/students")}
        >
          <ArrowLeft className="mr-2 h-4 w-4 text-indigo-500" />
          {t("schoolAdmin.students.backToList", "Back to Student Roster")}
        </Button>
      </motion.div>

      {/* Hero Profile Banner */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-[2rem] border border-gray-200/50 shadow-xl shadow-gray-200/20">
          {/* Background Gradients */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-rose-200/20 rounded-full blur-3xl opacity-70 -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-cyan-200/40 to-emerald-200/20 rounded-full blur-3xl opacity-60 translate-y-1/3 -translate-x-1/4" />

          <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start gap-8 z-10">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-500" />
              <Avatar className="relative h-32 w-32 border-4 border-white shadow-xl rounded-[2rem]">
                <AvatarImage src={student.avatar || ""} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-4xl font-black rounded-[2rem]">
                  {getInitials(student.name)}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                  {student.name}
                </h1>
                {getStatusBadge(student.status)}
              </div>

              <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm font-medium">
                <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
                  <Mail className="h-4 w-4 text-indigo-500" />
                  <span className="text-gray-700">{student.email}</span>
                </div>
                {(student.createdAt || student.joinedAt) && (
                  <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    <span className="text-gray-700">
                      {t("schoolAdmin.students.joined", "Joined")} {format(new Date(student.createdAt || student.joinedAt!), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                {student.id && (
                  <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span className="text-gray-700 font-mono text-xs">ID: {student.id.substring(0, 8).toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Overview Stats Carousel */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6 relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-teal-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center mb-4 border border-teal-200/50 shadow-inner">
                <BookOpen className="h-6 w-6 text-teal-600" />
              </div>
              <p className="text-4xl font-black text-gray-900 tracking-tight">{student.progress}%</p>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">{t("schoolAdmin.students.progress", "Course Progress")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6 relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-4 border border-amber-200/50 shadow-inner">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
              <p className="text-4xl font-black text-gray-900 tracking-tight">{student.averageScore?.toFixed(1) ?? "—"}%</p>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">{t("schoolAdmin.students.avgScore", "Average Score")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6 relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-inner">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-baseline gap-1">
                <p className="text-4xl font-black tracking-tight">{plan?.graduationProgress?.totalCreditsEarned ?? "0"}</p>
                <p className="text-xl font-medium text-indigo-100">/ {plan?.graduationProgress?.totalCreditsRequired ?? "0"}</p>
              </div>
              <p className="text-sm font-bold text-indigo-100 uppercase tracking-wider mt-1">{t("schoolAdmin.students.credits", "Earned Credits")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6 relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 border border-blue-200/50 shadow-inner">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-3xl font-black text-gray-900 tracking-tight mt-1">
                {student.lastActive ? format(new Date(student.lastActive), "MMM do") : <span className="text-2xl text-gray-400">Never</span>}
              </p>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-2.5">{t("schoolAdmin.students.lastActive", "Last Seen")}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Tabs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-white/60 backdrop-blur-xl border border-gray-200/50 p-1.5 rounded-2xl h-auto flex flex-wrap shadow-sm">
            <TabsTrigger value="overview" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <User className="w-4 h-4 mr-2" /> Snapshot
            </TabsTrigger>
            <TabsTrigger value="courses" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <BookOpen className="w-4 h-4 mr-2" /> Enrollments
            </TabsTrigger>
            <TabsTrigger value="assessments" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <FileText className="w-4 h-4 mr-2" /> Testing
            </TabsTrigger>
            <TabsTrigger value="notes" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <MessageSquare className="w-4 h-4 mr-2" /> Records
            </TabsTrigger>
            <TabsTrigger value="graduation" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <Award className="w-4 h-4 mr-2" /> Extracurriculars
            </TabsTrigger>
            <TabsTrigger value="parents" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-md transition-all text-gray-600">
              <Users className="w-4 h-4 mr-2" /> Guardians
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Graduation Progress */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-6">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2.5 bg-indigo-100 rounded-xl">
                      <GraduationCap className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t("schoolAdmin.students.graduationProgress", "Graduation Pathway")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {plan?.graduationProgress ? (
                    <>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t("schoolAdmin.students.creditsProgress", "Credits Acquired")}</p>
                          <p className="text-3xl font-black text-gray-900 mt-1">
                            {plan.graduationProgress.totalCreditsEarned} <span className="text-lg text-gray-400 font-medium">/ {plan.graduationProgress.totalCreditsRequired} req.</span>
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "px-3 py-1 text-sm font-bold border",
                            plan.graduationProgress.isOnTrack
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          {plan.graduationProgress.isOnTrack
                            ? t("schoolAdmin.students.onTrack", "On Track")
                            : t("schoolAdmin.students.atRisk", "At Risk")}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <Progress
                          value={plan.graduationProgress.totalCreditsRequired ? (plan.graduationProgress.totalCreditsEarned / plan.graduationProgress.totalCreditsRequired) * 100 : 0}
                          className="h-3 rounded-full bg-gray-100"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-gray-500 font-medium">Graduation data is not fully calculated yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Career Path */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-6">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2.5 bg-purple-100 rounded-xl">
                      <Target className="h-5 w-5 text-purple-600" />
                    </div>
                    {t("schoolAdmin.students.careerPath", "Career Affinities")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <div className="p-4 bg-gray-50 rounded-full">
                      <Target className="h-8 w-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium max-w-[250px]">
                      {t("schoolAdmin.students.careerPathDesc", "No career assessment data available from the external integration yet.")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 360 Evaluation Status */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden md:col-span-2">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-6">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2.5 bg-teal-100 rounded-xl">
                      <TrendingUp className="h-5 w-5 text-teal-600" />
                    </div>
                    {t("schoolAdmin.students.evaluationStatus", "360° Diagnostics")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 flex flex-col items-center justify-center py-10">
                  <div className="p-4 bg-gray-50 rounded-full mb-4">
                    <TrendingUp className="h-10 w-10 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium text-center max-w-sm mb-6">
                    {t("schoolAdmin.students.evaluationStatusDesc", "Comprehensive behavioral and academic 360-degree reviews will populate here when completed.")}
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-xl border-gray-200 font-bold hover:bg-gray-50"
                    onClick={() => router.push("/school-admin/evaluations")}
                  >
                    {t("schoolAdmin.students.viewEvaluations", "Go to Evaluations Hub")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Courses Tab */}
          <TabsContent value="courses" className="mt-6 space-y-6">
            {/* Pending change requests */}
            <AnimatePresence>
              {pendingRequests.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl overflow-hidden">
                    <CardHeader className="border-b border-amber-100/50 py-5">
                      <CardTitle className="flex items-center gap-2 text-xl text-amber-800">
                        <AlertCircle className="h-6 w-6" />
                        {t("schoolAdmin.students.pendingRequests", "Action Required: Course Requests")} <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-sm ml-2">{pendingRequests.length} pending</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      {pendingRequests.map((req: any) => (
                        <div key={req.id} className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white rounded-2xl p-5 shadow-sm border border-amber-100 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <Badge className={req.action === 'add' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shadow-none' : 'bg-red-100 text-red-700 hover:bg-red-100 shadow-none'}>
                                {req.action === "add" ? "Enrollment Request" : "Drop Request"}
                              </Badge>
                              <p className="font-bold text-gray-900 text-lg truncate">
                                {req.courseName}
                              </p>
                            </div>
                            <p className="text-sm font-medium text-gray-500 mt-2 flex items-center gap-2">
                              <span className="bg-gray-100 px-2 py-1 rounded-md">{req.courseCode}</span>
                              <span className="bg-gray-100 px-2 py-1 rounded-md">Grade {req.gradeLevel}</span>
                              <span className="bg-gray-100 px-2 py-1 rounded-md">{req.semester}</span>
                            </p>
                            {req.studentNote && (
                              <div className="mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <p className="text-sm text-gray-700 italic flex items-start gap-2">
                                  <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                  "{req.studentNote}"
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                            <Button
                              className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm font-bold"
                              disabled={reviewRequest.isPending}
                              onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "approved" } })}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              {t("common.approve", "Approve")}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 md:flex-none border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl font-bold bg-white shadow-sm"
                              disabled={reviewRequest.isPending}
                              onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "rejected" } })}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              {t("common.reject", "Deny")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sequence Builder */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardContent className="p-0">
                <SequenceBuilder
                  planData={coursePlan}
                  isLoading={false}
                  mode="counselor"
                  onCounselorAdd={(payload) => adminAdd.mutate(payload)}
                  onCounselorRemove={(enrollmentId) => adminRemove.mutate(enrollmentId)}
                  isCounselorAddPending={adminAdd.isPending}
                  isCounselorRemovePending={adminRemove.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assessments Tab */}
          <TabsContent value="assessments" className="mt-6">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2.5 bg-indigo-100 rounded-xl">
                    <FileText className="h-5 w-5 text-indigo-600" />
                  </div>
                  {t("schoolAdmin.students.assessmentResults", "Academic Testing Portfolio")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 shadow-sm text-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-100 rounded-bl-full opacity-50 group-hover:scale-110 transition-transform" />
                    <p className="text-sm text-indigo-600 font-bold uppercase tracking-wider mb-2">LIA Benchmark</p>
                    <p className="text-4xl font-black text-indigo-900">—</p>
                  </div>
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-100 shadow-sm text-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-100 rounded-bl-full opacity-50 group-hover:scale-110 transition-transform" />
                    <p className="text-sm text-purple-600 font-bold uppercase tracking-wider mb-2">PCA Diagnostics</p>
                    <p className="text-4xl font-black text-purple-900">—</p>
                  </div>
                  <div className="p-6 bg-gradient-to-br from-teal-50 to-white rounded-2xl border border-teal-100 shadow-sm text-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-teal-100 rounded-bl-full opacity-50 group-hover:scale-110 transition-transform" />
                    <p className="text-sm text-teal-600 font-bold uppercase tracking-wider mb-2">MIL Assessment</p>
                    <p className="text-4xl font-black text-teal-900">—</p>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-6 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-gray-500 font-medium text-center">
                    {t("schoolAdmin.students.assessmentDesc", "Awaiting secure sync from district assessment repositories.")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Counselor Notes Tab */}
          <TabsContent value="notes" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add Note Form */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden lg:col-span-1 h-fit sticky top-6">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-5">
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Plus className="h-4 w-4 text-emerald-600" />
                    </div>
                    {t("schoolAdmin.students.addNote", "New Entry")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Category</label>
                    <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                      <SelectTrigger className="w-full bg-gray-50 border-gray-200 rounded-xl h-11 focus:ring-emerald-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-gray-200 shadow-xl">
                        <SelectItem value="general" className="rounded-lg my-1">General Observation</SelectItem>
                        <SelectItem value="meeting" className="rounded-lg my-1">Meeting Summary</SelectItem>
                        <SelectItem value="follow_up" className="rounded-lg my-1">Action items / Follow-up</SelectItem>
                        <SelectItem value="academic" className="rounded-lg my-1">Academic Intervention</SelectItem>
                        <SelectItem value="career" className="rounded-lg my-1">Career Guidance</SelectItem>
                        <SelectItem value="personal" className="rounded-lg my-1">Personal / Social</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Notes</label>
                    <Textarea
                      placeholder={t("schoolAdmin.students.notePlaceholder", "Document interaction details here...")}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={5}
                      className="bg-gray-50 border-gray-200 rounded-xl resize-none focus-visible:ring-emerald-500"
                    />
                  </div>

                  <Button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || createNote.isPending}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 shadow-md font-bold"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {t("schoolAdmin.students.saveNote", "Publish to File")}
                  </Button>
                </CardContent>
              </Card>

              {/* Notes List */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden lg:col-span-2">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-5 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    {t("schoolAdmin.students.noteHistory", "Counselor File Ledger")}
                    <span className="bg-gray-200 text-gray-700 text-xs py-0.5 px-2 rounded-full ml-2">{notes.length} entries</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {notes.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                        <MessageSquare className="w-8 h-8 text-gray-300" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">No file entries found</h3>
                      <p className="text-gray-500">
                        {t("schoolAdmin.students.noNotes", "There are currently no notes or documentation on file for this student.")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {notes.map((note: CounselorNote) => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={note.id} className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow group relative">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200 uppercase tracking-wide font-bold px-2 py-0.5 shadow-none">
                                {note.type.replace('_', ' ')}
                              </Badge>
                              {note.isPrivate && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 shadow-none border border-amber-200 cursor-help" title="Visible only to counselors">
                                  Confidential
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs font-semibold text-gray-400">
                              {note.createdAt && format(new Date(note.createdAt), "MMM d, yyyy · h:mm a")}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-gray-300 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                onClick={() => deleteNote.mutate({ noteId: note.id, studentId })}
                                title="Delete entry"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100/50">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {note.content}
                            </p>
                          </div>

                          {note.followUpDate && (
                            <div className="mt-4 flex items-center gap-1.5 p-2 bg-amber-50 rounded-lg w-fit border border-amber-100/50">
                              <Clock className="h-4 w-4 text-amber-600" />
                              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                                Follow-up: {format(new Date(note.followUpDate), "MMM d, yyyy")}
                              </p>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Graduation Tab */}
          <TabsContent value="graduation" className="mt-6">
            {/* Community Service */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-pink-50 to-rose-50 border-b border-pink-100 py-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2.5 bg-pink-100 rounded-xl shadow-inner">
                    <Heart className="h-5 w-5 text-pink-600 fill-pink-600/20" />
                  </div>
                  Community Service Log
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {/* Progress */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-8">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Service Requirement</p>
                      <p className="text-3xl font-black text-gray-900 mt-1">
                        {csData?.totalHoursVerified ?? 0} <span className="text-lg text-gray-400 font-medium">/ {csData?.totalHoursRequired ?? 40} hrs</span>
                      </p>
                    </div>
                    <div className="p-3 bg-pink-50 rounded-full border border-pink-100">
                      <Heart className="w-6 h-6 text-pink-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Progress
                      value={((csData?.totalHoursVerified ?? 0) / (csData?.totalHoursRequired ?? 40)) * 100}
                      className="h-4 rounded-full bg-gray-100 [&>div]:bg-pink-500"
                    />
                    <div className="flex justify-between text-xs font-bold text-gray-400 uppercase">
                      <span>0 hrs</span>
                      <span>Goal: {csData?.totalHoursRequired ?? 40} hrs</span>
                    </div>
                  </div>
                </div>

                {/* Entries */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-2">Activity Ledger</h3>
                  {csData?.entries && csData.entries.length > 0 ? (
                    <div className="space-y-3">
                      {csData.entries.map((entry) => {
                        const isPending = entry.status === "pending";
                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              "p-5 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-md",
                              entry.status === "verified" && "bg-white border-emerald-100",
                              entry.status === "pending" && "bg-amber-50/50 border-amber-200 shadow-amber-100/20",
                              entry.status === "rejected" && "bg-gray-50 border-gray-200 opacity-75"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <p className="font-bold text-gray-900 text-lg">{entry.organization}</p>
                                {entry.status === "verified" && <Badge className="bg-emerald-100 text-emerald-800 border-0 shadow-none hover:bg-emerald-100">Verified</Badge>}
                                {entry.status === "rejected" && <Badge className="bg-gray-200 text-gray-600 border-0 shadow-none hover:bg-gray-200">Rejected</Badge>}
                              </div>

                              <div className="flex items-center gap-4 text-sm font-medium text-gray-500 mt-2">
                                <span className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                  {entry.hours} hours
                                </span>
                                <span className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                                  <Calendar className="w-3.5 h-3.5 text-purple-500" />
                                  {format(new Date(entry.date), "MMM d, yyyy")}
                                </span>
                              </div>

                              {entry.description && (
                                <p className="text-sm text-gray-600 mt-3 bg-white p-3 rounded-xl border border-gray-100/50 leading-relaxed max-w-3xl">
                                  {entry.description}
                                </p>
                              )}
                            </div>

                            {isPending && (
                              <div className="flex sm:flex-col gap-2 shrink-0 bg-white p-2 rounded-xl border border-amber-100 shadow-sm">
                                <p className="hidden sm:block text-[10px] font-bold text-amber-600 uppercase tracking-widest text-center px-2 py-1 bg-amber-50 rounded-lg">Pending Review</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 px-4 text-sm font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 rounded-lg"
                                  disabled={verifyEntry.isPending}
                                  onClick={() => verifyEntry.mutate({ entryId: entry.id, payload: { status: "verified" } })}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 px-4 text-sm font-bold border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300 rounded-lg"
                                  disabled={verifyEntry.isPending}
                                  onClick={() => verifyEntry.mutate({ entryId: entry.id, payload: { status: "rejected" } })}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <Heart className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium text-sm">No community service entries logged yet.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parents & Guardians Tab */}
          <TabsContent value="parents" className="mt-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-gray-200/50 shadow-lg relative overflow-hidden">
              {/* Decorative background elements matching the panel design */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-50 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2 pointer-events-none" />

              <div className="relative z-10">
                <InviteParentPanel
                  studentId={studentId}
                  studentName={student.name}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
