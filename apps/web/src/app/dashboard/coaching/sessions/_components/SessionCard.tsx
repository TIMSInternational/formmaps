"use client";

import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MoreVertical,
  User,
  FileText,
  CalendarDays,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { FormattedSession } from "./session-types";

function getStatusBadge(status: string, t: (k: string) => string) {
  switch (status) {
    case "confirmed":
    case "rescheduled":
      return (
        <Badge className="bg-[#2E9098]/10 text-[#2E9098] hover:bg-[#2E9098]/10 border-[#2E9098]/20">
          {t("coach:sessionsPage.statusBadge.upcoming")}
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
          {t("coach:sessionsPage.statusBadge.completed")}
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
          {t("coach:sessionsPage.statusBadge.cancelled")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface SessionCardProps {
  session: FormattedSession;
  index: number;
  onViewNotes: (session: FormattedSession) => void;
  onViewProfile: (studentId: string) => void;
  onReschedule: (session: FormattedSession) => void;
  onCancelSession: (session: FormattedSession) => void;
}

export function SessionCard({
  session,
  index,
  onViewNotes,
  onViewProfile,
  onReschedule,
  onCancelSession,
}: SessionCardProps) {
  const { t } = useTranslation();
  const isActive = session.status === "confirmed" || session.status === "rescheduled";

  return (
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
            onClick={() => onViewProfile(session.studentId || "")}
          >
            <Avatar className="h-10 w-10 border border-[var(--border)]">
              <AvatarImage src={session.studentAvatar} />
              <AvatarFallback className="text-sm bg-[#2E9098]/10 text-[#2E9098] font-semibold">
                {session.studentName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{session.studentName}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs">{session.topic?.replace(/-/g, " ")}</Badge>
                {getStatusBadge(session.status, t)}
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
            {isActive && session.meetingLink && (
              <Button size="sm" className="bg-[#2E9098] hover:bg-[#2E9098] text-white h-8 px-3 text-xs rounded-lg" asChild>
                <a href={session.meetingLink} target="_blank" rel="noreferrer">
                  <Video className="w-3.5 h-3.5 mr-1" /> {t("coach:sessionsPage.card.join")}
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" onClick={() => onViewNotes(session)}>
              <FileText className="w-3.5 h-3.5 mr-1" /> {t("coach:sessionsPage.card.notes")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onViewProfile(session.studentId || "")} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4 text-muted-foreground" /> {t("coach:sessionsPage.card.profile")}
                </DropdownMenuItem>
                {isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onReschedule(session)} className="cursor-pointer">
                      <CalendarDays className="mr-2 h-4 w-4 text-orange-400" /> {t("coach:sessionsPage.card.reschedule")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onCancelSession(session)}
                      className="cursor-pointer text-red-600 focus:text-red-600"
                    >
                      <XCircle className="mr-2 h-4 w-4" /> {t("coach:sessionsPage.card.cancelSession")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
