"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityFeed, type ActivityItem } from "@/components/ui/activity-feed";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  CalendarClock,
  FileText,
  Bell,
  TrendingDown,
  ChevronRight,
  Search,
  BookOpen,
  Clock,
  Radar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCounselorDashboard, useCounselorPendingChangeRequests } from "@/hooks/useCounselorDashboard";
import { useMyCounselorStudents } from "@/hooks/useSchoolProfileQueries";
import { useReviewChangeRequest } from "@/hooks/useCoursePlanQueries";
import { getMyCounselorSessions } from "@/services/counselorSessionService";
import type { CounselorSession } from "@/services/counselorSessionService";

export default function CounselorDashboardPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [rightTab, setRightTab] = useState<"followups" | "requests">("followups");
  const [upcomingSessions, setUpcomingSessions] = useState<CounselorSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    getMyCounselorSessions({ status: "confirmed", limit: 3 })
      .then(res => setUpcomingSessions(res.data))
      .catch((err) => console.error("Failed to load counselor sessions:", err))
      .finally(() => setLoadingSessions(false));
  }, []);

  const { data: dashData, isLoading: dashLoading } = useCounselorDashboard();
  const { data: studentsData, isLoading: studentsLoading } =
    useMyCounselorStudents({ limit: 50, search: search || undefined });
  const { data: changeRequestsData, isLoading: crLoading } =
    useCounselorPendingChangeRequests();

  const router = useRouter();

  const students = (studentsData as any)?.data ?? [];
  const totalStudents =
    (studentsData as any)?.total ?? (dashData as any)?.assignedCount ?? 0;
  const pendingFollowUps = (dashData as any)?.followUps ?? 0;
  const recentNotesCount = (dashData as any)?.recentNotes?.length ?? 0;
  const overdueFollowUps = (dashData as any)?.overdueFollowUps ?? 0;

  const changeRequests: any[] = (changeRequestsData as any)?.data ?? [];
  const pendingCRCount = (changeRequestsData as any)?.total ?? changeRequests.length;

  const isLoading = dashLoading || studentsLoading;

  // Per-request review — we pass studentId dynamically so we instantiate a shared one
  // and call the underlying service via the hook in a child component pattern.
  // For inline we'll use a simple state-based approach with the counselor change-requests invalidation.

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          {t("counselor.dashboard.badge", "Counselor")}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
          {t("counselor.dashboard.title", "Counselor Overview")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("counselor.dashboard.summary", "Your caseload summary and upcoming actions.")}
        </p>
      </motion.div>

      {/* Stat Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          { label: t("counselor.dashboard.assignedStudents", "Assigned Students"), value: totalStudents, loading: isLoading, icon: Users, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10", badge: t("counselor.dashboard.caseload", "Caseload") },
          { label: t("counselor.dashboard.pendingFollowups", "Pending Follow-ups"), value: pendingFollowUps, loading: dashLoading, icon: CalendarClock, iconColor: "text-amber-500", iconBg: "bg-amber-500/10", badge: t("common.due", "Due") },
          { label: t("counselor.dashboard.overdueFollowups", "Overdue Follow-ups"), value: overdueFollowUps, loading: dashLoading, icon: AlertTriangle, iconColor: "text-red-500", iconBg: "bg-red-500/10", badge: "Action" },
          { label: t("counselor.dashboard.changeRequests", "Change Requests"), value: pendingCRCount, loading: crLoading, icon: Send, iconColor: "text-orange-500", iconBg: "bg-orange-500/10", badge: pendingCRCount > 0 ? `${pendingCRCount} pending` : undefined, onClick: () => setRightTab("requests") },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className={`dash-card p-5 ${stat.onClick ? "cursor-pointer" : ""}`}
            onClick={stat.onClick}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            {stat.loading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
            )}
            {stat.badge && (
              <p className="text-[11px] text-muted-foreground mt-1">{stat.badge}</p>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { label: t("counselor.dashboard.myStudents", "My Students"), href: "/counselor/students", icon: Users, color: "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100" },
          { label: t("counselor.dashboard.academicGaps", "Academic Gaps"), href: "/counselor/academic-gaps", icon: TrendingDown, color: "text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-100" },
          { label: t("counselor.dashboard.evaluations360", "360° Evaluations"), href: "/counselor/evaluations", icon: Radar, color: "text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-100" },
          { label: t("counselor.dashboard.alerts", "Alerts"), href: "/counselor/alerts", icon: Bell, color: "text-red-600 bg-red-50 hover:bg-red-100 border-red-100" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className={`border cursor-pointer transition-all hover:shadow-md ${item.color}`}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">{item.label}</span>
                <ChevronRight className="h-4 w-4 ml-auto opacity-60" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </motion.div>

      {/* Upcoming Counselor Sessions */}
      {(upcomingSessions.length > 0 || loadingSessions) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                {t("counselor.dashboard.upcomingSessions", "Upcoming Counseling Sessions")}
              </CardTitle>
              <Link href="/counselor/sessions">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:bg-blue-50">
                  {t("counselor.dashboard.manageSessions", "Manage Sessions")} →
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 flex-1 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-col p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow transition-shadow relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-3 opacity-10">
                        <Users className="w-12 h-12" />
                      </div>
                      <div className="flex items-start gap-3 relative z-10">
                        <Avatar className="h-10 w-10 border shadow-sm">
                          <AvatarFallback className="bg-blue-50 text-blue-700 font-semibold text-xs">
                            {session.studentName?.charAt(0) || "S"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{session.studentName}</p>
                          <p className="text-xs text-gray-500 truncate">{session.topic}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between relative z-10 text-xs text-gray-600 font-medium">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <span className="text-blue-600">{new Date(session.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Students + Right Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Assigned Students */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-indigo-600" />
                  {t("counselor.dashboard.assignedStudents", "Assigned Students")}
                </CardTitle>
                <Link href="/counselor/students">
                  <Button variant="ghost" size="sm" className="text-xs text-indigo-600 hover:bg-indigo-50">
                    {t("common.viewAll", "View All")} →
                  </Button>
                </Link>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder={t("counselor.dashboard.searchStudents", "Search students...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {studentsLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {search ? t("counselor.dashboard.noStudentsMatch", "No students match your search.") : t("counselor.dashboard.noStudentsAssigned", "No students assigned yet.")}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="pl-6">{t("counselor.dashboard.student", "Student")}</TableHead>
                      <TableHead>{t("counselor.dashboard.grade", "Grade")}</TableHead>
                      <TableHead>{t("counselor.dashboard.assessment", "Assessment")}</TableHead>
                      <TableHead className="pr-6">{t("counselor.dashboard.progress", "Progress")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.slice(0, 8).map((s: any) => (
                      <TableRow
                        key={s.id}
                        className="hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => router.push(`/counselor/students/${s.id}`)}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700 font-bold">
                                {s.name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{s.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.gradeLevel ? `Gr ${s.gradeLevel}` : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.assessmentStatus && typeof s.assessmentStatus === "object" ? (
                            <div className="flex flex-wrap gap-1">
                              {(["PCA", "MIL", "Eval360"] as const).map((key) => {
                                const val: string = (s.assessmentStatus as any)[key] ?? "not_started";
                                const color =
                                  val === "completed"
                                    ? "bg-green-100 text-green-700"
                                    : val === "in_progress"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-gray-100 text-gray-500";
                                return (
                                  <span
                                    key={key}
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}
                                    title={`${key}: ${val.replace(/_/g, " ")}`}
                                  >
                                    {key}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <Badge className="text-xs border-0 bg-gray-100 text-gray-600">
                              {t("counselor.dashboard.notStarted", "Not started")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-6">
                          <div className="w-20">
                            <Progress value={s.creditProgress?.percentage ?? s.progressPercent ?? 0} className="h-1.5" />
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {s.creditProgress?.percentage ?? s.progressPercent ?? 0}%
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel — Tabbed: Follow-ups | Change Requests */}
        <div>
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="pb-0">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setRightTab("followups")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-all ${
                    rightTab === "followups"
                      ? "bg-white shadow-sm text-yellow-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {t("counselor.dashboard.followUps", "Follow-ups")}
                  {pendingFollowUps > 0 && (
                    <span className="bg-yellow-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {pendingFollowUps}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setRightTab("requests")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-all ${
                    rightTab === "requests"
                      ? "bg-white shadow-sm text-orange-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("counselor.dashboard.requests", "Requests")}
                  {pendingCRCount > 0 && (
                    <span className="bg-orange-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {pendingCRCount > 9 ? "9+" : pendingCRCount}
                    </span>
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* === Follow-ups Tab === */}
              {rightTab === "followups" && (
                dashLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : (dashData as any)?.pendingFollowUpsList?.length ? (
                  <div className="space-y-3">
                    {(dashData as any).pendingFollowUpsList.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 bg-yellow-50/60 border border-yellow-100 rounded-lg"
                      >
                        <CalendarClock className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {item.studentName}
                          </p>
                          <p className="text-xs text-gray-600 line-clamp-1">
                            {item.content}
                          </p>
                          <p className="text-[10px] text-yellow-700 mt-0.5">
                            📅 {item.followUpDate}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CalendarClock className="h-9 w-9 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">{t("counselor.dashboard.noFollowUps", "No upcoming follow-ups")}</p>
                    <p className="text-xs text-gray-300 mt-1">
                      {t("counselor.dashboard.followUpHint", "Set a follow-up date on a counselor note to see it here")}
                    </p>
                  </div>
                )
              )}

              {/* === Change Requests Tab === */}
              {rightTab === "requests" && (
                crLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : changeRequests.length > 0 ? (
                  <div className="space-y-3">
                    {changeRequests.map((req: any) => (
                      <ChangeRequestCard key={req.id} req={req} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Send className="h-9 w-9 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">{t("counselor.dashboard.noRequests", "No pending requests")}</p>
                    <p className="text-xs text-gray-300 mt-1">
                      {t("counselor.dashboard.requestsHint", "Student course change requests will appear here")}
                    </p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Recent Notes */}
      {(dashData as any)?.recentNotes?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-teal-600" />
                {t("counselor.dashboard.recentNotes", "Recent Notes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(dashData as any).recentNotes.map((note: any) => (
                  <div
                    key={note.id}
                    className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-lg shadow-sm"
                  >
                    <BookOpen className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {note.studentName}
                        </p>
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                          {note.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {note.content}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ── Inline change request card with approve / reject ─────────────────────────

function ChangeRequestCard({ req }: { req: any }) {
  const { t } = useTranslation();
  const router = useRouter();
  const review = useReviewChangeRequest(req.studentId);

  const handleReview = (status: "approved" | "rejected") => {
    review.mutate({
      requestId: req.id,
      payload: { status },
    });
  };

  return (
    <div className="p-3 bg-orange-50/60 border border-orange-100 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">
            {req.studentName}
          </p>
          <p className="text-xs text-gray-700 font-medium truncate">
            {req.courseName}
            <span className="text-gray-400 font-normal ml-1">
              · Gr.{req.gradeLevel} {req.semester}
            </span>
          </p>
          {req.studentNote && (
            <p className="text-[10px] text-gray-500 italic line-clamp-1 mt-0.5">
              "{req.studentNote}"
            </p>
          )}
        </div>
        <Badge
          className={`text-[10px] shrink-0 ${
            req.action === "add"
              ? "bg-blue-100 text-blue-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {req.action}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 flex-1 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
          disabled={review.isPending}
          onClick={() => handleReview("approved")}
        >
          {review.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          {t("common.approve", "Approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
          disabled={review.isPending}
          onClick={() => handleReview("rejected")}
        >
          <XCircle className="h-3 w-3" />
          {t("common.reject", "Reject")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-gray-500 hover:text-indigo-600 px-2"
          onClick={() => router.push(`/counselor/students/${req.studentId}`)}
        >
          {t("common.view", "View")}
        </Button>
      </div>
    </div>
  );
}