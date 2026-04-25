"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Video,
  User,
  FileText,
  X,
  MoreHorizontal,
  ArrowUpRight,
  Star,
  Users,
  Menu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AvailabilityStep } from "@/components/onboarding/AvailabilityStep";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";

import {} from "@/components/ui/select";
import { format, isSameDay } from "date-fns";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { getLocalTimeZone, today, parseDate } from "@internationalized/date";
import { motion } from "motion/react";
import { Calendar } from "@/components/ui/calendar";

// Default Availability Data (for initialization)
const INITIAL_AVAILABILITY = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weeklySchedule: [
    {
      day: "Monday",
      enabled: true,
      timeSlots: [{ start: "09:00", end: "17:00" }],
    },
    {
      day: "Tuesday",
      enabled: true,
      timeSlots: [{ start: "09:00", end: "17:00" }],
    },
    {
      day: "Wednesday",
      enabled: true,
      timeSlots: [{ start: "09:00", end: "17:00" }],
    },
    {
      day: "Thursday",
      enabled: true,
      timeSlots: [{ start: "09:00", end: "17:00" }],
    },
    {
      day: "Friday",
      enabled: true,
      timeSlots: [{ start: "09:00", end: "17:00" }],
    },
    { day: "Saturday", enabled: false, timeSlots: [] },
    { day: "Sunday", enabled: false, timeSlots: [] },
  ],
};

