"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { unwrapList } from "@/lib/unwrapList";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Users,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import { getStudentCounselorSessions, cancelCounselorSession } from "@/services/counselorSessionService";
import type { CounselorSession } from "@/services/counselorSessionService";
import type { Coach } from "@/types/coach";

import { CoachingSessionsList } from "./_components/coaching-sessions-list";
import type { Session } from "./_components/coaching-sessions-list";
import { CounselorSessionsList } from "./_components/counselor-sessions-list";
import {
  CancelSessionDialog,
  ReviewSessionDialog,
  CancelCounselorDialog,
  RescheduleBookingModal,
} from "./_components/session-modals";

export default function MySessionsPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counselorSessions, setCounselorSessions] = useState<CounselorSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCounselorLoading, setIsCounselorLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [mainTab, setMainTab] = useState<"coaching" | "counselor">("coaching");
  const [counselorSubTab, setCounselorSubTab] = useState("upcoming");

  // Modal states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [rescheduleCoach, setRescheduleCoach] = useState<Coach | null>(null);
  const [cancelCounselorOpen, setCancelCounselorOpen] = useState(false);
  const [selectedCounselorSession, setSelectedCounselorSession] = useState<CounselorSession | null>(null);
  const [counselorCancelReason, setCounselorCancelReason] = useState("");
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
      const rawSessions = unwrapList(response, "sessions");

      interface RawSession extends Partial<Session> {
        coach?: { name?: string; image?: string; title?: string };
      }
      const formattedSessions = rawSessions.map((session: RawSession) => {
        const startTime = session.startTime || session.slot?.start;
        const endTime = session.endTime || session.slot?.end;
        let date = "TBD", time = "TBD", duration = "1 hour";

        if (startTime) {
          try {
            const startDate = new Date(startTime);
            date = format(startDate, "EEE, MMM d, yyyy");
            time = format(startDate, "h:mm a");
            if (endTime) {
              const endDate = new Date(endTime);
              const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
              duration = `${Math.round(diff)} min`;
              time = `${time} - ${format(endDate, "h:mm a")}`;
            }
          } catch {
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

      setSessions(formattedSessions as Session[]);
    } catch {
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
    } catch {
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
        prev.map((s) => (s.id === selectedSession.id ? { ...s, status: "cancelled" } : s))
      );
      toast.success(t("sessions.messages.cancelSuccess"));
      setCancelDialogOpen(false);
    } catch {
      toast.error(t("sessions.messages.failedToCancel"));
    } finally {
      setIsProcessing(false);
    }
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
    } catch {
      toast.error(t("sessions.messages.failedToSubmitReview"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelCounselorSession = async () => {
    if (!selectedCounselorSession) return;
    try {
      await cancelCounselorSession(selectedCounselorSession.id, counselorCancelReason);
      toast.success("Session cancelled");
      setCancelCounselorOpen(false);
      fetchCounselorSessions();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel session");
    }
  };

  // --- Computed ---

  const now = new Date();
  const isSessionPast = (s: { endTime?: string; startTime?: string }) => {
    const endTime = s.endTime || s.startTime;
    return endTime ? new Date(endTime) < now : false;
  };

  const upcomingSessions = sessions.filter(
    (s) => ["confirmed", "rescheduled", "pending"].includes(s.status) && !isSessionPast(s)
  );
  const pastSessions = sessions.filter(
    (s) => ["completed", "cancelled"].includes(s.status) || isSessionPast(s)
  );
  const filteredSessions = activeTab === "upcoming" ? upcomingSessions : pastSessions;

  const upcomingCounselorSessions = counselorSessions.filter(
    (s) => ["confirmed", "upcoming"].includes(s.status) && !isSessionPast(s)
  );
  const pastCounselorSessions = counselorSessions.filter(
    (s) => ["completed", "cancelled"].includes(s.status) || isSessionPast(s)
  );
  const filteredCounselorSessions =
    counselorSubTab === "upcoming" ? upcomingCounselorSessions : pastCounselorSessions;

  // --- Stats ---

  const coachingStats = [
    { label: t("coach:mySessions.stats.total"), value: sessions.length, icon: CalendarDays, color: "text-muted-foreground" },
    { label: t("coach:mySessions.stats.upcoming"), value: upcomingSessions.length, icon: Clock, color: "text-emerald-600" },
    { label: t("coach:mySessions.stats.completed"), value: sessions.filter((s) => s.status === "completed").length, icon: CheckCircle2, color: "text-blue-600" },
    { label: t("coach:mySessions.stats.cancelled"), value: sessions.filter((s) => s.status === "cancelled").length, icon: XCircle, color: "text-red-500" },
  ];

  const counselorStats = [
    { label: t("coach:mySessions.stats.total"), value: counselorSessions.length, icon: CalendarDays, color: "text-muted-foreground" },
    { label: t("coach:mySessions.stats.upcoming"), value: upcomingCounselorSessions.length, icon: Clock, color: "text-emerald-600" },
    { label: t("coach:mySessions.stats.completed"), value: counselorSessions.filter((s) => s.status === "completed").length, icon: CheckCircle2, color: "text-blue-600" },
  ];

  const stats = mainTab === "coaching" ? coachingStats : counselorStats;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t("sessions.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("sessions.subtitle", "Manage your coaching and counselor sessions")}
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" className="h-10 px-5 rounded-xl border-border text-foreground hover:bg-secondary">
            <Link href="/dashboard/book-counselor">
              <User className="h-4 w-4 mr-2" />
              {t("coach:mySessions.bookCounselor")}
            </Link>
          </Button>
          <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-10 px-6 rounded-xl">
            <Link href="/dashboard/book-coach">
              <Users className="h-4 w-4 mr-2" />
              {t("sessions.bookNew")}
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Main Tabs */}
      <div className="flex gap-3">
        <button
          onClick={() => setMainTab("coaching")}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            mainTab === "coaching"
              ? "bg-foreground text-background"
              : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4 inline mr-1.5" />
          {t("coach:mySessions.tabs.coaching")}
        </button>
        <button
          onClick={() => setMainTab("counselor")}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            mainTab === "counselor"
              ? "bg-foreground text-background"
              : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-4 w-4 inline mr-1.5" />
          {t("coach:mySessions.tabs.counselor")}
          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700 ml-1.5">
            {t("coach:mySessions.tabs.free")}
          </span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className={`grid ${mainTab === "coaching" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"} gap-4`}>
        {stats.map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.1 }}>
            <div className="dash-card p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-secondary rounded-xl">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Session Lists */}
      {mainTab === "counselor" && (
        <CounselorSessionsList
          sessions={filteredCounselorSessions}
          isLoading={isCounselorLoading}
          subTab={counselorSubTab}
          onSubTabChange={setCounselorSubTab}
          upcomingCount={upcomingCounselorSessions.length}
          pastCount={pastCounselorSessions.length}
          onCancelClick={(session) => {
            setSelectedCounselorSession(session);
            setCounselorCancelReason("");
            setCancelCounselorOpen(true);
          }}
        />
      )}

      {mainTab === "coaching" && (
        <CoachingSessionsList
          sessions={filteredSessions}
          isLoading={isLoading}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          upcomingCount={upcomingSessions.length}
          pastCount={pastSessions.length}
          onCancelClick={handleCancelClick}
          onRescheduleClick={handleRescheduleClick}
          onReviewClick={handleReviewClick}
          t={t}
        />
      )}

      {/* Modals */}
      <CancelSessionDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        session={selectedSession}
        cancelReason={cancelReason}
        onCancelReasonChange={setCancelReason}
        onConfirm={confirmCancel}
        isProcessing={isProcessing}
      />

      <RescheduleBookingModal
        coach={rescheduleCoach}
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        session={selectedSession}
        onSuccess={() => {
          fetchSessions();
          setBookingModalOpen(false);
        }}
      />

      <ReviewSessionDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        session={selectedSession}
        rating={reviewRating}
        onRatingChange={setReviewRating}
        comment={reviewComment}
        onCommentChange={setReviewComment}
        onConfirm={confirmReview}
        isProcessing={isProcessing}
      />

      <CancelCounselorDialog
        open={cancelCounselorOpen}
        onOpenChange={setCancelCounselorOpen}
        session={selectedCounselorSession}
        reason={counselorCancelReason}
        onReasonChange={setCounselorCancelReason}
        onConfirm={handleCancelCounselorSession}
      />
    </div>
  );
}
