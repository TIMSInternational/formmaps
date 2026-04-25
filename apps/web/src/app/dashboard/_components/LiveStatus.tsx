"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PremiumCard } from "./PremiumCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VideoCamera, CalendarBlank, Clock, UserCircle } from "@phosphor-icons/react";
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
          // Show notification badge 2s after load if session is close
          const timer = setTimeout(() => setShowNotification(true), 2000);
          const hideTimer = setTimeout(() => setShowNotification(false), 9000);
          return () => { clearTimeout(timer); clearTimeout(hideTimer); };
        }
      } catch {
        // Silently fail — show empty state
      } finally {
        setIsLoading(false);
      }
    };
    fetchSession();
  }, []);

  const formatTime = (isoString?: string) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday ? t("common.today") : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="h-full relative flex flex-col w-full">
      <PremiumCard innerClassName="p-0 flex flex-col h-full bg-transparent border-none relative overflow-visible text-slate-900 shadow-none">
        {/* Animated fluid blob for internal card depth */}
        <div className="absolute inset-0 overflow-hidden rounded-[calc(2.25rem-0.375rem)] pointer-events-none opacity-40">
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-[50%] -right-[50%] w-[150%] h-[150%] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15)_0,transparent_50%)]"
          />
        </div>

        {/* Header */}
        <div className="p-8 pb-4 relative z-10 flex items-center justify-between border-b border-white/40">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-3 h-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping duration-1000" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t("dashboard.liveStatus")}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 bg-white/50 px-2 py-1 rounded-md border border-white/60">
            {t("dashboard.nextAction")}
          </span>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 pt-6 flex flex-col flex-grow relative z-10 justify-center gap-8">
          {isLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-8 bg-black/5 rounded-xl w-3/4" />
              <div className="h-4 bg-black/5 rounded-lg w-1/2" />
              <div className="h-16 bg-black/5 rounded-2xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-20 bg-black/5 rounded-2xl" />
                <div className="h-20 bg-black/5 rounded-2xl" />
              </div>
            </div>
          ) : nextSession ? (
            <>
              <div>
                <h3 className="font-serif text-[28px] text-slate-900 font-bold leading-[1.1] mb-2 tracking-tight">
                  {t("dashboard.upcomingSession")}
                </h3>
                <p className="text-sm font-medium text-slate-500 truncate">{nextSession.topic}</p>
              </div>

              <div className="flex items-center gap-4 bg-white/40 rounded-2xl p-4 border border-white/60 backdrop-blur-md shadow-sm">
                <Avatar className="h-12 w-12 border border-white shadow-sm shrink-0">
                  <AvatarFallback className="bg-blue-50 text-blue-700 font-serif font-bold">
                    {/* Use first letter of topic or booked coach initials if available */}
                    {nextSession.topic?.charAt(0)?.toUpperCase() || "S"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold tracking-tight text-sm text-slate-800">
                    {nextSession.studentName || t("dashboard.upcomingSession")}
                  </p>
                  <p className="text-[10px] text-blue-600 uppercase tracking-widest mt-0.5 font-bold">
                    {nextSession.status === "confirmed" ? "Confirmed" : nextSession.status}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 bg-white/40 rounded-2xl p-4 border border-white/60 shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    <CalendarBlank weight="bold" className="w-4 h-4 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {formatDate(nextSession.slot?.start || nextSession.startTime)}
                    </span>
                  </div>
                  <span className="text-sm font-bold tracking-tight text-slate-900">
                    {formatTime(nextSession.slot?.start || nextSession.startTime)}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 bg-white/40 rounded-2xl p-4 border border-white/60 shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
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
                  className="group mt-2 w-full flex items-center justify-between px-6 py-4 rounded-2xl font-medium transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] bg-slate-900 text-white shadow-lg shadow-black/5 hover:bg-slate-800 border border-transparent"
                >
                  <span className="tracking-tight text-sm font-bold uppercase text-[11px] ml-1">{t("dashboard.joinMeeting")}</span>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors duration-500 translate-x-1 group-hover:translate-x-0 relative shadow-sm">
                    <VideoCamera weight="fill" className="w-4 h-4 text-white transition-colors duration-500" />
                  </div>
                </a>
              ) : (
                <Link
                  href="/dashboard/my-sessions"
                  className="group mt-2 w-full flex items-center justify-between px-6 py-4 rounded-2xl font-medium transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] bg-white/60 text-slate-900 hover:bg-white border border-white/80 shadow-sm"
                >
                  <span className="tracking-tight text-sm font-bold uppercase text-[11px] ml-1">{t("dashboard.mySessions")}</span>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white group-hover:bg-blue-50 transition-colors duration-500 shadow-sm border border-black/5">
                    <CalendarBlank weight="fill" className="w-4 h-4 text-slate-700" />
                  </div>
                </Link>
              )}
            </>
          ) : (
            /* Empty State */
            <>
              <div className="flex flex-col items-center justify-center text-center gap-6 py-4">
                <div className="w-16 h-16 rounded-full bg-white/50 border border-white/80 shadow-sm flex items-center justify-center">
                  <UserCircle weight="duotone" className="w-8 h-8 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-serif text-xl text-slate-900 font-bold leading-tight mb-2">
                    {t("dashboard.noUpcomingSessions")}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-[22ch] mx-auto">
                    {t("dashboard.noSessionsDesc")}
                  </p>
                </div>
                <Link
                  href="/dashboard/book-coach"
                  className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl font-medium transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] bg-slate-900 text-white shadow-lg hover:bg-slate-800"
                >
                  <span className="tracking-tight text-sm font-bold uppercase text-[11px] ml-1">{t("dashboard.bookACoach")}</span>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors duration-500 shadow-sm">
                    <VideoCamera weight="fill" className="w-4 h-4 text-white transition-colors duration-500" />
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
      </PremiumCard>

      {/* Pop-up Notification Badge */}
      <AnimatePresence>
        {showNotification && nextSession && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute -top-4 -right-2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-2xl shadow-indigo-600/40 flex items-center gap-2.5 border-[3px] border-white backdrop-blur-md"
          >
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-bold tracking-widest uppercase">{t("dashboard.meetingStarting")}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
