"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VideoCamera, CalendarBlank, UserCircle } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { getUserSessions } from "@/services/coachService";
import { Booking } from "@/types/coach";
import { useTranslation } from "react-i18next";
import Link from "next/link";

export function LiveStatus() {
  const { t } = useTranslation();
  const [showNotification, setShowNotification] = useState(false);
  const [nextSession, setNextSession] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await getUserSessions("upcoming");
        const sessions = res?.data || [];
        if (sessions.length > 0) {
          setNextSession(sessions[0]);
          const timer = setTimeout(() => setShowNotification(true), 2000);
          const hideTimer = setTimeout(() => setShowNotification(false), 9000);
          return () => { clearTimeout(timer); clearTimeout(hideTimer); };
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoading(false);
      }
    };
    fetchSession();
  }, []);

  const formatTime = (isoString?: string) => {
    if (!isoString) return "--";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "--";
    const d = new Date(isoString);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday ? t("common.today") : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="relative flex flex-col w-full">
      <div className="dash-card flex flex-col">
        {/* Header */}
        <div className="p-4 pb-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("dashboard.liveStatus")}
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary px-2.5 py-1 rounded-md border border-border">
            {t("dashboard.nextAction")}
          </span>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-grow justify-center gap-4">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-7 bg-secondary rounded-lg w-3/4" />
              <div className="h-4 bg-secondary rounded-lg w-1/2" />
              <div className="h-14 bg-secondary rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 bg-secondary rounded-xl" />
                <div className="h-16 bg-secondary rounded-xl" />
              </div>
            </div>
          ) : nextSession ? (
            <>
              <div>
                <h3 className="text-base text-foreground font-bold leading-tight mb-1 tracking-tight">
                  {t("dashboard.upcomingSession")}
                </h3>
                <p className="text-sm font-medium text-muted-foreground truncate">{nextSession.topic}</p>
              </div>

              <div className="flex items-center gap-4 rounded-xl p-4 border border-border bg-secondary">
                <Avatar className="h-11 w-11 border border-border shrink-0">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                    {nextSession.topic?.charAt(0)?.toUpperCase() || "S"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold tracking-tight text-sm text-foreground">
                    {nextSession.studentName || t("dashboard.upcomingSession")}
                  </p>
                  <p className="text-[10px] text-primary uppercase tracking-widest mt-0.5 font-bold">
                    {nextSession.status === "confirmed" ? "Confirmed" : nextSession.status}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 rounded-xl p-4 border border-border bg-secondary">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <CalendarBlank weight="bold" className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {formatDate(nextSession.slot?.start || nextSession.startTime)}
                    </span>
                  </div>
                  <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">
                    {formatTime(nextSession.slot?.start || nextSession.startTime)}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 rounded-xl p-4 border border-border bg-secondary">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 ml-0.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Status</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 tracking-tight capitalize">
                    {nextSession.status}
                  </span>
                </div>
              </div>

              {nextSession.meetingLink ? (
                <a
                  href={nextSession.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group w-full flex items-center justify-between px-5 py-3.5 rounded-xl font-semibold transition-colors active:scale-[0.98] bg-foreground text-background hover:bg-foreground/90"
                >
                  <span className="text-sm">{t("dashboard.joinMeeting")}</span>
                  <VideoCamera weight="fill" className="w-4 h-4" />
                </a>
              ) : (
                <Link
                  href="/dashboard/my-sessions"
                  className="group w-full flex items-center justify-between px-5 py-3.5 rounded-xl font-semibold transition-colors active:scale-[0.98] bg-secondary text-foreground hover:bg-border border border-border"
                >
                  <span className="text-sm">{t("dashboard.mySessions")}</span>
                  <CalendarBlank weight="fill" className="w-4 h-4 text-muted-foreground" />
                </Link>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center text-center gap-3 py-2">
              <div>
                <h3 className="text-sm text-foreground font-bold leading-tight mb-0.5">
                  {t("dashboard.noUpcomingSessions")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("dashboard.noSessionsDesc")}
                </p>
              </div>
              <Link
                href="/dashboard/book-coach"
                className="group w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-semibold transition-colors active:scale-[0.98] bg-foreground text-background hover:bg-foreground/90"
              >
                <span className="text-sm">{t("dashboard.bookACoach")}</span>
                <VideoCamera weight="fill" className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Notification Badge */}
      <AnimatePresence>
        {showNotification && nextSession && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute -top-3 -right-2 z-50 bg-foreground text-background px-4 py-2 rounded-xl flex items-center gap-2.5 border-2 border-background"
          >
            <div className="w-2 h-2 rounded-full bg-background animate-pulse" />
            <span className="text-[11px] font-bold tracking-widest uppercase">{t("dashboard.meetingStarting")}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
