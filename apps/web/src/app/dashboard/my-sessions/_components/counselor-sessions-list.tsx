"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  Video,
  X,
  User,
  MoreHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { getCounselorStatusBadge } from "./session-status-badge";
import type { CounselorSession } from "@/services/counselorSessionService";

interface CounselorSessionsListProps {
  sessions: CounselorSession[];
  isLoading: boolean;
  subTab: string;
  onSubTabChange: (tab: string) => void;
  upcomingCount: number;
  pastCount: number;
  onCancelClick: (session: CounselorSession) => void;
}

export function CounselorSessionsList({
  sessions,
  isLoading,
  subTab,
  onSubTabChange,
  upcomingCount,
  pastCount,
  onCancelClick,
}: CounselorSessionsListProps) {
  return (
    <div className="dash-card overflow-hidden">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-foreground">Counselor Sessions</h2>
          <div className="flex items-center gap-3">
            <Button asChild size="sm" className="bg-foreground text-background hover:bg-foreground/90 rounded-xl">
              <Link href="/dashboard/book-counselor">
                <User className="h-4 w-4 mr-1.5" />
                Book New
              </Link>
            </Button>
            <Tabs value={subTab} onValueChange={onSubTabChange}>
              <TabsList className="bg-secondary p-1 rounded-xl">
                <TabsTrigger value="upcoming" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card">
                  Upcoming ({upcomingCount})
                </TabsTrigger>
                <TabsTrigger value="past" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card">
                  Past ({pastCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>
      <div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-foreground" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="divide-y divide-border">
            {sessions.map((session, index) => {
              let date = "TBD",
                time = "TBD";
              try {
                const s = new Date(session.startTime),
                  e = new Date(session.endTime);
                date = format(s, "EEE, MMM d, yyyy");
                time = `${format(s, "h:mm a")} - ${format(e, "h:mm a")}`;
              } catch {
                /* keep TBD */
              }
              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-5 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-14 h-14 rounded-full bg-secondary text-foreground flex items-center justify-center font-bold text-xl flex-shrink-0 border border-border">
                        {session.counselorName?.charAt(0) || "C"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground text-lg truncate">
                          {session.counselorName || "Counselor"}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">{session.counselorEmail}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-indigo-200 bg-indigo-50 text-indigo-700">
                            {session.topic}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700">
                            FREE
                          </span>
                          {getCounselorStatusBadge(session.status)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{date}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{time}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.status === "confirmed" && (
                        <>
                          {session.meetingLink && (
                            <Button
                              size="sm"
                              className="bg-foreground text-background hover:bg-foreground/90 h-9 px-4 rounded-lg"
                              asChild
                            >
                              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                <Video className="h-4 w-4 mr-1.5" />
                                Join
                              </a>
                            </Button>
                          )}
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
                                Cancel Session
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </div>
                  {(session.notes || session.counselorNotes) && (
                    <div className="mt-4 ml-[4.5rem] space-y-1.5">
                      {session.notes && (
                        <div className="pl-4 border-l-2 border-border">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Your notes: </span>
                            {session.notes}
                          </p>
                        </div>
                      )}
                      {session.counselorNotes && (
                        <div className="pl-4 border-l-2 border-indigo-200">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-indigo-600">Counselor notes: </span>
                            {session.counselorNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="h-20 w-20 bg-secondary rounded-xl flex items-center justify-center mb-5 border border-border">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No {subTab} counselor sessions
            </h3>
            <p className="text-muted-foreground text-center max-w-sm mb-5 text-sm">
              Book a FREE session with your assigned school counselor for guidance and support.
            </p>
            {subTab === "upcoming" && (
              <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-11 px-6 rounded-xl">
                <Link href="/dashboard/book-counselor">
                  <User className="h-4 w-4 mr-2" />
                  Book a Counselor Session
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
