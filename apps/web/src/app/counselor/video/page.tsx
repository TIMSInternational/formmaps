"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Video, VideoOff, Clock, Plus, X, CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  isVideoEnabled,
  listVideoSessions,
  createVideoSession,
  scheduleVideoSession,
  startScheduledSession,
  cancelVideoSession,
  VideoSession,
} from "@/services/videoService";
import { apiRequest } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";
import { NewCallPanel } from "./_components/NewCallPanel";

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatScheduledTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  if (diffMins < 0) return `${dateStr} at ${timeStr} (overdue)`;
  if (diffMins < 60) return `In ${diffMins}m - ${timeStr}`;
  if (diffHours < 24) return `In ${diffHours}h - Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  return `${dateStr} at ${timeStr}`;
}

function formatDuration(start: string, end?: string): string {
  if (!end) return "Ongoing";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getMinDatetime(): string {
  const d = new Date(Date.now() + 5 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function VideoCallsPage() {
  const router = useRouter();
  const userId = useGlobalStore((s) => s.user.id);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCall, setShowNewCall] = useState(false);
  const [mode, setMode] = useState<"call" | "schedule">("call");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; roleName?: string }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [startingCall, setStartingCall] = useState(false);

  const [scheduleParticipant, setScheduleParticipant] = useState<{ id: string; name: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const refreshSessions = async () => {
    try { setSessions(await listVideoSessions()); } catch {}
  };

  useEffect(() => {
    (async () => {
      const videoEnabled = await isVideoEnabled();
      setEnabled(videoEnabled);
      if (videoEnabled) await refreshSessions();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!showNewCall) return;
    setContactsLoading(true);
    const t = setTimeout(async () => {
      try {
        const searchParam = contactSearch ? `&search=${encodeURIComponent(contactSearch)}` : "";
        const res = await apiRequest(`/api/v1/counselor/me/students?limit=50${searchParam}`);
        const items = Array.isArray(res?.data) ? res.data : res?.data?.data ?? res?.data ?? [];
        setContacts(Array.isArray(items) ? items : []);
      } catch { setContacts([]); }
      finally { setContactsLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch, showNewCall]);

  const handleStartCall = async (participantId: string) => {
    if (startingCall) return;
    setStartingCall(true);
    try {
      const session = await createVideoSession(participantId);
      router.push(`/counselor/video/${session.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start video call";
      toast.error(msg);
    } finally { setStartingCall(false); }
  };

  const handleSchedule = async () => {
    if (!scheduleParticipant || !scheduleDate || scheduling) return;
    setScheduling(true);
    try {
      await scheduleVideoSession(scheduleParticipant.id, scheduleDate, scheduleDuration, scheduleNotes);
      toast.success(`Call scheduled with ${scheduleParticipant.name}`);
      setShowNewCall(false);
      setScheduleParticipant(null);
      setScheduleDate("");
      setScheduleNotes("");
      setScheduleDuration(60);
      await refreshSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule call";
      toast.error(msg);
    } finally { setScheduling(false); }
  };

  const handleStartScheduled = async (sessionId: string) => {
    try {
      await startScheduledSession(sessionId);
      router.push(`/counselor/video/${sessionId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start session";
      toast.error(msg);
    }
  };

  const handleCancelScheduled = async (sessionId: string) => {
    try {
      await cancelVideoSession(sessionId);
      toast.success("Scheduled call cancelled");
      await refreshSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      toast.error(msg);
    }
  };

  const activeSessions = sessions.filter((s) => s.status === "video_active");
  const scheduledSessions = sessions.filter((s) => s.status === "scheduled").sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastSessions = sessions.filter((s) => s.status !== "video_active" && s.status !== "scheduled");

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div><div style={{ height: 12, width: 80, background: "var(--admin-bg-hover)", borderRadius: 4 }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 64, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
        </div>
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>Communication</span>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>Video Calls</h1>
        </motion.div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 64, gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <VideoOff style={{ width: 28, height: 28, color: "var(--admin-font-light)" }} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Video Calls Not Available</p>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", maxWidth: 360, textAlign: "center" }}>
            Video calling is not enabled for your school. Contact your administrator to enable this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>Communication</span>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>Video Calls</h1>
          <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Start or schedule 1:1 video calls with students.</p>
        </div>
        <button onClick={() => { setShowNewCall(!showNewCall); setMode("call"); setScheduleParticipant(null); }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, background: showNewCall ? "var(--admin-bg-hover)" : "#065292", color: showNewCall ? "var(--admin-font-primary)" : "#fff", border: "1px solid var(--admin-border-default)", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s" }}>
          {showNewCall ? <X style={{ width: 16, height: 16 }} /> : <Plus style={{ width: 16, height: 16 }} />}
          {showNewCall ? "Cancel" : "New Call"}
        </button>
      </motion.div>

      {/* New Call / Schedule Panel */}
      <AnimatePresence>
        {showNewCall && (
          <NewCallPanel
            mode={mode}
            onModeChange={setMode}
            contactSearch={contactSearch}
            onContactSearchChange={setContactSearch}
            contacts={contacts}
            contactsLoading={contactsLoading}
            startingCall={startingCall}
            onStartCall={handleStartCall}
            scheduleParticipant={scheduleParticipant}
            onSelectParticipant={setScheduleParticipant}
            onClearParticipant={() => setScheduleParticipant(null)}
            scheduleDate={scheduleDate}
            onScheduleDateChange={setScheduleDate}
            scheduleDuration={scheduleDuration}
            onScheduleDurationChange={setScheduleDuration}
            scheduleNotes={scheduleNotes}
            onScheduleNotesChange={setScheduleNotes}
            scheduling={scheduling}
            onSchedule={handleSchedule}
            minDatetime={getMinDatetime()}
          />
        )}
      </AnimatePresence>

      {/* Scheduled Sessions */}
      {scheduledSessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 8 }}>Upcoming Calls</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scheduledSessions.map((s) => {
              const other = s.caller?.id === userId ? s.participant : s.caller;
              const isReady = new Date(s.startTime).getTime() - Date.now() < 10 * 60000;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: `1px solid ${isReady ? "#065292" : "var(--admin-border-default)"}`, background: "var(--admin-bg-card)", width: "100%" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{getInitials(other?.name || "?")}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{other?.name}</div>
                    <div style={{ fontSize: 12, color: isReady ? "#065292" : "var(--admin-font-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><CalendarClock style={{ width: 12, height: 12 }} />{formatScheduledTime(s.startTime)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {isReady && (
                      <button onClick={() => handleStartScheduled(s.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <Video style={{ width: 14, height: 14 }} />Start
                      </button>
                    )}
                    <button onClick={() => handleCancelScheduled(s.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)", fontSize: 12, fontWeight: 500, border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit" }}>
                      <Trash2 style={{ width: 12, height: 12 }} />Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 8 }}>Active Now</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeSessions.map((s) => {
              const other = s.caller?.id === userId ? s.participant : s.caller;
              return (
                <button key={s.id} onClick={() => router.push(`/counselor/video/${s.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: "1px solid #22c55e40", background: "var(--admin-bg-card)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "var(--admin-font-primary)", transition: "border-color 0.15s", width: "100%" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#22c55e"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#22c55e40"; }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: "linear-gradient(135deg, #22c55e, #16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{getInitials(other?.name || "?")}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{other?.name}</div>
                    <div style={{ fontSize: 12, color: "#22c55e", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: "#22c55e", display: "inline-block" }} />
                      In progress · {formatTime(s.startTime)}
                    </div>
                  </div>
                  <div style={{ padding: "6px 14px", borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontSize: 12, fontWeight: 600 }}>Rejoin</div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Past Sessions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 8 }}>
          {activeSessions.length > 0 || scheduledSessions.length > 0 ? "Recent Calls" : "Call History"}
        </div>
        {pastSessions.length === 0 && activeSessions.length === 0 && scheduledSessions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 12, borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Video style={{ width: 24, height: 24, color: "var(--admin-font-light)" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>No video calls yet</p>
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", textAlign: "center" }}>Click &quot;New Call&quot; to start or schedule a 1:1 video call.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pastSessions.map((s) => {
              const other = s.caller?.id === userId ? s.participant : s.caller;
              return (
                <div key={s.id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--admin-font-tertiary)", flexShrink: 0 }}>{getInitials(other?.name || "?")}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{other?.name}</div>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{other?.email}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{formatTime(s.startTime)}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-light)", marginTop: 2, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                      <Clock style={{ width: 10, height: 10 }} />{formatDuration(s.startTime, s.endTime)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
