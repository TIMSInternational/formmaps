"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, isSameDay } from "date-fns";
import { unwrapList } from "@/lib/unwrapList";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MoreVertical,
  Search,
  Filter,
  User,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { StudentDetailsSheet } from "./_components/StudentDetailsSheet";
import { SessionCardSkeleton } from "@/components/skeletons/SessionCardSkeleton";

interface FormattedSession {
  id: string;
  date: string;
  time: string;
  duration: string;
  studentName: string;
  studentAvatar?: string;
  studentId?: string;
  topic: string;
  status: string;
  startTimestamp?: number;
  bucket: string;
  notes: string;
  startTime?: string;
  endTime?: string;
  slot?: { start: string; end: string };
  meetingLink?: string;
  studentImage?: string;
  [key: string]: unknown;
}

export default function SessionsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const router = useRouter();
  const [sessions, setSessions] = useState<FormattedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("upcoming");

  // State for Notes Dialog
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<FormattedSession | null>(null);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);

  // State for Student Profile Sheet
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );
  const [isStudentSheetOpen, setIsStudentSheetOpen] = useState(false);

  // State for Reschedule (Copied from Dashboard)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    new Date()
  );
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { getCoachSessions } = await import("@/services/coachService");

        // Fetch all sessions
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
            // Safety check for session object
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
                // Check for invalid date
                if (!isNaN(startDate.getTime())) {
                  date = format(startDate, "EEE, MMM d, yyyy");
                  time = format(startDate, "h:mm a");

                  if (endTime) {
                    const endDate = new Date(endTime);
                    if (!isNaN(endDate.getTime())) {
                      const diff =
                        (endDate.getTime() - startDate.getTime()) / (1000 * 60);
                      duration = `${Math.round(diff)} min`;
                      time = `${time} - ${format(endDate, "h:mm a")}`;
                    }
                  }
                }
              } catch (e) {
      // error handled silently
    }
            }

            const student = session.student || session.user || {};

            // Derive a safer status: completed if the start time is in the past and not already marked completed/cancelled
            let derivedStatus = session.status || "upcoming";
            if (
              typeof startTimestamp === "number" &&
              derivedStatus !== "completed" &&
              derivedStatus !== "cancelled"
            ) {
              const now = Date.now();
              if (startTimestamp < now) {
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
                session.studentName ||
                session.userName ||
                student.name ||
                student.fullName ||
                "Student",
              studentAvatar:
                session.studentAvatar ||
                session.userAvatar ||
                student.image ||
                student.avatar,
              studentId:
                session.studentId ||
                session.userId ||
                student.id ||
                student._id, // Ensure we have student ID
              topic: session.topic || "General Coaching",
              status: derivedStatus,
              startTimestamp,
              bucket,
              notes: session.notes || "No notes available for this session.",
            } as FormattedSession;
          })
          .filter((s): s is FormattedSession => s !== null);

        setSessions(formattedSessions);
      } catch (error) {
        toast.error(t("coaching.dashboard.failedToLoad"));
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  // --- Reschedule Logic (from Dashboard) ---

  const handleRescheduleClick = (session: FormattedSession) => {
    setSelectedSession(session);
    setRescheduleDate(new Date());
    setSelectedTime(null);
    setAvailableSlots([]);
    setIsRescheduleOpen(true);
  };

  // Fetch slots whenever rescheduleDate or selectedSession changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (!isRescheduleOpen || !selectedSession || !rescheduleDate || !user)
        return;

      setIsLoadingSlots(true);
      setAvailableSlots([]);
      setSelectedTime(null);

      try {
        const { getCoachAvailableSlots } = await import(
          "@/services/coachService"
        );
        const dateStr = format(rescheduleDate, "yyyy-MM-dd");
        if (!user?.id) return;
        // Using user.id as coachId
        const response = await getCoachAvailableSlots(user.id, dateStr);
        setAvailableSlots(response.slots || []);
      } catch (error) {
        toast.error(t("coaching.dashboard.failedToLoadSlots"));
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [isRescheduleOpen, selectedSession, rescheduleDate, user?.id]);

  const confirmReschedule = async () => {
    if (!rescheduleDate || !selectedTime || !selectedSession) {
      toast.error(t("coaching.dashboard.selectDateTime"));
      return;
    }

    try {
      const { rescheduleSession } = await import("@/services/coachService");

      // Construct start/end time
      const timeParts = selectedTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const meridian = timeParts[3].toLowerCase();

      if (meridian === "pm" && hours < 12) hours += 12;
      if (meridian === "am" && hours === 12) hours = 0;

      const startObj = new Date(rescheduleDate);
      startObj.setHours(hours, minutes, 0, 0);

      // Use original session duration, fallback to 60 min
      const originalStart = new Date(selectedSession.startTime || selectedSession.slot?.start || 0);
      const originalEnd = new Date(selectedSession.endTime || selectedSession.slot?.end || 0);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const durationMinutes = durationMs > 0 ? Math.round(durationMs / 60000) : 60;

      const endObj = new Date(startObj);
      endObj.setMinutes(startObj.getMinutes() + durationMinutes);

      const start = startObj.toISOString();
      const end = endObj.toISOString();

      await rescheduleSession(selectedSession.id, { start, end });

      // Update local state
      const updatedSessions = sessions.map((s) => {
        if (s.id === selectedSession.id) {
          // Update the specific session
          return {
            ...s,
            startTime: start,
            endTime: end,
            date: format(startObj, "EEE, MMM d, yyyy"),
            time: `${format(startObj, "h:mm a")} - ${format(endObj, "h:mm a")}`,
            status: "rescheduled",
          };
        }
        return s;
      });

      setSessions(updatedSessions);

      toast.success(t("coaching.dashboard.rescheduleSuccess"));
      setIsRescheduleOpen(false);
      setSelectedSession(null);
      setRescheduleDate(undefined);
      setSelectedTime(null);
    } catch (error) {
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  // --- End Reschedule Logic ---

  // Filter logic
  const nowTs = Date.now();

  const resolveStartTs = (s: FormattedSession): number | undefined => {
    if (typeof s.startTimestamp === "number") return s.startTimestamp;
    const candidates = [
      s.startTime,
      s.slot?.start,
    ].filter(Boolean);

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
    const isPast = typeof startTs === "number" && startTs < nowTs;
    const isFuture = typeof startTs === "number" && startTs >= nowTs;
    const bucket = session.bucket || (isPast ? "past" : "upcoming");

    // Never show cancelled in upcoming/past, only in cancelled tab
    if (session.status === "cancelled") {
      return activeTab === "cancelled" || activeTab === "all";
    }

    if (activeTab === "all") {
      // also apply statusFilter if provided
      if (statusFilter) return session.status === statusFilter;
      return true;
    }
    if (activeTab === "upcoming")
      return isFuture && session.status !== "cancelled";
    if (activeTab === "past") return isPast || session.status === "completed";
    if (activeTab === "cancelled") return false; // already handled above

    return true;
  });

  // Sorting
  const sortedSessions = filteredSessions.slice().sort((a, b) => {
    if (sortBy === "newest")
      return (
        (new Date(b.startTime || b.slot?.start || 0).getTime() || 0) -
        (new Date(a.startTime || a.slot?.start || 0).getTime() || 0)
      );
    if (sortBy === "oldest")
      return (
        (new Date(a.startTime || a.slot?.start || 0).getTime() || 0) -
        (new Date(b.startTime || b.slot?.start || 0).getTime() || 0)
      );
    // default upcoming: put confirmed/rescheduled first then by date
    const aPriority =
      a.status === "confirmed" || a.status === "rescheduled" ? 0 : 1;
    const bPriority =
      b.status === "confirmed" || b.status === "rescheduled" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (
      (new Date(a.startTime || a.slot?.start || 0).getTime() || 0) -
      (new Date(b.startTime || b.slot?.start || 0).getTime() || 0)
    );
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
      const isFuture = typeof startTs === "number" && startTs >= nowTs;
      return isFuture && s.status !== "cancelled";
    }).length,
    past: sessions.filter((s) => {
      const startTs = resolveStartTs(s);
      const isPast = typeof startTs === "number" && startTs < nowTs;
      return isPast || s.status === "completed";
    }).length,
    cancelled: sessions.filter((s) => s.status === "cancelled").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
      case "rescheduled":
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
            Upcoming
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
            Completed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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

  return (
    <>
    <div className="space-y-8">
        {/* Header Section */}
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

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Sessions", value: counts.all, icon: CalendarIcon, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
            { label: "Upcoming", value: counts.upcoming, icon: Clock, iconColor: "text-purple-500", iconBg: "bg-purple-500/10" },
            { label: "Completed", value: counts.past, icon: CheckCircle2, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
            { label: "Cancelled", value: counts.cancelled, icon: XCircle, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="dash-card p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters and Search Bar */}
        <div className="dash-card p-4 flex flex-col xl:flex-row gap-4 justify-between">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full xl:w-auto overflow-x-auto no-scrollbar"
          >
            <TabsList className="p-1 rounded-xl flex w-full xl:w-auto min-w-max h-auto">
              {["all", "upcoming", "past", "cancelled"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-all capitalize flex-1 xl:flex-none"
                >
                  {tab} ({counts[tab as keyof typeof counts]})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <div className="relative flex-1 sm:min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search student, topic..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Select
                value={statusFilter ?? "all"}
                onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">Upcoming</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming First</SelectItem>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

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
                <CalendarDays
                  className="h-10 w-10 text-blue-500"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                No sessions found
              </h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? "Try adjusting your filters or search query."
                  : "Looks like you haven't scheduled any sessions yet."}
              </p>
              {searchQuery && (
                <Button
                  variant="link"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter(null);
                  }}
                  className="mt-4 text-blue-600"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedSessions).map(
                ([dateKey, daySessions]: [string, FormattedSession[]]) => (
                  <div key={dateKey} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {dateKey}
                      </span>
                      <div className="h-px bg-[var(--border)] flex-1" />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {daySessions.map((session, index) => (
                        <motion.div
                          key={session.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.05 }}
                          className="group"
                        >
                          <div className="dash-card p-5 transition-colors hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))]">
                            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                              <div
                                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                onClick={() => handleViewProfile(session.studentId || "")}
                              >
                                <Avatar className="h-10 w-10 border border-[var(--border)]">
                                  <AvatarImage src={session.studentAvatar} />
                                  <AvatarFallback className="text-sm bg-blue-500/10 text-blue-600 font-semibold">
                                    {session.studentName?.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-foreground truncate">{session.studentName}</h3>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-xs">{session.topic?.replace(/-/g, " ")}</Badge>
                                    {getStatusBadge(session.status)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground text-xs">{session.time}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground text-xs">{session.duration}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {(session.status === "confirmed" || session.status === "rescheduled") && session.meetingLink && (
                                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 text-xs rounded-lg" asChild>
                                    <a href={session.meetingLink} target="_blank" rel="noreferrer">
                                      <Video className="w-3.5 h-3.5 mr-1" /> Join
                                    </a>
                                  </Button>
                                )}
                                <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" onClick={() => handleViewNotes(session)}>
                                  <FileText className="w-3.5 h-3.5 mr-1" /> Notes
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => handleViewProfile(session.studentId || "")} className="cursor-pointer">
                                      <User className="mr-2 h-4 w-4 text-muted-foreground" /> Profile
                                    </DropdownMenuItem>
                                    {(session.status === "confirmed" || session.status === "rescheduled") && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleRescheduleClick(session)} className="cursor-pointer">
                                          <CalendarDays className="mr-2 h-4 w-4 text-orange-400" /> Reschedule
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => { setSelectedSession(session); setIsConfirmCancelOpen(true); }}
                                          className="cursor-pointer text-red-600 focus:text-red-600"
                                        >
                                          <XCircle className="mr-2 h-4 w-4" /> Cancel Session
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Notes Dialog */}
        <Dialog open={isNotesOpen} onOpenChange={setIsNotesOpen}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                Session Notes
              </DialogTitle>
              <DialogDescription className="ml-14 text-base">
                Private notes for your session with{" "}
                <span className="font-semibold text-foreground">
                  {selectedSession?.studentName}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4">
              <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-2xl text-foreground whitespace-pre-wrap leading-relaxed min-h-[150px] font-medium font-serif text-lg">
                {selectedSession?.notes ||
                  "No notes available for this session."}
              </div>
              <p className="mt-4 text-xs text-center text-muted-foreground italic">
                These notes are private and only visible to you.
              </p>
            </div>
            <DialogFooter className="p-6 pt-2">
              <Button
                onClick={() => setIsNotesOpen(false)}
                variant="outline"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <Dialog
          open={isConfirmCancelOpen}
          onOpenChange={setIsConfirmCancelOpen}
        >
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="p-8 text-center flex flex-col items-center">
              <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-bounce-slow">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Cancel Session?
              </h3>
              <p className="text-muted-foreground text-center mb-8 leading-relaxed">
                Are you sure you want to cancel the session with{" "}
                <span className="font-semibold text-foreground">
                  {selectedSession?.studentName}
                </span>
                ? This action cannot be undone.
              </p>

              <div className="flex flex-col gap-3 w-full">
                <Button
                  variant="destructive" className="w-full"
                  onClick={async () => {
                    try {
                      if (!selectedSession) return;

                      // 1. Optimistic Update
                      const updatedSessions = sessions.map((s) =>
                        s.id === selectedSession.id
                          ? { ...s, status: "cancelled" }
                          : s
                      );
                      setSessions(updatedSessions);

                      toast.success(t("coaching.dashboard.sessionCancelled"));
                      setIsConfirmCancelOpen(false);

                      // 2. API Call
                      const { cancelSession } = await import(
                        "@/services/coachService"
                      );
                      await cancelSession(
                        selectedSession.id,
                        "Cancelled by coach"
                      );
                    } catch (error) {
                      toast.error(t("coaching.dashboard.cancelFailed"));
                      // Revert optimistic update if needed, but for now we keep it simple
                      // as a failure toast is shown.Ideally we'd refetch or revert.
                    }
                  }}
                >
                  Yes, Cancel Session
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-12 rounded-xl text-muted-foreground font-semibold hover:bg-gray-100"
                  onClick={() => setIsConfirmCancelOpen(false)}
                >
                  Keep Session
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reschedule Dialog (Copied & Adapted) */}
        <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
          <DialogContent className="sm:max-w-[900px] w-full p-0 overflow-hidden gap-0">
            <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh] overflow-y-auto md:overflow-hidden">
              {/* Column 1: Calendar */}
              <div className="flex-1 p-6 sm:p-8 border-r border-[var(--border)] flex flex-col">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-foreground mb-1">
                    Reschedule Session
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Select a new date and time for{" "}
                    {selectedSession?.studentName}
                  </p>
                </div>

                <div className="flex items-center justify-between mb-4 px-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-gray-100"
                    onClick={() => {
                      const newMonth = new Date(currentMonth);
                      newMonth.setMonth(newMonth.getMonth() - 1);
                      setCurrentMonth(newMonth);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-base font-semibold text-foreground capitalize">
                    {format(currentMonth, "MMMM yyyy")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-gray-100"
                    onClick={() => {
                      const newMonth = new Date(currentMonth);
                      newMonth.setMonth(newMonth.getMonth() + 1);
                      setCurrentMonth(newMonth);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={setRescheduleDate}
                    month={currentMonth}
                    onMonthChange={setCurrentMonth}
                    className="p-0"
                    showOutsideDays={false}
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-4",
                      caption: "hidden",
                      nav: "hidden",
                      month_grid: "w-full border-collapse",
                      weekdays: "flex justify-between mb-2",
                      weekday:
                        "text-muted-foreground font-medium text-xs uppercase w-9 text-center",
                      week: "flex justify-between w-full mb-2",
                      day: "h-9 w-9 text-center text-sm relative flex items-center justify-center p-0 hover:bg-transparent focus-within:relative focus-within:z-20",
                      day_button: cn(
                        "h-9 w-9 p-0 font-normal rounded-full transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none",
                        "aria-selected:opacity-100"
                      ),
                      selected:
                        "bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white shadow-md font-semibold",
                      today: "bg-gray-100 text-foreground font-semibold",
                      outside: "text-gray-300 opacity-50 pointer-events-none",
                      disabled: "text-gray-300 opacity-50 cursor-not-allowed",
                      hidden: "invisible",
                    }}
                    disabled={(date) => {
                      const t = new Date();
                      t.setHours(0, 0, 0, 0);
                      return date < t;
                    }}
                  />
                </div>
              </div>

              {/* Column 2: Time Slots */}
              <div className="w-full md:w-[320px] flex flex-col border-t md:border-t-0">
                <div className="p-6 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                      <AvatarImage
                        src={
                          selectedSession?.studentImage ||
                          selectedSession?.studentAvatar
                        }
                      />
                      <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-semibold">
                        {selectedSession?.studentName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm truncate">
                        {selectedSession?.studentName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedSession?.topic?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6 flex flex-col min-h-[300px]">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Available Times
                    {rescheduleDate && (
                      <span className="text-muted-foreground font-normal ml-auto text-xs">
                        {format(rescheduleDate, "MMM d")}
                      </span>
                    )}
                  </h4>

                  <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                    {isLoadingSlots ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-xs">Checking availability...</p>
                      </div>
                    ) : !rescheduleDate ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-sm">Select a date to see times</p>
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <Clock className="h-5 w-5 opacity-30" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          No slots available
                        </p>
                        <p className="text-xs">Try selecting another date</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {availableSlots.map((time) => (
                          <button
                            key={time}
                            onClick={() => setSelectedTime(time)}
                            className={cn(
                              "px-3 py-2 text-sm font-medium rounded-xl border transition-all text-center",
                              selectedTime === time
                                ? "bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.02]"
                                : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                            )}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-[var(--border)]">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsRescheduleOpen(false)}
                      className="flex-1 h-11 rounded-xl font-semibold border-gray-200 hover:bg-gray-50"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmReschedule}
                      disabled={!selectedTime || isLoadingSlots}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-xl font-semibold disabled:opacity-50"
                    >
                      Confirm
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <StudentDetailsSheet
        studentId={selectedStudentId}
        isOpen={isStudentSheetOpen}
        onClose={() => setIsStudentSheetOpen(false)}
      />
    </>
  );
}
