"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Video, User, MoreHorizontal, LayoutList } from "lucide-react";
import { CalendarView } from "./_components/CalendarView";
import { SessionCardSkeleton } from "@/components/skeletons/SessionCardSkeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CoachSessionsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  // Simple in-memory cache to avoid repeated parsing within same session
  const SESSION_CACHE_KEY = "coach_sessions_all";
  const CACHE_TTL = 1000 * 60 * 2; // 2 minutes

  async function fetchWithRetry(
    fn: () => Promise<any>,
    retries = 2,
    delay = 300
  ) {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) throw err;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
  }

  const fetchSessions = async () => {
    try {
      setIsLoading(true);

      // Check cache
      const cached = ((globalThis as any).__sessionCache ??= new Map());
      const entry = cached.get(SESSION_CACHE_KEY);
      if (entry && Date.now() - entry.ts < CACHE_TTL) {
        setSessions(entry.data);
        return;
      }

      const { getCoachSessions } = await import("@/services/coachService");

      const rawResponse: any = await fetchWithRetry(() =>
        getCoachSessions("all")
      );

      const normalize = (await import("@/lib/normalizeSessions")).default;
      const normalized = normalize(rawResponse);

      console.debug("🔍 Fetched sessions (normalized):", normalized);

      setSessions(normalized);

      cached.set(SESSION_CACHE_KEY, { ts: Date.now(), data: normalized });
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
      toast.error(t("coaching.dashboard.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const now = Date.now();

  const upcomingSessions = useMemo(() => {
    const { isUpcoming } = require("@/lib/normalizeSessions");
    return sessions.filter((s: any) => isUpcoming(s, now));
  }, [sessions]);

  const pastSessions = useMemo(() => {
    const { isPast } = require("@/lib/normalizeSessions");
    return sessions.filter((s: any) => isPast(s, now));
  }, [sessions]);

  const handleRescheduleClick = (session: any) => {
    setSelectedSession(session);
    setRescheduleDate("");
    setRescheduleTime("");
    setIsRescheduleOpen(true);
  };

  const handleCancelClick = (session: any) => {
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
      // Construct ISO string or required format
      const start = new Date(
        `${rescheduleDate}T${rescheduleTime}`
      ).toISOString();
      // Assuming 1 hour duration for now, or calculate based on original duration
      const end = new Date(
        new Date(start).getTime() + 60 * 60 * 1000
      ).toISOString();

      await rescheduleSession(selectedSession.id, { start, end });

      toast.success(t("coaching.dashboard.rescheduleSuccess"));
      setIsRescheduleOpen(false);
      fetchSessions(); // Refresh list
    } catch (error) {
      console.error("Reschedule error:", error);
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  const confirmCancel = async () => {
    if (!selectedSession) return;

    try {
      const { cancelSession } = await import("@/services/coachService");
      await cancelSession(
        selectedSession.id,
        cancelReason || "Cancelled by coach"
      );

      toast.success(t("coaching.dashboard.sessionCancelled"));
      setIsCancelOpen(false);
      fetchSessions(); // Refresh list
    } catch (error) {
      console.error("Cancel error:", error);
      toast.error(t("coaching.dashboard.cancelFailed"));
    }
  };

  const SessionCard = ({ session }: { session: any }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            <Avatar className="h-12 w-12">
              <AvatarImage src={session.studentImage} />
              <AvatarFallback>
                {session.studentName?.charAt(0) || "S"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">
                {session.studentName || "Student"}
              </h3>
              <p className="text-sm text-gray-600 mt-1">{session.topic}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {session.date ||
                      new Date(session.startTime).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {session.time ||
                      new Date(session.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                session.status === "confirmed"
                  ? "default"
                  : session.status === "completed"
                    ? "secondary"
                    : "destructive"
              }
            >
              {session.status}
            </Badge>
            {session.status === "confirmed" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRescheduleClick(session)}
                >
                  Reschedule
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCancelClick(session)}
                >
                  Cancel
                </Button>
              </>
            )}
            {session.meetingLink && session.status === "confirmed" && (
              <Button size="sm" asChild>
                <a
                  href={session.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video className="h-4 w-4 mr-2" />
                  Join
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Sessions</h1>
          <p className="text-gray-500 mt-1">Manage your coaching sessions</p>
        </div>

        {/* View Toggle */}
        <div className="flex justify-end gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-2"
          >
            <LayoutList className="h-4 w-4" />
            List
          </Button>
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Button>
        </div>

        {viewMode === "calendar" ? (
          <CalendarView
            sessions={sessions}
            onSessionClick={(session) => {
              // For now, open reschedule dialog as a "details" action or just select it
              // Ideally we show a details dialog first.
              handleRescheduleClick(session);
            }}
          />
        ) : (
          /* Tabs */
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="upcoming">
                Upcoming ({upcomingSessions.length})
              </TabsTrigger>
              <TabsTrigger value="past">Past ({pastSessions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4 mt-6">
              {isLoading ? (
                <div className="grid gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SessionCardSkeleton key={i} />
                  ))}
                </div>
              ) : upcomingSessions.length > 0 ? (
                upcomingSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No upcoming sessions
                    </h3>
                    <p className="text-gray-500 mt-1">
                      Your upcoming coaching sessions will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-4 mt-6">
              {isLoading ? (
                <div className="grid gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SessionCardSkeleton key={i} />
                  ))}
                </div>
              ) : pastSessions.length > 0 ? (
                pastSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No past sessions
                    </h3>
                    <p className="text-gray-500 mt-1">
                      Your completed sessions will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Reschedule Dialog */}
        <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Date</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>New Time</Label>
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={confirmReschedule} className="flex-1">
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsRescheduleOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-500">
                Are you sure you want to cancel this session? This action cannot
                be undone.
              </p>
              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Input
                  placeholder="e.g. Unexpected conflict"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="destructive"
                  onClick={confirmCancel}
                  className="flex-1"
                >
                  Confirm Cancellation
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsCancelOpen(false)}
                  className="flex-1"
                >
                  Keep Session
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
