"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { unwrapList } from "@/lib/unwrapList";
import {
  Calendar as CalendarIcon,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";
import { SessionCardSkeleton } from "@/components/skeletons/SessionCardSkeleton";
import { StudentDetailsSheet } from "./_components/StudentDetailsSheet";
import { SessionStatsGrid } from "./_components/SessionStatsGrid";
import { SessionFilters } from "./_components/SessionFilters";
import { SessionCard } from "./_components/SessionCard";
import { SessionNotesDialog } from "./_components/SessionNotesDialog";
import { CancelSessionDialog } from "./_components/CancelSessionDialog";
import { RescheduleDialog } from "./_components/RescheduleDialog";
import type { FormattedSession } from "./_components/session-types";

export default function SessionsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [sessions, setSessions] = useState<FormattedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("upcoming");

  // Dialog state
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<FormattedSession | null>(null);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);

  // Student profile sheet
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isStudentSheetOpen, setIsStudentSheetOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { getCoachSessions } = await import("@/services/coachService");
        const sessionsData = await getCoachSessions("all");
        const rawSessions = unwrapList(sessionsData, "sessions");

        const resolveStartTs = (s: Record<string, unknown>): number | undefined => {
          const candidates = [
            s.startTime,
            (s.slot as { start?: string } | undefined)?.start,
            s.start,
            s.start_date,
            s.startDate,
            s.sessionStart,
            s.sessionDate,
            s.session_date,
            s.date,
            s.datetime,
            s.start_time,
          ].filter(Boolean);

          for (const value of candidates) {
            const ts = Date.parse(value as string);
            if (!Number.isNaN(ts)) return ts;
          }
          return undefined;
        };

        interface RawSession {
          id?: string;
          startTime?: string;
          endTime?: string;
          slot?: { start?: string; end?: string };
          status?: string;
          studentName?: string;
          userName?: string;
          studentAvatar?: string;
          userAvatar?: string;
          studentId?: string;
          userId?: string;
          topic?: string;
          notes?: string;
          meetingLink?: string;
          student?: { name?: string; fullName?: string; image?: string; avatar?: string; id?: string; _id?: string };
          user?: { name?: string; fullName?: string; image?: string; avatar?: string; id?: string; _id?: string };
          [key: string]: unknown;
        }

        const formattedSessions = (rawSessions as RawSession[])
          .map((session) => {
            if (!session) return null;

            const startTime = session.startTime || session.slot?.start;
            const endTime = session.endTime || session.slot?.end;
            const startTimestamp = resolveStartTs(session as unknown as Record<string, unknown>);

            let date = "TBD";
            let time = "TBD";
            let duration = "1 hour";

            if (startTime) {
              try {
                const startDate = new Date(startTime);
                if (!isNaN(startDate.getTime())) {
                  date = format(startDate, "EEE, MMM d, yyyy");
                  time = format(startDate, "h:mm a");

                  if (endTime) {
                    const endDate = new Date(endTime);
                    if (!isNaN(endDate.getTime())) {
                      const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
                      duration = `${Math.round(diff)} min`;
                      time = `${time} - ${format(endDate, "h:mm a")}`;
                    }
                  }
                }
              } catch {
                // error handled silently
              }
            }

            const student = session.student || session.user || {};

            let derivedStatus = session.status || "upcoming";
            if (
              typeof startTimestamp === "number" &&
              derivedStatus !== "completed" &&
              derivedStatus !== "cancelled"
            ) {
              if (startTimestamp < Date.now()) {
                derivedStatus = "completed";
              }
            }

            const bucket = (() => {
              if (derivedStatus === "cancelled") return "cancelled";
              if (typeof startTimestamp === "number") {
                return startTimestamp < Date.now() ? "past" : "upcoming";
              }
              return "upcoming";
            })();

            return {
              ...session,
              date,
              time,
              duration,
              studentName:
                session.studentName || session.userName || student.name || student.fullName || "Student",
              studentAvatar:
                session.studentAvatar || session.userAvatar || student.image || student.avatar,
              studentId: session.studentId || session.userId || student.id || student._id,
              topic: session.topic || "General Coaching",
              status: derivedStatus,
              startTimestamp,
              bucket,
              notes: session.notes || "No notes available for this session.",
            } as FormattedSession;
          })
          .filter((s): s is FormattedSession => s !== null);

        setSessions(formattedSessions);
      } catch {
        toast.error(t("coaching.dashboard.failedToLoad"));
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchData();
    }
  }, [user?.id, t]);

  // Filter & sort logic
  const nowTs = Date.now();

  const resolveStartTs = (s: FormattedSession): number | undefined => {
    if (typeof s.startTimestamp === "number") return s.startTimestamp;
    const candidates = [s.startTime, s.slot?.start].filter(Boolean);
    for (const value of candidates) {
      const ts = Date.parse(value as string);
      if (!Number.isNaN(ts)) return ts;
    }
    return undefined;
  };

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      session.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.topic?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const startTs = resolveStartTs(session);
    const isFuture = typeof startTs === "number" && startTs >= nowTs;
    const isPast = typeof startTs === "number" && startTs < nowTs;

    if (session.status === "cancelled") {
      return activeTab === "cancelled" || activeTab === "all";
    }

    if (activeTab === "all") {
      if (statusFilter) return session.status === statusFilter;
      return true;
    }
    if (activeTab === "upcoming") return isFuture && session.status !== "cancelled";
    if (activeTab === "past") return isPast || session.status === "completed";
    if (activeTab === "cancelled") return false;

    return true;
  });

  const sortedSessions = filteredSessions.slice().sort((a, b) => {
    if (sortBy === "newest")
      return (new Date(b.startTime || b.slot?.start || 0).getTime() || 0) -
        (new Date(a.startTime || a.slot?.start || 0).getTime() || 0);
    if (sortBy === "oldest")
      return (new Date(a.startTime || a.slot?.start || 0).getTime() || 0) -
        (new Date(b.startTime || b.slot?.start || 0).getTime() || 0);
    const aPriority = a.status === "confirmed" || a.status === "rescheduled" ? 0 : 1;
    const bPriority = b.status === "confirmed" || b.status === "rescheduled" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (new Date(a.startTime || a.slot?.start || 0).getTime() || 0) -
      (new Date(b.startTime || b.slot?.start || 0).getTime() || 0);
  });

  const groupedSessions: Record<string, FormattedSession[]> = sortedSessions.reduce(
    (acc, s) => {
      const key = s?.date || "TBD";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    },
    {} as Record<string, FormattedSession[]>
  );

  const counts = {
    all: sessions.length,
    upcoming: sessions.filter((s) => {
      const startTs = resolveStartTs(s);
      return typeof startTs === "number" && startTs >= nowTs && s.status !== "cancelled";
    }).length,
    past: sessions.filter((s) => {
      const startTs = resolveStartTs(s);
      return (typeof startTs === "number" && startTs < nowTs) || s.status === "completed";
    }).length,
    cancelled: sessions.filter((s) => s.status === "cancelled").length,
  };

  // Handlers
  const handleViewNotes = (session: FormattedSession) => {
    setSelectedSession(session);
    setIsNotesOpen(true);
  };

  const handleViewProfile = (studentId: string) => {
    if (studentId) {
      setSelectedStudentId(studentId);
      setIsStudentSheetOpen(true);
    } else {
      toast.error(t("coaching.dashboard.studentProfileNotFound"));
    }
  };

  const handleRescheduleClick = (session: FormattedSession) => {
    setSelectedSession(session);
    setIsRescheduleOpen(true);
  };

  const handleCancelClick = (session: FormattedSession) => {
    setSelectedSession(session);
    setIsConfirmCancelOpen(true);
  };

  const handleSessionCancelled = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: "cancelled" } : s))
    );
  };

  const handleRescheduled = (
    sessionId: string,
    result: { start: string; end: string; date: string; time: string }
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, startTime: result.start, endTime: result.end, date: result.date, time: result.time, status: "rescheduled" }
          : s
      )
    );
  };

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Scheduling</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-2">
              Sessions History
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your coaching journey and session details
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            Sync Calendar
          </Button>
        </div>

        <SessionStatsGrid counts={counts} />

        <SessionFilters
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          counts={counts}
        />

        {/* Sessions List */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <SessionCardSkeleton key={i} />
              ))}
            </div>
          ) : sortedSessions.length === 0 ? (
            <div className="dash-card text-center py-20 sm:py-32 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center">
              <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-blue-50/50">
                <CalendarDays className="h-10 w-10 text-blue-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">No sessions found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? "Try adjusting your filters or search query."
                  : "Looks like you haven't scheduled any sessions yet."}
              </p>
              {searchQuery && (
                <Button
                  variant="link"
                  onClick={() => { setSearchQuery(""); setStatusFilter(null); }}
                  className="mt-4 text-blue-600"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedSessions).map(([dateKey, daySessions]) => (
                <div key={dateKey} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {dateKey}
                    </span>
                    <div className="h-px bg-[var(--border)] flex-1" />
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {daySessions.map((session, index) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        index={index}
                        onViewNotes={handleViewNotes}
                        onViewProfile={handleViewProfile}
                        onReschedule={handleRescheduleClick}
                        onCancelSession={handleCancelClick}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SessionNotesDialog
          open={isNotesOpen}
          onOpenChange={setIsNotesOpen}
          session={selectedSession}
        />

        <CancelSessionDialog
          open={isConfirmCancelOpen}
          onOpenChange={setIsConfirmCancelOpen}
          session={selectedSession}
          onSessionCancelled={handleSessionCancelled}
        />

        <RescheduleDialog
          open={isRescheduleOpen}
          onOpenChange={setIsRescheduleOpen}
          session={selectedSession}
          onRescheduled={handleRescheduled}
        />
      </div>

      <StudentDetailsSheet
        studentId={selectedStudentId}
        isOpen={isStudentSheetOpen}
        onClose={() => setIsStudentSheetOpen(false)}
      />
    </>
  );
}
