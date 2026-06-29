"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  Video,
  X,
  Users,
  ArrowRight,
  Star,
  MoreHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import type { TFunction } from "i18next";
import { getStatusBadge } from "./session-status-badge";

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
  status: "pending" | "confirmed" | "rescheduled" | "cancelled" | "completed";
  meetingLink?: string;
  slot?: { start: string; end: string };
}

interface CoachingSessionsListProps {
  sessions: Session[];
  isLoading: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  upcomingCount: number;
  pastCount: number;
  onCancelClick: (session: Session) => void;
  onRescheduleClick: (session: Session) => void;
  onReviewClick: (session: Session) => void;
  t: TFunction;
}

export type { Session };

export function CoachingSessionsList({
  sessions,
  isLoading,
  activeTab,
  onActiveTabChange,
  upcomingCount,
  pastCount,
  onCancelClick,
  onRescheduleClick,
  onReviewClick,
  t,
}: CoachingSessionsListProps) {
  return (
    <div className="dash-card overflow-hidden">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-foreground">
            {t("sessions.yourSessions", "Your Sessions")}
          </h2>
          <Tabs
            value={activeTab}
            onValueChange={onActiveTabChange}
            className="w-full sm:w-auto"
          >
            <TabsList className="bg-secondary p-1 rounded-xl">
              <TabsTrigger
                value="upcoming"
                className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card transition-all"
              >
                {t("sessions.tabs.upcoming", "Upcoming")} ({upcomingCount})
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card transition-all"
              >
                {t("sessions.tabs.past", "Past")} ({pastCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-foreground"></div>
            <p className="text-muted-foreground mt-4">{t("coach:mySessions.loading")}</p>
          </div>
        ) : sessions.length > 0 ? (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {sessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-5 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-14 w-14 border-2 border-border">
                          <AvatarImage src={session.coachImage} />
                          <AvatarFallback className="bg-secondary text-foreground font-bold">
                            {session.coachName?.charAt(0) || "C"}
                          </AvatarFallback>
                        </Avatar>
                        {["confirmed", "rescheduled"].includes(session.status) && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-emerald-500 rounded-full border-2 border-card"></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground text-lg truncate">
                          {session.coachName}
                        </h3>
                        {session.coachTitle && (
                          <p className="text-sm text-muted-foreground truncate">
                            {session.coachTitle}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-700">
                            {session.topic}
                          </span>
                          {getStatusBadge(session.status, t)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{session.date}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{session.time}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* pending included: students must be able to cancel/reschedule a not-yet-confirmed booking */}
                      {["pending", "confirmed", "rescheduled"].includes(session.status) ? (
                        <>
                          {session.meetingLink && (
                            <Button
                              size="sm"
                              className="bg-foreground text-background hover:bg-foreground/90 h-9 px-4 rounded-lg"
                              asChild
                            >
                              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                <Video className="h-4 w-4 mr-1.5" />
                                {t("coach:mySessions.joinCall")}
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onRescheduleClick(session)}
                            className="h-9 px-4 rounded-lg border-border hover:bg-secondary"
                          >
                            {t("coach:mySessions.reschedule")}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-secondary">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl border-border p-1">
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700 focus:bg-red-50 rounded-lg cursor-pointer"
                                onClick={() => onCancelClick(session)}
                              >
                                <X className="h-4 w-4 mr-2" />
                                {t("coach:mySessions.cancelSession")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : session.status === "completed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-4 rounded-lg border-border hover:bg-secondary"
                          onClick={() => onReviewClick(session)}
                        >
                          <Star className="h-4 w-4 mr-1.5 text-yellow-500" />
                          {t("coach:mySessions.review")}
                        </Button>
                      ) : null}

                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-lg hover:bg-secondary" asChild>
                        <Link href={`/dashboard/book-coach/${session.coachId}`}>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {session.notes && (
                    <div className="mt-4 ml-[4.5rem] pl-4 border-l-2 border-border">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{t("coach:mySessions.notes")} </span>
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
            <div className="h-20 w-20 bg-secondary rounded-xl flex items-center justify-center mb-5 border border-border">
              <Calendar className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("coach:mySessions.noSessions", { tab: activeTab })}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm mb-5">
              {activeTab === "upcoming"
                ? t("coach:mySessions.noUpcoming")
                : t("coach:mySessions.noCompleted")}
            </p>
            {activeTab === "upcoming" && (
              <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-11 px-6 rounded-xl">
                <Link href="/dashboard/book-coach">
                  <Users className="h-4 w-4 mr-2" />
                  {t("coach:mySessions.findCoach")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
