"use client";

import React, { useState, useEffect, useMemo } from "react";
import { isUpcoming, isPast } from "@/lib/normalizeSessions";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Clock,
  Video,
  LayoutList,
  CalendarDays,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { CalendarView } from "./_components/CalendarView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import type { NormalizedSession } from "@/lib/normalizeSessions";

/** Schedule-page session: ScheduleSession + extra display fields the normalize fn copies through */
interface ScheduleSession extends NormalizedSession {
  studentName?: string;
  studentImage?: string;
  topic?: string;
  meetingLink?: string;
}

export default function CoachSchedulePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const SESSION_CACHE_KEY = "coach_sessions_all";
  const CACHE_TTL = 1000 * 60 * 2;

  async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 300): Promise<T> {
    try { return await fn(); }
    catch (err) {
      if (retries <= 0) throw err;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
  }

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const cached = ((globalThis as unknown as { __sessionCache?: Map<string, { ts: number; data: ScheduleSession[] }> }).__sessionCache ??= new Map());
      const entry = cached.get(SESSION_CACHE_KEY);
      if (entry && Date.now() - entry.ts < CACHE_TTL) { setSessions(entry.data); return; }

      const { getCoachSessions } = await import("@/services/coachService");
      const rawResponse = await fetchWithRetry(() => getCoachSessions("all"));
      const normalize = (await import("@/lib/normalizeSessions")).default;
      const normalized = normalize(rawResponse);
      setSessions(normalized);
      cached.set(SESSION_CACHE_KEY, { ts: Date.now(), data: normalized });
    } catch (error) {
      toast.error(t("coaching.dashboard.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const now = Date.now();
  const upcomingSessions = useMemo(() => sessions.filter((s) => isUpcoming(s, now)), [sessions]);
  const pastSessions = useMemo(() => sessions.filter((s) => isPast(s, now)), [sessions]);
  const displayed = activeTab === "upcoming" ? upcomingSessions : pastSessions;

  const handleRescheduleClick = (session: ScheduleSession) => {
    setSelectedSession(session);
    setRescheduleDate("");
    setRescheduleTime("");
    setIsRescheduleOpen(true);
  };

  const handleCancelClick = (session: ScheduleSession) => {
    setSelectedSession(session);
    setCancelReason("");
    setIsCancelOpen(true);
  };

  const confirmReschedule = async () => {
    if (!selectedSession || !rescheduleDate || !rescheduleTime) {
      toast.error(t("coaching.dashboard.selectDateTime"));
      return;
    }
    try {
      const { rescheduleSession } = await import("@/services/coachService");
      const start = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
      await rescheduleSession(selectedSession.id, { start, end });
      toast.success(t("coaching.dashboard.rescheduleSuccess"));
      setIsRescheduleOpen(false);
      fetchSessions();
    } catch (error) {
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  const confirmCancel = async () => {
    if (!selectedSession) return;
    try {
      const { cancelSession } = await import("@/services/coachService");
      await cancelSession(selectedSession.id, cancelReason || "Cancelled by coach");
      toast.success(t("coaching.dashboard.sessionCancelled"));
      setIsCancelOpen(false);
      fetchSessions();
    } catch (error) {
      toast.error(t("coaching.dashboard.cancelFailed"));
    }
  };

  const formatSessionDate = (session: ScheduleSession) => {
    try {
      if (!session.startTime) return "TBD";
      const d = new Date(session.startTime);
      return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    } catch { return "TBD"; }
  };

  const formatSessionTime = (session: ScheduleSession) => {
    try {
      if (!session.startTime) return "TBD";
      const d = new Date(session.startTime);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return "TBD"; }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("coach:schedule.sectionLabel")}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-1">{t("coach:schedule.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("coach:schedule.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-2"
          >
            <LayoutList className="h-4 w-4" />
            {t("coach:schedule.listView")}
          </Button>
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            {t("coach:schedule.calendarView")}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("coach:schedule.stats.total"), value: sessions.length, icon: CalendarDays, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
          { label: t("coach:schedule.stats.upcoming"), value: upcomingSessions.length, icon: Clock, iconColor: "text-purple-500", iconBg: "bg-purple-500/10" },
          { label: t("coach:schedule.stats.completed"), value: pastSessions.filter(s => s.status === "completed").length, icon: CheckCircle2, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
          { label: t("coach:schedule.stats.cancelled"), value: sessions.filter(s => s.status === "cancelled").length, icon: XCircle, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
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

      {viewMode === "calendar" ? (
        <CalendarView
          sessions={sessions}
          onSessionClick={(session) => handleRescheduleClick(session as ScheduleSession)}
        />
      ) : (
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <span className="text-sm font-semibold text-foreground">{t("coach:schedule.sessions")}</span>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="p-1 rounded-xl">
                <TabsTrigger value="upcoming" className="rounded-lg px-3 py-1.5 text-sm font-medium">
                  {t("coach:schedule.stats.upcoming")} ({upcomingSessions.length})
                </TabsTrigger>
                <TabsTrigger value="past" className="rounded-lg px-3 py-1.5 text-sm font-medium">
                  {t("coach:sessionsPage.filters.tab.past")} ({pastSessions.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div>
            {isLoading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : displayed.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                <AnimatePresence>
                  {displayed.map((session, idx) => (
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
                            <h3 className="font-semibold text-foreground truncate">
                              {session.studentName || "Student"}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-xs">
                                {session.topic?.replace(/-/g, " ") || "Session"}
                              </Badge>
                              <Badge
                                className={
                                  session.status === "confirmed" || session.status === "rescheduled"
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                                    : session.status === "completed"
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                      : "bg-red-100 text-red-700 hover:bg-red-100"
                                }
                              >
                                {session.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{formatSessionDate(session)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{formatSessionTime(session)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(session.status === "confirmed" || session.status === "rescheduled") && (
                            <>
                              {session.meetingLink && (
                                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 text-xs rounded-lg" asChild>
                                  <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                    <Video className="h-3.5 w-3.5 mr-1" /> Join
                                  </a>
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" onClick={() => handleRescheduleClick(session)}>
                                {t("coach:schedule.reschedule")}
                              </Button>
                              <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleCancelClick(session)}>
                                {t("coach:schedule.cancel")}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <Calendar className="h-10 w-10 text-muted-foreground mb-4 opacity-40" />
                <h3 className="text-base font-semibold text-foreground mb-1">
                  {t("coach:schedule.noSessions", { tab: activeTab })}
                </h3>
                <p className="text-muted-foreground text-center max-w-sm text-sm">
                  {activeTab === "upcoming"
                    ? t("coach:schedule.noUpcoming")
                    : t("coach:schedule.noCompleted")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("coach:schedule.reschedule.title")}</DialogTitle>
            <DialogDescription>{t("coach:schedule.reschedule.description", { name: selectedSession?.studentName })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("coach:schedule.reschedule.newDate")}</Label>
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("coach:schedule.reschedule.newTime")}</Label>
              <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsRescheduleOpen(false)}>{t("coach:schedule.reschedule.cancel")}</Button>
            <Button onClick={confirmReschedule}>{t("coach:schedule.reschedule.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("coach:schedule.cancelDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("coach:schedule.cancelDialog.description", { name: selectedSession?.studentName })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t("coach:schedule.cancelDialog.reason")}</Label>
            <Input
              placeholder={t("coach:schedule.cancelDialog.reasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCancelOpen(false)}>{t("coach:schedule.cancelDialog.keep")}</Button>
            <Button variant="destructive" onClick={confirmCancel}>{t("coach:schedule.cancelDialog.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
