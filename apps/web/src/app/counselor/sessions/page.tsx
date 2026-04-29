"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  CalendarDays,
  Loader2,
  Video,
  MoreHorizontal,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";
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

  // Dialogs
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
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">My Sessions</h1>
            <p className="text-gray-500 mt-1">Manage counseling sessions with your students</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: CalendarDays, color: "text-slate-600", bg: "from-slate-100 to-slate-200" },
            { label: "Upcoming", value: stats.upcoming, icon: Clock, color: "text-emerald-600", bg: "from-emerald-100 to-emerald-200" },
            { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-blue-600", bg: "from-blue-100 to-blue-200" },
            { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "text-red-500", bg: "from-red-100 to-red-200" },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 bg-gradient-to-br ${stat.bg} rounded-xl`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Sessions List */}
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-white px-6 py-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-xl font-bold text-gray-900">Session List</CardTitle>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-gray-100/80 p-1 rounded-xl">
                  {[["upcoming", `Upcoming (${upcoming.length})`], ["past", `Past (${past.length})`], ["all", `All (${sessions.length})`]].map(([val, label]) => (
                    <TabsTrigger key={val} value={val} className="rounded-lg px-3 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="h-20 w-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-5">
                  <Calendar className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No {activeTab} sessions</h3>
                <p className="text-gray-500 text-center max-w-sm text-sm">
                  {activeTab === "upcoming" ? "No upcoming counseling sessions scheduled." : "No sessions in this category."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                <AnimatePresence>
                  {displayed.map((session, idx) => {
                    const { date, time } = formatTime(session);
                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="p-5 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                          {/* Student Info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-slate-700 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                              {session.studentName?.charAt(0) || "S"}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-gray-900 truncate">{session.studentName || "Student"}</h3>
                              <p className="text-xs text-gray-500 truncate">{session.studentEmail}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-xs">{session.topic}</Badge>
                                <StatusBadge status={session.status} />
                              </div>
                            </div>
                          </div>

                          {/* Date/Time */}
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
                              <Calendar className="h-3.5 w-3.5 text-slate-500" />
                              <span className="font-medium text-slate-700 text-xs">{date}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
                              <Clock className="h-3.5 w-3.5 text-slate-500" />
                              <span className="font-medium text-slate-700 text-xs">{time}</span>
                            </div>
                          </div>

                          {/* Actions */}
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
                                  className="h-8 px-3 text-xs rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50"
                                  onClick={() => { setSelected(session); setCounselorNotes(""); setCompleteOpen(true); }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Complete
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                      <MoreHorizontal className="h-4 w-4 text-slate-500" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl shadow-lg p-1">
                                    <DropdownMenuItem
                                      className="text-red-600 focus:bg-red-50 rounded-lg cursor-pointer text-sm"
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

                        {/* Notes */}
                        {(session.notes || session.counselorNotes) && (
                          <div className="mt-3 ml-[3.75rem] space-y-1.5">
                            {session.notes && (
                              <div className="pl-3 border-l-2 border-slate-200">
                                <p className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-600">Student notes: </span>{session.notes}
                                </p>
                              </div>
                            )}
                            {session.counselorNotes && (
                              <div className="pl-3 border-l-2 border-blue-200">
                                <p className="text-xs text-gray-500">
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
          </CardContent>
        </Card>

      {/* Complete Session Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mark Session as Completed</DialogTitle>
            <DialogDescription>Add any post-session notes for {selected?.studentName}.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-gray-400" />
              Counselor Notes (optional)
            </Label>
            <Textarea
              placeholder="Session summary, action items, follow-ups..."
              value={counselorNotes}
              onChange={e => setCounselorNotes(e.target.value)}
              rows={4}
              className="resize-none rounded-xl text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)} className="rounded-lg">Cancel</Button>
            <Button onClick={handleComplete} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
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
              className="resize-none rounded-xl text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} className="rounded-lg">Keep Session</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isProcessing} className="rounded-lg">
              {isProcessing ? "Cancelling..." : "Cancel Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
