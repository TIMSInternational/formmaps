"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, isSameDay } from "date-fns";
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
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { StudentDetailsSheet } from "./_components/StudentDetailsSheet";
import { SessionCardSkeleton } from "@/components/skeletons/SessionCardSkeleton";

export default function SessionsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("upcoming");

  // State for Notes Dialog
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
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

        // Robust data extraction
        const rawSessions = Array.isArray((sessionsData as any)?.data?.data)
          ? (sessionsData as any).data.data
          : Array.isArray((sessionsData as any)?.data)
            ? (sessionsData as any).data
            : Array.isArray(sessionsData)
              ? sessionsData
              : [];

        const resolveStartTs = (s: any): number | undefined => {
          const candidates = [
            s.startTime,
            s.slot?.start,
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

        const formattedSessions = rawSessions
          .map((session: any) => {
            // Safety check for session object
            if (!session) return null;

            const startTime = session.startTime || session.slot?.start;
            const endTime = session.endTime || session.slot?.end;
            const startTimestamp = resolveStartTs(session);

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
                console.error("Error parsing date:", e);
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
            };
          })
          .filter(Boolean); // Remove nulls

        console.log("Formatted sessions with status:", formattedSessions.map((s: any) => ({ id: s.id, status: s.status, startTime: s.startTime })));
        setSessions(formattedSessions);
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
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

  const handleRescheduleClick = (session: any) => {
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
        console.error("Failed to fetch slots", error);
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

      const endObj = new Date(startObj);
      endObj.setMinutes(startObj.getMinutes() + 60); // Default 60 min

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
      console.error("Reschedule failed:", error);
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  // --- End Reschedule Logic ---

  // Filter logic
  const nowTs = Date.now();

  const resolveStartTs = (s: any): number | undefined => {
    if (typeof s.startTimestamp === "number") return s.startTimestamp;
    const candidates = [
      s.startTime,
      s.slot?.start,
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

  const groupedSessions: Record<string, any[]> = sortedSessions.reduce(
    (acc, s) => {
      const key = s?.date || "TBD";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    },
    {} as Record<string, any[]>
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

  const handleViewNotes = (session: any) => {
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
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-100/40 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2">
              Sessions History
            </h1>
            <p className="text-gray-500 font-medium text-base sm:text-lg">
              Manage your coaching journey and session details
            </p>
          </div>
          <Button className="w-full md:w-auto bg-gray-900 text-white hover:bg-black h-12 px-6 rounded-xl shadow-lg shadow-gray-900/10 gap-2 transition-all hover:scale-105 active:scale-95 border border-gray-800">
            <CalendarIcon className="h-4 w-4" />
            Sync Calendar
          </Button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Sessions",
              value: counts.all,
              icon: CalendarIcon,
              gradient: "from-blue-500 to-blue-600",
              shadow: "shadow-blue-500/20",
              textGradient: "text-blue-600",
              bg: "bg-blue-50/50",
            },
            {
              label: "Upcoming",
              value: counts.upcoming,
              icon: Clock,
              gradient: "from-violet-500 to-purple-600",
              shadow: "shadow-purple-500/20",
              textGradient: "text-purple-600",
              bg: "bg-purple-50/50",
            },
            {
              label: "Completed",
              value: counts.past,
              icon: CheckCircle2,
              gradient: "from-emerald-400 to-green-500",
              shadow: "shadow-green-500/20",
              textGradient: "text-green-600",
              bg: "bg-green-50/50",
            },
            {
              label: "Cancelled",
              value: counts.cancelled,
              icon: XCircle,
              gradient: "from-red-500 to-rose-600",
              shadow: "shadow-red-500/20",
              textGradient: "text-red-600",
              bg: "bg-red-50/50",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="group relative bg-white/80 backdrop-blur-2xl rounded-3xl p-6 border border-white/60 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
            >
              {/* Decorative Background Blob */}
              <div
                className={cn(
                  "absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-10 blur-2xl transition-transform group-hover:scale-150 bg-gradient-to-br",
                  stat.gradient
                )}
              />

              <div className="relative z-10 flex flex-col justify-between h-full gap-4">
                <div className="flex justify-between items-start">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg text-white bg-gradient-to-br",
                      stat.gradient,
                      stat.shadow
                    )}
                  >
                    <stat.icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                  {/* Optional Trend Badge (Visual only) */}
                  <div
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white border shadow-sm",
                      stat.textGradient
                        .replace("text-", "text-")
                        .replace("600", "700")
                    )}
                  >
                    Details
                  </div>
                </div>

                <div>
                  <h3
                    className={cn(
                      "text-4xl font-extrabold tracking-tight mt-2 bg-clip-text text-transparent bg-gradient-to-br",
                      stat.gradient
                    )}
                  >
                    {stat.value}
                  </h3>
                  <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mt-1">
                    {stat.label}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-white/60 backdrop-blur-2xl rounded-3xl shadow-xl shadow-gray-100/50 border border-white/50 p-4 sm:p-6 flex flex-col xl:flex-row gap-4 justify-between">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full xl:w-auto overflow-x-auto no-scrollbar"
          >
            <TabsList className="bg-gray-100/80 p-1.5 rounded-xl flex w-full xl:w-auto min-w-max h-auto">
              {["all", "upcoming", "past", "cancelled"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-lg px-4 py-2 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all text-gray-500 capitalize flex-1 xl:flex-none"
                >
                  {tab}
                  <span className="ml-2 bg-gray-200/50 px-1.5 rounded-full text-xs text-gray-500 group-data-[state=active]:bg-blue-50 group-data-[state=active]:text-blue-600">
                    {(counts as any)[tab]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <div className="relative flex-1 sm:min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search student, topic..."
                className="pl-10 h-11 bg-white/80 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Select
                value={statusFilter ?? "all"}
                onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-[160px] h-11 bg-white/80 border-gray-200 rounded-xl">
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
                <SelectTrigger className="w-full sm:w-[140px] h-11 bg-white/80 border-gray-200 rounded-xl">
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
            <div className="text-center py-20 sm:py-32 bg-white/60 backdrop-blur-xl rounded-[2rem] border-2 border-dashed border-gray-200/60 flex flex-col items-center justify-center">
              <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-blue-50/50">
                <CalendarDays
                  className="h-10 w-10 text-blue-500"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                No sessions found
              </h3>
              <p className="text-gray-500 max-w-sm mx-auto">
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
                ([dateKey, daySessions]: [string, any[]]) => (
                  <div key={dateKey} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-gray-900 uppercase tracking-wider bg-white/50 px-3 py-1 rounded-full backdrop-blur-sm border border-black/5 shadow-sm">
                        {dateKey}
                      </span>
                      <div className="h-px bg-gradient-to-r from-gray-200 to-transparent flex-1" />
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
                          <div className="relative bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 overflow-hidden hover:bg-white/60">
                            {/* Left Accent Gradient */}
                            <div
                              className={cn(
                                "absolute left-0 top-0 bottom-0 w-1 opacity-100",
                                session.status === "cancelled"
                                  ? "bg-gradient-to-b from-red-400 to-red-600"
                                  : session.status === "completed"
                                    ? "bg-gradient-to-b from-green-400 to-green-600"
                                    : "bg-gradient-to-b from-blue-400 to-blue-600"
                              )}
                            />

                            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center pl-2">
                              {/* Student Info */}
                              <div
                                className="flex items-center gap-5 flex-1 w-full lg:w-auto cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() =>
                                  handleViewProfile(session.studentId)
                                }
                              >
                                <div className="relative">
                                  <div
                                    className={cn(
                                      "absolute inset-0 rounded-full blur-sm opacity-20",
                                      session.status === "cancelled"
                                        ? "bg-red-500"
                                        : session.status === "completed"
                                          ? "bg-green-500"
                                          : "bg-blue-500"
                                    )}
                                  />
                                  <Avatar className="h-16 w-16 border-4 border-white shadow-sm relative z-10">
                                    <AvatarImage src={session.studentAvatar} />
                                    <AvatarFallback className="text-xl bg-gradient-to-br from-gray-50 to-gray-200 text-gray-600 font-bold">
                                      {session.studentName?.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>

                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <h3 className="font-bold text-gray-900 text-xl tracking-tight truncate">
                                      {session.studentName}
                                    </h3>
                                    {getStatusBadge(session.status)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="bg-white/80 border text-gray-500 font-medium px-2.5 py-0.5 shadow-sm"
                                    >
                                      {session.topic?.toUpperCase()}
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              {/* Divider Desktop */}
                              <div className="hidden lg:block w-px h-16 bg-gradient-to-b from-transparent via-gray-200 to-transparent" />

                              {/* Session Details */}
                              <div className="flex flex-row lg:flex-col gap-6 lg:gap-1.5 w-full lg:w-56 justify-between lg:justify-center">
                                <div className="flex items-center gap-2.5 text-gray-700">
                                  <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <Clock className="w-4 h-4" />
                                  </div>
                                  <span className="font-bold text-lg">
                                    {session.time}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2.5 text-gray-500 text-sm font-medium pl-1">
                                  <CalendarIcon className="w-4 h-4 opacity-50" />
                                  {session.duration} session
                                </div>
                              </div>

                              {/* Actions Area */}
                              <div className="flex items-center gap-3 w-full lg:w-auto justify-end mt-4 lg:mt-0 pt-5 lg:pt-0 border-t lg:border-t-0 border-gray-100/50">
                                {(session.status === "confirmed" ||
                                  session.status === "rescheduled") && (
                                    <Button
                                      className="flex-1 lg:flex-none bg-gray-900 text-white hover:bg-black h-11 px-6 rounded-2xl text-sm font-bold shadow-xl shadow-gray-900/10 transition-all hover:scale-105 active:scale-95"
                                      asChild
                                    >
                                      <a
                                        href={session.meetingLink}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Video className="w-4 h-4 mr-2" /> Join
                                      </a>
                                    </Button>
                                  )}

                                <Button
                                  variant="outline"
                                  className="flex-1 lg:flex-none border-gray-200/60 bg-white/50 hover:bg-white text-gray-700 h-11 px-5 rounded-2xl font-semibold shadow-sm hover:shadow transition-all"
                                  onClick={() => handleViewNotes(session)}
                                >
                                  <FileText className="w-4 h-4 mr-2 text-gray-400" />{" "}
                                  Notes
                                </Button>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-11 w-11 rounded-2xl hover:bg-white hover:shadow-md text-gray-400 hover:text-gray-900 transition-all"
                                    >
                                      <MoreVertical className="h-5 w-5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-48 rounded-xl p-1.5 shadow-xl border-gray-100"
                                  >
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleViewProfile(session.studentId)
                                      }
                                      className="rounded-lg p-2.5 font-medium cursor-pointer"
                                    >
                                      <User className="mr-2 h-4 w-4 text-gray-400" />{" "}
                                      Profile
                                    </DropdownMenuItem>
                                    {(session.status === "confirmed" ||
                                      session.status === "rescheduled") && (
                                        <>
                                          <DropdownMenuSeparator className="bg-gray-100 my-1" />
                                          <DropdownMenuItem
                                            onClick={() =>
                                              handleRescheduleClick(session)
                                            }
                                            className="rounded-lg p-2.5 font-medium cursor-pointer focus:bg-orange-50 focus:text-orange-700 text-gray-700"
                                          >
                                            <CalendarDays className="mr-2 h-4 w-4 text-orange-400" />{" "}
                                            Reschedule
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setSelectedSession(session);
                                              setIsConfirmCancelOpen(true);
                                            }}
                                            className="rounded-lg p-2.5 font-medium cursor-pointer focus:bg-red-50 focus:text-red-700 text-red-600"
                                          >
                                            <XCircle className="mr-2 h-4 w-4 text-red-500" />{" "}
                                            Cancel Session
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
          <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden bg-white border-none shadow-2xl">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                Session Notes
              </DialogTitle>
              <DialogDescription className="ml-14 text-base">
                Private notes for your session with{" "}
                <span className="font-semibold text-gray-900">
                  {selectedSession?.studentName}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4">
              <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-2xl text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[150px] font-medium font-serif text-lg">
                {selectedSession?.notes ||
                  "No notes available for this session."}
              </div>
              <p className="mt-4 text-xs text-center text-gray-400 italic">
                These notes are private and only visible to you.
              </p>
            </div>
            <DialogFooter className="p-6 pt-2 bg-gray-50/50">
              <Button
                onClick={() => setIsNotesOpen(false)}
                className="w-full sm:w-auto h-12 rounded-xl bg-gray-900 text-white font-semibold"
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
          <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden bg-white border-none shadow-2xl">
            <div className="p-8 text-center flex flex-col items-center">
              <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-bounce-slow">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Cancel Session?
              </h3>
              <p className="text-gray-500 text-center mb-8 leading-relaxed">
                Are you sure you want to cancel the session with{" "}
                <span className="font-semibold text-gray-900">
                  {selectedSession?.studentName}
                </span>
                ? This action cannot be undone.
              </p>

              <div className="flex flex-col gap-3 w-full">
                <Button
                  className="w-full h-12 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-500/20 font-bold"
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
                      console.error("Failed to cancel session:", error);
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
                  className="w-full h-12 rounded-xl text-gray-600 font-semibold hover:bg-gray-100"
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
          <DialogContent className="sm:max-w-[900px] w-full p-0 overflow-hidden gap-0 bg-white border-0 shadow-2xl rounded-3xl">
            <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh] overflow-y-auto md:overflow-hidden">
              {/* Column 1: Calendar */}
              <div className="flex-1 p-6 sm:p-8 border-r border-gray-100 flex flex-col bg-white">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    Reschedule Session
                  </h2>
                  <p className="text-gray-500 text-sm">
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
                  <span className="text-base font-semibold text-gray-900 capitalize">
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
                        "text-gray-400 font-medium text-xs uppercase w-9 text-center",
                      week: "flex justify-between w-full mb-2",
                      day: "h-9 w-9 text-center text-sm relative flex items-center justify-center p-0 hover:bg-transparent focus-within:relative focus-within:z-20",
                      day_button: cn(
                        "h-9 w-9 p-0 font-normal rounded-full transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none",
                        "aria-selected:opacity-100"
                      ),
                      selected:
                        "bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white shadow-md font-semibold",
                      today: "bg-gray-100 text-gray-900 font-semibold",
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
              <div className="w-full md:w-[320px] bg-gray-50/50 flex flex-col border-t md:border-t-0">
                <div className="p-6 border-b border-gray-200/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                      <AvatarImage
                        src={
                          selectedSession?.studentImage ||
                          selectedSession?.studentAvatar
                        }
                      />
                      <AvatarFallback className="bg-gray-900 text-white text-xs">
                        {selectedSession?.studentName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">
                        {selectedSession?.studentName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {selectedSession?.topic?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6 flex flex-col min-h-[300px]">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Available Times
                    {rescheduleDate && (
                      <span className="text-gray-400 font-normal ml-auto text-xs">
                        {format(rescheduleDate, "MMM d")}
                      </span>
                    )}
                  </h4>

                  <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                    {isLoadingSlots ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-xs">Checking availability...</p>
                      </div>
                    ) : !rescheduleDate ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-4">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-sm">Select a date to see times</p>
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-4">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <Clock className="h-5 w-5 opacity-30" />
                        </div>
                        <p className="text-sm font-medium text-gray-600 mb-1">
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

                <div className="p-6 border-t border-gray-200/50 bg-white md:bg-transparent">
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
                      className="flex-1 bg-black text-white hover:bg-gray-800 h-11 rounded-xl font-semibold shadow-lg shadow-black/5 disabled:opacity-50"
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
    </div>
  );
}
