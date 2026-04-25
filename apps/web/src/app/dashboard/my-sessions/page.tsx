"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Clock,
  Video,
  X,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Users,
  ArrowRight,
  Star,
  MoreHorizontal,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { DynamicBookingModal } from "@/lib/dynamic-imports";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getStudentCounselorSessions, cancelCounselorSession } from "@/services/counselorSessionService";
import type { CounselorSession } from "@/services/counselorSessionService";


interface Session {
  id: string;
  coachId: string;
  coachName: string;
  coachImage?: string;
  coachTitle?: string;
  topic: string;
  notes?: string;
  startTime?: string;
  endTime?: string;
  date: string;
  time: string;
  duration: string;
  status: "confirmed" | "rescheduled" | "cancelled" | "completed";
  meetingLink?: string;
  slot?: { start: string; end: string };
}

export default function MySessionsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counselorSessions, setCounselorSessions] = useState<CounselorSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCounselorLoading, setIsCounselorLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [mainTab, setMainTab] = useState<"coaching" | "counselor">("coaching");
  const [counselorSubTab, setCounselorSubTab] = useState("upcoming");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [rescheduleCoach, setRescheduleCoach] = useState<any>(null);
  // Counselor session cancel
  const [cancelCounselorOpen, setCancelCounselorOpen] = useState(false);
  const [selectedCounselorSession, setSelectedCounselorSession] = useState<CounselorSession | null>(null);
  const [counselorCancelReason, setCounselorCancelReason] = useState("");

  // Form States
  const [cancelReason, setCancelReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  useEffect(() => {
    fetchSessions();
    fetchCounselorSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const { getUserSessions } = await import("@/services/coachService");
      const response = await getUserSessions("all");

      const rawSessions = Array.isArray((response as any)?.data?.data)
        ? (response as any).data.data
        : Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
        ? response
        : [];

      const formattedSessions = rawSessions.map((session: any) => {
        const startTime = session.startTime || session.slot?.start;
        const endTime = session.endTime || session.slot?.end;

        let date = "TBD";
        let time = "TBD";
        let duration = "1 hour";

        if (startTime) {
          try {
            const startDate = new Date(startTime);
            date = format(startDate, "EEE, MMM d, yyyy");
            time = format(startDate, "h:mm a");

            if (endTime) {
              const endDate = new Date(endTime);
              const diff =
                (endDate.getTime() - startDate.getTime()) / (1000 * 60);
              duration = `${Math.round(diff)} min`;
              time = `${time} - ${format(endDate, "h:mm a")}`;
            }
          } catch (e) {
      // error handled silently
    }
        }

        return {
          ...session,
          coachName: session.coachName || session.coach?.name || "Coach",
          coachImage: session.coachImage || session.coach?.image,
          coachTitle: session.coachTitle || session.coach?.title,
          date,
          time,
          duration,
        };
      });

      setSessions(formattedSessions);
    } catch (error) {
      toast.error(t("sessions.messages.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCounselorSessions = async () => {
    setIsCounselorLoading(true);
    try {
      const res = await getStudentCounselorSessions({ limit: 100 });
      setCounselorSessions(res.data);
    } catch {
      // silently fail — counselor sessions are optional
    } finally {
      setIsCounselorLoading(false);
    }
  };

  const handleCancelCounselorSession = async () => {
    if (!selectedCounselorSession) return;
    try {
      await cancelCounselorSession(selectedCounselorSession.id, counselorCancelReason);
      toast.success("Session cancelled");
      setCancelCounselorOpen(false);
      fetchCounselorSessions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // --- Actions ---

  const handleCancelClick = (session: Session) => {
    setSelectedSession(session);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const handleRescheduleClick = async (session: Session) => {
    setSelectedSession(session);
    try {
      const { getCoachDetails } = await import("@/services/coachService");
      const coachData = await getCoachDetails(session.coachId);
      setRescheduleCoach(coachData);
      setBookingModalOpen(true);
    } catch (error) {
      toast.error("Failed to load coach information");
    }
  };

  const handleReviewClick = (session: Session) => {
    setSelectedSession(session);
    setReviewRating(5);
    setReviewComment("");
    setReviewDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedSession || !cancelReason.trim()) {
      toast.error(t("sessions.messages.cancelReasonRequired"));
      return;
    }

    setIsProcessing(true);
    try {
      const { cancelSession } = await import("@/services/coachService");
      await cancelSession(selectedSession.id, cancelReason);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === selectedSession.id ? { ...s, status: "cancelled" } : s
        )
      );

      toast.success(t("sessions.messages.cancelSuccess"));
      setCancelDialogOpen(false);
    } catch (error) {
      toast.error(t("sessions.messages.failedToCancel"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRescheduleSuccess = () => {
    // Refresh sessions after reschedule
    fetchSessions();
    setBookingModalOpen(false);
  };

  const confirmReview = async () => {
    if (!selectedSession) return;

    setIsProcessing(true);
    try {
      const { submitReview } = await import("@/services/coachService");
      await submitReview(selectedSession.coachId, {
        bookingId: selectedSession.id,
        rating: reviewRating,
        comment: reviewComment,
      });

      toast.success(t("sessions.messages.reviewSubmitted"));
      setReviewDialogOpen(false);
    } catch (error) {
      toast.error(t("sessions.messages.failedToSubmitReview"));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Helpers ---

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("sessions.status.confirmed")}
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("sessions.status.completed")}
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">
            <XCircle className="h-3 w-3 mr-1" />
            {t("sessions.status.cancelled")}
          </Badge>
        );
      case "rescheduled":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
            <Clock className="h-3 w-3 mr-1" />
            {t("sessions.status.rescheduled")}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const upcomingSessions = sessions.filter((s) =>
    ["confirmed", "rescheduled"].includes(s.status)
  );
  const pastSessions = sessions.filter((s) =>
    ["completed", "cancelled"].includes(s.status)
  );
  const filteredSessions =
    activeTab === "upcoming" ? upcomingSessions : pastSessions;

  const upcomingCounselorSessions = counselorSessions.filter(s => s.status === "confirmed");
  const pastCounselorSessions = counselorSessions.filter(s => s.status === "completed" || s.status === "cancelled");
  const filteredCounselorSessions = counselorSubTab === "upcoming" ? upcomingCounselorSessions : pastCounselorSessions;

  const getCounselorStatusBadge = (status: string) => {
    if (status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Upcoming</Badge>;
    if (status === "completed") return <Badge className="bg-blue-100 text-blue-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    if (status === "cancelled") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-25"></div>
              <Avatar className="h-16 w-16 border-4 border-white shadow-xl relative">
                <AvatarImage src={user?.avatar || user?.image || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xl font-bold">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {t("sessions.title")}
              </h1>
              <p className="text-gray-500 mt-1">{t("sessions.subtitle")}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              asChild
              variant="outline"
              className="h-11 px-5 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Link href="/dashboard/book-counselor">
                <User className="h-4 w-4 mr-2" />
                Book Counselor Session
              </Link>
            </Button>
            <Button
              asChild
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 h-11 px-6 rounded-xl"
            >
              <Link href="/dashboard/book-coach">
                <Users className="h-4 w-4 mr-2" />
                {t("sessions.bookNew")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Main Tabs — Coaching vs Counselor */}
        <div className="flex gap-3">
          <button
            onClick={() => setMainTab("coaching")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mainTab === "coaching"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            <Users className="h-4 w-4 inline mr-1.5" />
            Coaching Sessions
          </button>
          <button
            onClick={() => setMainTab("counselor")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mainTab === "counselor"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
            }`}
          >
            <User className="h-4 w-4 inline mr-1.5" />
            Counselor Sessions
            <Badge className="ml-1.5 bg-green-100 text-green-700 border-0 text-[10px] px-1.5">FREE</Badge>
          </button>
        </div>

        {/* Stats Cards — Coaching */}
        {mainTab === "coaching" && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Sessions",
              value: sessions.length,
              icon: CalendarDays,
              color: "text-slate-600",
              bg: "from-slate-100 to-slate-200",
            },
            {
              label: "Upcoming",
              value: upcomingSessions.length,
              icon: Clock,
              color: "text-emerald-600",
              bg: "from-emerald-100 to-emerald-200",
            },
            {
              label: "Completed",
              value: sessions.filter((s) => s.status === "completed").length,
              icon: CheckCircle2,
              color: "text-blue-600",
              bg: "from-blue-100 to-blue-200",
            },
            {
              label: "Cancelled",
              value: sessions.filter((s) => s.status === "cancelled").length,
              icon: XCircle,
              color: "text-red-500",
              bg: "from-red-100 to-red-200",
            },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 bg-gradient-to-br ${stat.bg} rounded-xl`}
                    >
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-500 font-medium">
                        {stat.label}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        </>)}

        {/* Stats Cards — Counselor */}
        {mainTab === "counselor" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total", value: counselorSessions.length, icon: CalendarDays, color: "text-slate-600", bg: "from-slate-100 to-slate-200" },
                { label: "Upcoming", value: upcomingCounselorSessions.length, icon: Clock, color: "text-emerald-600", bg: "from-emerald-100 to-emerald-200" },
                { label: "Completed", value: counselorSessions.filter(s => s.status === "completed").length, icon: CheckCircle2, color: "text-blue-600", bg: "from-blue-100 to-blue-200" },
              ].map((stat, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.1 }}>
                  <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 bg-gradient-to-br ${stat.bg} rounded-xl`}>
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                          <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Counselor Session List */}
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-white px-6 py-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="text-xl font-bold text-gray-900">Counselor Sessions</CardTitle>
                  <div className="flex items-center gap-3">
                    <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
                      <Link href="/dashboard/book-counselor">
                        <User className="h-4 w-4 mr-1.5" />
                        Book New
                      </Link>
                    </Button>
                    <Tabs value={counselorSubTab} onValueChange={setCounselorSubTab}>
                      <TabsList className="bg-gray-100/80 p-1 rounded-xl">
                        <TabsTrigger value="upcoming" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">Upcoming ({upcomingCounselorSessions.length})</TabsTrigger>
                        <TabsTrigger value="past" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">Past ({pastCounselorSessions.length})</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isCounselorLoading ? (
                  <div className="flex flex-col items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
                ) : filteredCounselorSessions.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {filteredCounselorSessions.map((session, index) => {
                      let date = "TBD", time = "TBD";
                      try {
                        const s = new Date(session.startTime), e = new Date(session.endTime);
                        date = format(s, "EEE, MMM d, yyyy");
                        time = `${format(s, "h:mm a")} – ${format(e, "h:mm a")}`;
                      } catch {}
                      return (
                        <motion.div key={session.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="p-5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-slate-700 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                                {session.counselorName?.charAt(0) || "C"}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 text-lg truncate">{session.counselorName || "Counselor"}</h3>
                                <p className="text-sm text-gray-500 truncate">{session.counselorEmail}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-xs">{session.topic}</Badge>
                                  <Badge className="bg-green-100 text-green-700 border-0 text-xs">FREE</Badge>
                                  {getCounselorStatusBadge(session.status)}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg"><Calendar className="h-4 w-4 text-slate-500" /><span className="font-medium text-slate-700">{date}</span></div>
                              <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg"><Clock className="h-4 w-4 text-slate-500" /><span className="font-medium text-slate-700">{time}</span></div>
                            </div>
                            <div className="flex items-center gap-2">
                              {session.status === "confirmed" && (
                                <>
                                  {session.meetingLink && (
                                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 rounded-lg" asChild>
                                      <a href={session.meetingLink} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4 mr-1.5" />Join</a>
                                    </Button>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-slate-100">
                                        <MoreHorizontal className="h-4 w-4 text-slate-500" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-slate-100 p-1">
                                      <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50 rounded-lg cursor-pointer"
                                        onClick={() => { setSelectedCounselorSession(session); setCounselorCancelReason(""); setCancelCounselorOpen(true); }}>
                                        <X className="h-4 w-4 mr-2" />Cancel Session
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </div>
                          </div>
                          {(session.notes || session.counselorNotes) && (
                            <div className="mt-4 ml-[4.5rem] space-y-1.5">
                              {session.notes && <div className="pl-4 border-l-2 border-slate-200"><p className="text-sm text-gray-600"><span className="font-medium text-gray-700">Your notes: </span>{session.notes}</p></div>}
                              {session.counselorNotes && <div className="pl-4 border-l-2 border-indigo-200"><p className="text-sm text-gray-600"><span className="font-medium text-indigo-600">Counselor notes: </span>{session.counselorNotes}</p></div>}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="h-20 w-20 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-2xl flex items-center justify-center mb-5">
                      <User className="h-10 w-10 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No {counselorSubTab} counselor sessions</h3>
                    <p className="text-gray-500 text-center max-w-sm mb-5 text-sm">Book a FREE session with your assigned school counselor for guidance and support.</p>
                    {counselorSubTab === "upcoming" && (
                      <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white h-11 px-6 rounded-xl">
                        <Link href="/dashboard/book-counselor"><User className="h-4 w-4 mr-2" />Book a Counselor Session</Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-white px-6 py-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-xl font-bold text-gray-900">
                {t("sessions.yourSessions")}
              </CardTitle>
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full sm:w-auto"
              >
                <TabsList className="bg-gray-100/80 p-1 rounded-xl">
                  <TabsTrigger
                    value="upcoming"
                    className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
                  >
                    {t("sessions.tabs.upcoming")} ({upcomingSessions.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="past"
                    className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
                  >
                    {t("sessions.tabs.past")} ({pastSessions.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 mt-4">Loading your sessions...</p>
              </div>
            ) : filteredSessions.length > 0 ? (
              <div className="divide-y divide-gray-100">
                <AnimatePresence>
                  {filteredSessions.map((session, index) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-5 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5">
                        {/* Coach Info */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-14 w-14 border-2 border-white shadow-lg ring-2 ring-blue-100">
                              <AvatarImage src={session.coachImage} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold">
                                {session.coachName?.charAt(0) || "C"}
                              </AvatarFallback>
                            </Avatar>
                            {["confirmed", "rescheduled"].includes(
                              session.status
                            ) && (
                              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white"></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 text-lg truncate">
                              {session.coachName}
                            </h3>
                            {session.coachTitle && (
                              <p className="text-sm text-gray-500 truncate">
                                {session.coachTitle}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge
                                variant="secondary"
                                className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-xs"
                              >
                                {session.topic}
                              </Badge>
                              {getStatusBadge(session.status)}
                            </div>
                          </div>
                        </div>

                        {/* Date & Time */}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <span className="font-medium text-slate-700">
                              {session.date}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                            <Clock className="h-4 w-4 text-slate-500" />
                            <span className="font-medium text-slate-700">
                              {session.time}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {["confirmed", "rescheduled"].includes(
                            session.status
                          ) ? (
                            <>
                              {session.meetingLink && (
                                <Button
                                  size="sm"
                                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md h-9 px-4 rounded-lg"
                                  asChild
                                >
                                  <a
                                    href={session.meetingLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Video className="h-4 w-4 mr-1.5" />
                                    Join Call
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRescheduleClick(session)}
                                className="h-9 px-4 rounded-lg border-slate-200 hover:bg-slate-50"
                              >
                                Reschedule
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-lg hover:bg-slate-100"
                                  >
                                    <MoreHorizontal className="h-4 w-4 text-slate-500" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="rounded-xl shadow-lg border-slate-100 p-1"
                                >
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-700 focus:bg-red-50 rounded-lg cursor-pointer"
                                    onClick={() => handleCancelClick(session)}
                                  >
                                    <X className="h-4 w-4 mr-2" />
                                    Cancel Session
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          ) : session.status === "completed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-4 rounded-lg border-slate-200 hover:bg-slate-50"
                              onClick={() => handleReviewClick(session)}
                            >
                              <Star className="h-4 w-4 mr-1.5 text-yellow-500" />
                              Review
                            </Button>
                          ) : null}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 w-9 p-0 rounded-lg hover:bg-slate-100"
                            asChild
                          >
                            <Link
                              href={`/dashboard/book-coach/${session.coachId}`}
                            >
                              <ArrowRight className="h-4 w-4 text-slate-400" />
                            </Link>
                          </Button>
                        </div>
                      </div>

                      {/* Notes Section */}
                      {session.notes && (
                        <div className="mt-4 ml-[4.5rem] pl-4 border-l-2 border-blue-100">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium text-gray-700">
                              Notes:{" "}
                            </span>
                            {session.notes}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="h-20 w-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-5">
                  <Calendar className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No {activeTab} sessions
                </h3>
                <p className="text-gray-500 text-center max-w-sm mb-5">
                  {activeTab === "upcoming"
                    ? "You don't have any upcoming coaching sessions. Book a session with an expert coach to accelerate your career!"
                    : "You haven't completed any coaching sessions yet."}
                </p>
                {activeTab === "upcoming" && (
                  <Button
                    asChild
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg h-11 px-6 rounded-xl"
                  >
                    <Link href="/dashboard/book-coach">
                      <Users className="h-4 w-4 mr-2" />
                      Find a Coach
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Cancel Session</DialogTitle>
            <DialogDescription className="text-gray-500">
              Are you sure you want to cancel this session with{" "}
              <span className="font-medium text-gray-700">
                {selectedSession?.coachName}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Reason for cancellation
            </label>
            <Textarea
              placeholder="Please let us know why you're cancelling..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="resize-none rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              className="rounded-lg"
            >
              Keep Session
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={isProcessing}
              className="rounded-lg"
            >
              {isProcessing ? "Cancelling..." : "Cancel Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Modal for Rescheduling */}
      <DynamicBookingModal
        coach={rescheduleCoach}
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        mode="reschedule"
        bookingId={selectedSession?.id}
        initialTopic={selectedSession?.topic || ""}
        initialNotes={selectedSession?.notes || ""}
        onRescheduleSuccess={handleRescheduleSuccess}
      />

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Leave a Review</DialogTitle>
            <DialogDescription className="text-gray-500">
              How was your session with{" "}
              <span className="font-medium text-gray-700">
                {selectedSession?.coachName}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setReviewRating(star)}
                  className="focus:outline-none transition-all hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`h-10 w-10 ${
                      star <= reviewRating
                        ? "fill-yellow-400 text-yellow-400 drop-shadow-sm"
                        : "text-slate-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                Comment
              </Label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience..."
                rows={4}
                className="resize-none rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmReview}
              disabled={isProcessing}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg"
            >
              {isProcessing ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Counselor Cancel Dialog */}
      <Dialog open={cancelCounselorOpen} onOpenChange={setCancelCounselorOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Cancel Counselor Session</DialogTitle>
            <DialogDescription className="text-gray-500">Are you sure you want to cancel your session with <span className="font-medium text-gray-700">{selectedCounselorSession?.counselorName}</span>?</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Reason for cancellation</label>
            <Textarea
              placeholder="Please let your counselor know why you&apos;re cancelling..."
              value={counselorCancelReason}
              onChange={e => setCounselorCancelReason(e.target.value)}
              rows={3}
              className="resize-none rounded-xl border-slate-200"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelCounselorOpen(false)} className="rounded-lg">Keep Session</Button>
            <Button variant="destructive" onClick={handleCancelCounselorSession} className="rounded-lg">Cancel Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