export function CoachDashboard() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    new Date(),
  );
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(INITIAL_AVAILABILITY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const { getCoachSessions, getAvailability, getCoachStudents } =
          await import("@/services/coachService");

        const [sessionsData, availabilityData, studentsData] =
          await Promise.all([
            getCoachSessions("all"),
            getAvailability(),
            getCoachStudents(),
          ]);

        console.log("📦 Raw API response - sessions:", sessionsData);
        console.log("📦 Raw API response - availability:", availabilityData);

        // Handle different response structures
        const rawSessions = Array.isArray((sessionsData as any)?.data?.data)
          ? (sessionsData as any).data.data
          : Array.isArray((sessionsData as any)?.data)
            ? (sessionsData as any).data
            : Array.isArray(sessionsData)
              ? sessionsData
              : [];

        // Map sessions to include formatted date and time
        const sessions = rawSessions.map((session: any) => {
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
              console.error("Error parsing date:", e);
            }
          }

          return {
            ...session,
            date,
            time,
            duration,
          };
        });

        // Filter sessions with time-based classification
        const nowTs = Date.now();
        const upcoming = sessions.filter((s: any) => {
          if (s.status === "cancelled") return false;
          const startTs = Date.parse(s.startTime || s.slot?.start || "");
          const isFuture = !Number.isNaN(startTs) && startTs >= nowTs;
          return (
            isFuture && (s.status === "confirmed" || s.status === "rescheduled")
          );
        });
        const past = sessions.filter((s: any) => {
          const startTs = Date.parse(s.startTime || s.slot?.start || "");
          const isPast = !Number.isNaN(startTs) && startTs < nowTs;
          return s.status === "completed" || s.status === "cancelled" || isPast;
        });

        setUpcomingSessions(upcoming);
        setPastSessions(past);

        // Handle student data parsing
        const studentsResponse = studentsData as any;
        const studentsList = Array.isArray(studentsResponse?.data?.data)
          ? studentsResponse.data.data
          : Array.isArray(studentsResponse?.data)
            ? studentsResponse.data
            : [];

        setStudents(studentsList);

        setAvailability(
          (availabilityData as any)?.data ||
            availabilityData ||
            INITIAL_AVAILABILITY,
        );

        console.log("✅ Coach dashboard data loaded from API:", {
          upcoming,
          past,
          availability: availabilityData,
        });
      } catch (error: any) {
        console.error("❌ Failed to fetch coach dashboard data:", error);
        setError(t("coaching.dashboard.failedToLoad"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSaveAvailability = async (data: any) => {
    try {
      const { updateAvailability } = await import("@/services/coachService");
      await updateAvailability(data);
      setAvailability(data);
      toast.success(t("coaching.dashboard.availabilityUpdated"));
      setIsAvailabilityOpen(false);
    } catch (error) {
      toast.error(t("coaching.dashboard.failedToUpdateAvailability"));
    }
  };

  const handleRescheduleClick = (session: any) => {
    setSelectedSession(session);
    setRescheduleDate(new Date());
    setSelectedTime(null);
    setAvailableSlots([]);
    setIsRescheduleOpen(true);
  };

  // Fetch slots whenever rescheduleDate or selectedSession changes
  React.useEffect(() => {
    const fetchSlots = async () => {
      if (!isRescheduleOpen || !selectedSession || !rescheduleDate || !user?.id)
        return;

      setIsLoadingSlots(true);
      setAvailableSlots([]);
      setSelectedTime(null);

      try {
        const { getCoachAvailableSlots } =
          await import("@/services/coachService");
        const dateStr = format(rescheduleDate, "yyyy-MM-dd");
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
  }, [isRescheduleOpen, selectedSession, rescheduleDate, user.id]);

  const confirmReschedule = async () => {
    if (!rescheduleDate || !selectedTime) {
      toast.error(t("coaching.dashboard.selectDateTime"));
      return;
    }

    try {
      const { rescheduleSession } = await import("@/services/coachService");

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
      endObj.setMinutes(startObj.getMinutes() + 60);

      const start = startObj.toISOString();
      const end = endObj.toISOString();

      await rescheduleSession(selectedSession.id, { start, end });

      // Optimistic Update
      const updatedSessions = upcomingSessions.map((session) => {
        if (session.id === selectedSession.id) {
          return {
            ...session,
            startTime: start,
            endTime: end,
            date: format(startObj, "EEE, MMM d, yyyy"),
            time: `${format(startObj, "h:mm a")} - ${format(endObj, "h:mm a")}`,
            status: "rescheduled",
          };
        }
        return session;
      });

      setUpcomingSessions(updatedSessions);

      toast.success(t("coaching.dashboard.rescheduleSuccess"));
      setIsRescheduleOpen(false);
      setSelectedSession(null);
      setRescheduleDate(undefined);
      setSelectedTime(null);
    } catch (error) {
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-100/40 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10 space-y-8 sm:space-y-12">
        {/* Header Section */}
        {error && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3"
            role="alert"
          >
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="block sm:inline font-medium">{error}</span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-5 sm:gap-6 w-full lg:w-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-4 border-white shadow-xl relative">
                <AvatarImage
                  src={user.avatar || user.image || undefined}
                  className="object-cover"
                />
                <AvatarFallback className="bg-gradient-to-br from-gray-900 to-black text-white text-2xl">
                  {user.name?.charAt(0).toUpperCase() || "C"}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-1.5">
                {new Date().getHours() < 12
                  ? t("coach.greeting.morning")
                  : new Date().getHours() < 18
                    ? t("coach.greeting.afternoon")
                    : t("coach.greeting.evening")}
                ,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                  {user.name?.split(" ")[0] || t("coach.defaultName")}
                </span>
              </h1>
              <p className="text-gray-500 font-medium text-base sm:text-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {t("coach.upcomingSessions", {
                  count: upcomingSessions.length,
                })}
              </p>
            </div>
          </div>

          <Dialog
            open={isAvailabilityOpen}
            onOpenChange={setIsAvailabilityOpen}
          >
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-gray-900 text-white hover:bg-black h-12 sm:h-14 px-8 rounded-2xl shadow-lg shadow-gray-900/20 transition-all hover:shadow-xl hover:-translate-y-0.5 text-base font-semibold border border-gray-800">
                <div className="flex items-center gap-2">
                  <CalendarIcon
                    className="w-5 h-5 text-gray-300"
                    aria-label="Calendar Icon"
                  />{" "}
                  <span>{t("coach.manageAvailability")}</span>
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl h-[85vh] sm:h-[80vh] flex flex-col p-0 gap-0 rounded-3xl overflow-hidden border-0">
              <DialogHeader className="px-6 py-5 border-b bg-white input-border-color shrink-0">
                <DialogTitle className="text-xl font-bold">
                  {t("coach.editAvailability")}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50/50">
                <AvailabilityStep
                  data={INITIAL_AVAILABILITY}
                  onNext={handleSaveAvailability}
                  onBack={() => setIsAvailabilityOpen(false)}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            {
              label: t("coach.stats.totalSessions"),
              value: upcomingSessions.length + pastSessions.length,
              sub: t("coach.stats.sessions"),
              icon: Users,
              color: "text-blue-600",
              bg: "bg-blue-50/50",
              gradient: "from-blue-50 to-blue-100/50",
            },
            {
              label: t("coach.stats.activeStudents"),
              value: students.length,
              sub: t("coach.stats.students"),
              icon: Users,
              color: "text-green-600",
              bg: "bg-green-50/50",
              gradient: "from-green-50 to-green-100/50",
            },
            {
              label: t("coach.sessions.upcoming"),
              value: upcomingSessions.length,
              sub:
                upcomingSessions.length > 0
                  ? t("coach.sessions.nextSession")
                  : t("coach.sessions.noSessions"),
              icon: CalendarIcon,
              color: "text-purple-600",
              bg: "bg-purple-50/50",
              gradient: "from-purple-50 to-purple-100/50",
            },
            {
              label: t("coach.sessions.completed"),
              value: pastSessions.length,
              sub: t("coach.sessions.lifetime"),
              icon: Star,
              color: "text-yellow-600",
              bg: "bg-yellow-50/50",
              gradient: "from-yellow-50 to-yellow-100/50",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className="border-0 shadow-lg shadow-gray-100 bg-white/60 backdrop-blur-xl relative overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />
                <CardContent className="p-6 sm:p-8 relative z-10 glass-card">
                  <div className="flex justify-between items-start mb-6">
                    <div
                      className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color} shadow-sm ring-1 ring-black/5`}
                    >
                      <stat.icon className="h-6 w-6" />
                    </div>
                    {i === 2 && upcomingSessions.length > 0 && (
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      {stat.label}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                        {stat.value}
                      </h3>
                      <span className="text-xs sm:text-sm text-gray-500 font-medium truncate max-w-[100px]">
                        {stat.sub}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Sessions Tabs */}
        <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] shadow-xl shadow-gray-100/50 border border-white/50 p-6 sm:p-10">
          <Tabs
            defaultValue="upcoming"
            className="w-full"
            onValueChange={setActiveTab}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 sm:mb-10 gap-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {t("coach.sessions.title")}
                </h2>
                <p className="text-gray-500 mt-1 font-medium">
                  {t("coach.sessions.description")}
                </p>
              </div>
              <TabsList className="bg-gray-100/80 p-1.5 rounded-2xl self-start sm:self-auto w-full sm:w-auto grid grid-cols-2 sm:flex h-auto">
                <TabsTrigger
                  value="upcoming"
                  className="rounded-xl px-6 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600 data-[state=active]:scale-[1.02] transition-all text-gray-500"
                >
                  Upcoming
                </TabsTrigger>
                <TabsTrigger
                  value="past"
                  className="rounded-xl px-6 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600 data-[state=active]:scale-[1.02] transition-all text-gray-500"
                >
                  Past
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="upcoming"
              className="space-y-4 mt-0 focus-visible:outline-none focus:outline-none"
            >
              {upcomingSessions.length > 0 ? (
                upcomingSessions.map((session, index) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group"
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 p-6 sm:p-8 rounded-3xl border border-gray-100 bg-white hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 relative overflow-hidden">
                      {/* Left Border Accent */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="flex items-center gap-5 sm:gap-6 flex-1 w-full">
                        <div className="relative shrink-0">
                          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-4 border-gray-50 shadow-inner">
                            <AvatarImage src={session.studentImage} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 font-bold text-xl">
                              {session.studentName?.charAt(0) || "S"}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className="absolute -bottom-1 -right-1 bg-green-500 h-5 w-5 sm:h-6 sm:w-6 rounded-full border-[3px] border-white ring-1 ring-black/5"
                            title={t("coach.sessions.confirmed")}
                          ></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-lg sm:text-xl mb-1.5 truncate">
                            {session.studentName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge
                              variant="secondary"
                              className="font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border-none px-3 py-1 rounded-lg transition-colors"
                            >
                              {session.topic?.replace(/-/g, " ").toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row lg:flex-row gap-4 sm:gap-6 w-full lg:w-auto justify-end items-stretch sm:items-center border-t lg:border-t-0 pt-6 lg:pt-0 border-gray-50">
                        <div className="flex flex-row sm:flex-col gap-2 sm:gap-1 text-right min-w-[120px] justify-between sm:justify-center bg-gray-50/50 lg:bg-transparent p-4 lg:p-0 rounded-2xl lg:rounded-none">
                          <span className="text-sm font-medium text-gray-500">
                            {t("coach.sessions.date")}
                          </span>
                          <span className="font-bold text-gray-900 flex items-center gap-2 sm:justify-end">
                            <CalendarIcon className="w-4 h-4 text-blue-500 sm:hidden" />
                            {session.date}
                          </span>
                        </div>
                        <div className="hidden sm:block w-px h-10 bg-gray-100"></div>
                        <div className="flex flex-row sm:flex-col gap-2 sm:gap-1 text-right min-w-[100px] justify-between sm:justify-center bg-gray-50/50 lg:bg-transparent p-4 lg:p-0 rounded-2xl lg:rounded-none">
                          <span className="text-sm font-medium text-gray-500">
                            {t("coach.sessions.time")}
                          </span>
                          <span className="font-bold text-gray-900 flex items-center gap-2 sm:justify-end">
                            <Clock className="w-4 h-4 text-purple-500 sm:hidden" />
                            {session.duration || session.time}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto pt-2 lg:pt-0 sm:pl-6 lg:border-l border-gray-100">
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none border-gray-200 hover:bg-gray-50 hover:text-gray-900 h-12 sm:h-11 px-6 rounded-xl font-semibold bg-white"
                          onClick={() => handleRescheduleClick(session)}
                        >
                          {t("coach.actions.reschedule")}
                        </Button>
                        <Button
                          className="flex-1 sm:flex-none bg-black text-white hover:bg-gray-800 shadow-xl shadow-gray-900/10 h-12 sm:h-11 px-6 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95"
                          asChild
                        >
                          <a
                            href={session.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Video className="h-4 w-4 mr-2" />{" "}
                            {t("coach.actions.joinCall")}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-20 sm:py-32 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200/60 flex flex-col items-center justify-center">
                  <div className="h-24 w-24 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-gray-100 p-6 transform rotate-3">
                    <CalendarIcon
                      className="h-full w-full text-blue-500/80"
                      strokeWidth={1.5}
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    {t("coach.sessions.noUpcomingTitle")}
                  </h3>
                  <p className="text-gray-500 max-w-sm mx-auto text-lg leading-relaxed">
                    {t("coach.sessions.noScheduled")}
                    <br />
                    <span className="text-blue-600 font-medium">
                      {t("coach.sessions.takeABreak")}
                    </span>
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="past"
              className="space-y-4 mt-0 focus-visible:outline-none focus:outline-none"
            >
              {pastSessions.length > 0 ? (
                pastSessions.map((session, index) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex flex-col md:flex-row items-center gap-6 p-6 rounded-3xl border border-gray-100 bg-gray-50/30 hover:bg-white hover:shadow-lg transition-all"
                  >
                    <div className="flex items-center gap-5 flex-1 w-full">
                      <Avatar className="h-16 w-16 border-2 border-white grayscale opacity-75">
                        <AvatarImage src={session.studentImage} />
                        <AvatarFallback>
                          {session.studentName?.charAt(0) || "S"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-bold text-gray-700 text-lg mb-1">
                          {session.studentName}
                        </h3>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="font-medium text-gray-500 border-gray-200 px-3 py-1 rounded-lg"
                          >
                            {session.topic?.replace(/-/g, " ").toUpperCase()}
                          </Badge>
                          <span className="text-gray-500 font-medium bg-gray-100 px-2.5 py-0.5 rounded-full text-xs">
                            {session.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row md:flex-col lg:flex-row gap-4 md:gap-6 text-sm text-gray-500 w-full md:w-auto justify-between md:justify-end uppercase font-medium tracking-wide">
                      <div className="flex items-center gap-2">
                        {session.date}
                      </div>
                      <div className="flex items-center gap-2">
                        {session.duration}
                      </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto pt-2 md:pt-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-gray-900 h-10 px-4 rounded-xl hover:bg-gray-100"
                      >
                        <FileText className="h-4 w-4 mr-2" />{" "}
                        {t("coach.actions.viewNotes")}
                      </Button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-20 rounded-3xl bg-gray-50/30 border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    {t("coach.sessions.noPastTitle")}
                  </h3>
                  <p className="text-gray-400">
                    {t("coach.sessions.historyPlaceholder")}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Reschedule Dialog */}
        <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
          <DialogContent className="sm:max-w-[900px] w-full p-0 overflow-hidden gap-0 bg-white border-0 shadow-2xl rounded-3xl">
            <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh] overflow-y-auto md:overflow-hidden">
              {/* Column 1: Calendar */}
              <div className="flex-1 p-6 sm:p-8 border-r border-gray-100 flex flex-col bg-white">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {t("coach.sessions.rescheduleTitle")}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    {t("coach.sessions.rescheduleDescription", {
                      name: selectedSession?.studentName,
                    })}
                  </p>
                </div>

                {/* Custom Calendar Header */}
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
                        "aria-selected:opacity-100",
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
              <div className="flex-1 p-6 sm:p-8 bg-gray-50/50 flex flex-col">
                <h3 className="font-semibold text-gray-900 mb-4">
                  {t("coach.sessions.availableTimes")}
                </h3>

                {isLoadingSlots ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 flex-1 content-start">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot}
                        variant={selectedTime === slot ? "default" : "outline"}
                        className={cn(
                          "h-11 rounded-xl font-medium transition-all",
                          selectedTime === slot &&
                            "bg-blue-600 text-white border-blue-600",
                        )}
                        onClick={() => setSelectedTime(slot)}
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    {t("coach.sessions.noAvailableSlots")}
                  </div>
                )}

                <Button
                  className="w-full mt-6 h-12 rounded-xl bg-black text-white hover:bg-gray-800 font-semibold"
                  onClick={confirmReschedule}
                  disabled={!selectedTime}
                >
                  {t("coach.actions.confirmReschedule")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default CoachDashboard;
