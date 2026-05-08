"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Loader2,
  Video,
  MoreHorizontal,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getMyCounselorSessions,
  completeCounselorSession,
  cancelCounselorSession,
} from "@/services/counselorSessionService";
import type { CounselorSession } from "@/services/counselorSessionService";

export default function CounselorSessionsPage() {
  const [sessions, setSessions] = useState<CounselorSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [stats, setStats] = useState({ total: 0, upcoming: 0, completed: 0, cancelled: 0 });

  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [selected, setSelected] = useState<CounselorSession | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [counselorNotes, setCounselorNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await getMyCounselorSessions({ limit: 100 });
      setSessions(res.data);
      setStats({
        total: res.total,
        upcoming: res.upcoming,
        completed: res.completed,
        cancelled: res.cancelled,
      });
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  };

  const upcoming = sessions.filter(s => s.status === "confirmed");
  const past = sessions.filter(s => s.status === "completed" || s.status === "cancelled");
  const displayed = activeTab === "upcoming" ? upcoming : activeTab === "past" ? past : sessions;

  const handleComplete = async () => {
    if (!selected) return;
    setIsProcessing(true);
    try {
      await completeCounselorSession(selected.id, counselorNotes);
      toast.success("Session marked as completed");
      setCompleteOpen(false);
      fetchSessions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!selected) return;
    setIsProcessing(true);
    try {
      await cancelCounselorSession(selected.id, cancelReason);
      toast.success("Session cancelled");
      setCancelOpen(false);
      fetchSessions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Upcoming</Badge>;
    if (status === "completed") return <Badge className="bg-blue-100 text-blue-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    if (status === "cancelled") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const formatTime = (s: CounselorSession) => {
    try {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const date = format(start, "EEE, MMM d, yyyy");
      const time = `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
      return { date, time };
    } catch { return { date: "TBD", time: "TBD" }; }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Scheduling</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-1">My Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage counseling sessions with your students</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: CalendarDays, iconColor: "text-slate-500", iconBg: "bg-slate-500/10" },
          { label: "Upcoming", value: stats.upcoming, icon: Clock, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
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

      {/* Sessions List */}
      <div className="dash-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <span className="text-sm font-semibold text-foreground">Session List</span>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="p-1 rounded-xl">
              {[["upcoming", `Upcoming (${upcoming.length})`], ["past", `Past (${past.length})`], ["all", `All (${sessions.length})`]].map(([val, label]) => (
                <TabsTrigger key={val} value={val} className="rounded-lg px-3 py-1.5 text-sm font-medium">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Calendar className="h-10 w-10 text-muted-foreground mb-4 opacity-40" />
              <h3 className="text-base font-semibold text-foreground mb-1">No {activeTab} sessions</h3>
              <p className="text-muted-foreground text-center max-w-sm text-sm">
                {activeTab === "upcoming" ? "No upcoming counseling sessions scheduled." : "No sessions in this category."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              <AnimatePresence>
                {displayed.map((session, idx) => {
                  const { date, time } = formatTime(session);
                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="p-5 hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-slate-700 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                            {session.studentName?.charAt(0) || "S"}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{session.studentName || "Student"}</h3>
                            <p className="text-xs text-muted-foreground truncate">{session.studentEmail}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">{session.topic}</Badge>
                              <StatusBadge status={session.status} />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{date}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] px-3 py-1.5 rounded-lg">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground text-xs">{time}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {session.status === "confirmed" && (
                            <>
                              {session.meetingLink && (
                                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 text-xs rounded-lg" asChild>
                                  <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                    <Video className="h-3.5 w-3.5 mr-1" />Join
                                  </a>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs rounded-lg"
                                onClick={() => { setSelected(session); setCounselorNotes(""); setCompleteOpen(true); }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Complete
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-red-600 focus:bg-red-50 cursor-pointer text-sm"
                                    onClick={() => { setSelected(session); setCancelReason(""); setCancelOpen(true); }}
                                  >
                                    <X className="h-3.5 w-3.5 mr-2" />Cancel Session
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                        </div>
                      </div>

                      {(session.notes || session.counselorNotes) && (
                        <div className="mt-3 ml-[3.75rem] space-y-1.5">
                          {session.notes && (
                            <div className="pl-3 border-l-2 border-[var(--border)]">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Student notes: </span>{session.notes}
                              </p>
                            </div>
                          )}
                          {session.counselorNotes && (
                            <div className="pl-3 border-l-2 border-blue-300">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-blue-600">Your notes: </span>{session.counselorNotes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Complete Session Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Session as Completed</DialogTitle>
            <DialogDescription>Add any post-session notes for {selected?.studentName}.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Counselor Notes (optional)
            </Label>
            <Textarea
              placeholder="Session summary, action items, follow-ups..."
              value={counselorNotes}
              onChange={e => setCounselorNotes(e.target.value)}
              rows={4}
              className="resize-none text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Session</DialogTitle>
            <DialogDescription>Cancel session with <span className="font-medium">{selected?.studentName}</span>?</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block text-sm font-medium">Reason for Cancellation</Label>
            <Textarea
              placeholder="Please let the student know why you're cancelling..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Session</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isProcessing}>
              {isProcessing ? "Cancelling..." : "Cancel Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
