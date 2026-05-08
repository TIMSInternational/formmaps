"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Video,
  FileText,
  Star,
  Users,
  CalendarDays,
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
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";

import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INITIAL_AVAILABILITY = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weeklySchedule: [
    { day: "Monday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
    { day: "Tuesday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
    { day: "Wednesday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
    { day: "Thursday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
    { day: "Friday", enabled: true, timeSlots: [{ start: "09:00", end: "17:00" }] },
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
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(new Date());
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

        const rawSessions = Array.isArray((sessionsData as any)?.data?.data)
          ? (sessionsData as any).data.data
          : Array.isArray((sessionsData as any)?.data)
            ? (sessionsData as any).data
            : Array.isArray(sessionsData)
              ? sessionsData
              : [];

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
                const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
                duration = `${Math.round(diff)} min`;
                time = `${time} - ${format(endDate, "h:mm a")}`;
              }
            } catch (e) { /* silently handle */ }
          }
          return { ...session, date, time, duration };
        });

        const nowTs = Date.now();
        const upcoming = sessions.filter((s: any) => {
          if (s.status === "cancelled") return false;
          const startTs = Date.parse(s.startTime || s.slot?.start || "");
          const isFuture = !Number.isNaN(startTs) && startTs >= nowTs;
          return isFuture && (s.status === "confirmed" || s.status === "rescheduled");
        });
        const past = sessions.filter((s: any) => {
          const startTs = Date.parse(s.startTime || s.slot?.start || "");
          const isPast = !Number.isNaN(startTs) && startTs < nowTs;
          return s.status === "completed" || s.status === "cancelled" || isPast;
        });

        setUpcomingSessions(upcoming);
        setPastSessions(past);

        const studentsResponse = studentsData as any;
        const studentsList = Array.isArray(studentsResponse?.data?.data)
          ? studentsResponse.data.data
          : Array.isArray(studentsResponse?.data)
            ? studentsResponse.data
            : [];
        setStudents(studentsList);

        setAvailability(
          (availabilityData as any)?.data || availabilityData || INITIAL_AVAILABILITY,
        );
      } catch (error: any) {
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

  React.useEffect(() => {
    const fetchSlots = async () => {
      if (!isRescheduleOpen || !selectedSession || !rescheduleDate || !user?.id) return;
      setIsLoadingSlots(true);
      setAvailableSlots([]);
      setSelectedTime(null);
      try {
        const { getCoachAvailableSlots } = await import("@/services/coachService");
        const dateStr = format(rescheduleDate, "yyyy-MM-dd");
        const response = await getCoachAvailableSlots(user.id, dateStr);
        setAvailableSlots(response.slots || []);
      } catch (error) {
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

  const firstName = user.name?.split(" ")[0] || t("coach.defaultName");

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3" role="alert">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="block sm:inline font-medium">{error}</span>
        </div>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">
            {t("coach.portal", "Coach Portal")}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {new Date().getHours() < 12
              ? t("coach.greeting.morning")
              : new Date().getHours() < 18
                ? t("coach.greeting.afternoon")
                : t("coach.greeting.evening")}
            , {firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[44ch]">
            {t("coach.upcomingSessions", { count: upcomingSessions.length })}
          </p>
        </div>

        <Dialog open={isAvailabilityOpen} onOpenChange={setIsAvailabilityOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="w-4 h-4" />
              {t("coach.manageAvailability")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl h-[85vh] sm:h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 py-5 border-b border-[var(--border)] shrink-0">
              <DialogTitle className="text-lg font-bold text-foreground">
                {t("coach.editAvailability")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <AvailabilityStep
                data={INITIAL_AVAILABILITY}
                onNext={handleSaveAvailability}
                onBack={() => setIsAvailabilityOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </motion.header>

      {/* Stat Cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          { label: t("coach.stats.totalSessions"), value: upcomingSessions.length + pastSessions.length, icon: CalendarDays, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
          { label: t("coach.stats.activeStudents"), value: students.length, icon: Users, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
          { label: t("coach.sessions.upcoming"), value: upcomingSessions.length, icon: Clock, iconColor: "text-purple-500", iconBg: "bg-purple-500/10" },
          { label: t("coach.sessions.completed"), value: pastSessions.length, icon: Star, iconColor: "text-amber-500", iconBg: "bg-amber-500/10" },
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
      </motion.div>

      {/* Sessions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-sm font-semibold text-foreground">{t("coach.sessions.title")}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t("coach.sessions.description")}</p>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="p-1 rounded-xl">
                <TabsTrigger value="upcoming" className="rounded-lg px-3 py-1.5 text-sm font-medium">
                  Upcoming ({upcomingSessions.length})
                </TabsTrigger>
                <TabsTrigger value="past" className="rounded-lg px-3 py-1.5 text-sm font-medium">
                  Past ({pastSessions.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div>
            {activeTab === "upcoming" ? (
              upcomingSessions.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {upcomingSessions.map((session, idx) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="p-5 hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 border border-[var(--border)]">
                            <AvatarImage src={session.studentImage} />
                            <AvatarFallback className="bg-blue-500/10 text-blue-600 font-semibold text-sm">
                              {session.studentName?.charAt(0) || "S"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{session.studentName}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-xs">{session.topic?.replace(/-/g, " ")}</Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{session.date}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{session.duration || session.time}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs rounded-lg"
                            onClick={() => handleRescheduleClick(session)}
                          >
                            {t("coach.actions.reschedule")}
                          </Button>
                          {session.meetingLink && (
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 text-xs rounded-lg" asChild>
                              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                <Video className="h-3.5 w-3.5 mr-1" />{t("coach.actions.joinCall")}
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <CalendarIcon className="h-10 w-10 text-muted-foreground mb-4 opacity-40" />
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {t("coach.sessions.noUpcomingTitle")}
                  </h3>
                  <p className="text-muted-foreground text-center max-w-sm text-sm">
                    {t("coach.sessions.noScheduled")}
                  </p>
                </div>
              )
            ) : (
              pastSessions.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {pastSessions.map((session, idx) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="p-5 hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 border border-[var(--border)] grayscale opacity-60">
                            <AvatarImage src={session.studentImage} />
                            <AvatarFallback className="text-sm">{session.studentName?.charAt(0) || "S"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{session.studentName}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-xs">{session.topic?.replace(/-/g, " ")}</Badge>
                              <span className="text-[11px] text-muted-foreground">{session.status}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{session.date}</span>
                          <span>{session.duration}</span>
                        </div>

                        <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground">
                          <FileText className="h-3.5 w-3.5 mr-1" />{t("coach.actions.viewNotes")}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <Clock className="h-10 w-10 text-muted-foreground mb-4 opacity-40" />
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {t("coach.sessions.noPastTitle")}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t("coach.sessions.historyPlaceholder")}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </motion.div>

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-[900px] w-full p-0 overflow-hidden gap-0">
          <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh] overflow-y-auto md:overflow-hidden">
            <div className="flex-1 p-6 sm:p-8 border-r border-[var(--border)] flex flex-col">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground mb-1">
                  {t("coach.sessions.rescheduleTitle")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("coach.sessions.rescheduleDescription", { name: selectedSession?.studentName })}
                </p>
              </div>

              <div className="flex items-center justify-between mb-4 px-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { const m = new Date(currentMonth); m.setMonth(m.getMonth() - 1); setCurrentMonth(m); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold text-foreground capitalize">{format(currentMonth, "MMMM yyyy")}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { const m = new Date(currentMonth); m.setMonth(m.getMonth() + 1); setCurrentMonth(m); }}>
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
                    weekday: "text-muted-foreground font-medium text-xs uppercase w-9 text-center",
                    week: "flex justify-between w-full mb-2",
                    day: "h-9 w-9 text-center text-sm relative flex items-center justify-center p-0",
                    day_button: cn(
                      "h-9 w-9 p-0 font-normal rounded-full transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none",
                      "aria-selected:opacity-100",
                    ),
                    selected: "bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white shadow-md font-semibold",
                    today: "bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] text-foreground font-semibold",
                    outside: "text-muted-foreground opacity-50 pointer-events-none",
                    disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                    hidden: "invisible",
                  }}
                  disabled={(date) => { const t = new Date(); t.setHours(0, 0, 0, 0); return date < t; }}
                />
              </div>
            </div>

            <div className="flex-1 p-6 sm:p-8 flex flex-col">
              <h3 className="font-semibold text-foreground mb-4">{t("coach.sessions.availableTimes")}</h3>
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
                      className={cn("h-11 rounded-xl font-medium", selectedTime === slot && "bg-blue-600 text-white border-blue-600")}
                      onClick={() => setSelectedTime(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  {t("coach.sessions.noAvailableSlots")}
                </div>
              )}
              <Button
                className="w-full mt-6 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
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
  );
}

export default CoachDashboard;
