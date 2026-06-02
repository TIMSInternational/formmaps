"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Users, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CounselorSession } from "@/services/counselorSessionService";

interface UpcomingSessionsProps {
  sessions: CounselorSession[];
  isLoading: boolean;
}

export function UpcomingSessions({ sessions, isLoading }: UpcomingSessionsProps) {
  const { t } = useTranslation();

  if (!sessions.length && !isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <Card className="dash-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            {t("counselor.dashboard.upcomingSessions", "Upcoming Counseling Sessions")}
          </CardTitle>
          <Link href="/counselor/sessions">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:bg-blue-50">
              {t("counselor.dashboard.manageSessions", "Manage Sessions")} →
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col p-3 dash-card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Users className="w-12 h-12" />
                  </div>
                  <div className="flex items-start gap-3 relative z-10">
                    <Avatar className="h-10 w-10 border shadow-sm">
                      <AvatarFallback className="bg-blue-50 text-blue-700 font-semibold text-xs">
                        {session.studentName?.charAt(0) || "S"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{session.studentName}</p>
                      <p className="text-xs text-gray-500 truncate">{session.topic}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between relative z-10 text-xs text-gray-600 font-medium">
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <span className="text-blue-600">{new Date(session.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
