"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Video, VideoOff, Plus, UserPlus, X, Calendar, CalendarClock } from "lucide-react";
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
import { searchContacts } from "@/services/messageService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getInitials, getMinDatetime } from "@/components/video/VideoHelpers";
import { SessionsList } from "@/components/video/SessionsList";

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
      try { setContacts(await searchContacts(contactSearch || undefined)); }
      catch { setContacts([]); }
      finally { setContactsLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch, showNewCall]);

  const handleStartCall = async (participantId: string) => {
    if (startingCall) return;
    setStartingCall(true);
    try {
      const session = await createVideoSession(participantId);
      router.push(`/school-admin/video/${session.id}`);
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
      router.push(`/school-admin/video/${sessionId}`);
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
          <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Start or schedule 1:1 video calls with students and staff.</p>
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
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: 16 }}>
              {/* Mode Toggle */}
              <div style={{ display: "flex", gap: 4, marginBottom: 12, padding: 3, borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                <button onClick={() => { setMode("call"); setScheduleParticipant(null); }}
                  style={{ flex: 1, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: mode === "call" ? "#065292" : "transparent", color: mode === "call" ? "#fff" : "var(--admin-font-tertiary)", transition: "all 0.15s" }}>
                  <Video style={{ width: 14, height: 14, display: "inline", verticalAlign: -2, marginRight: 6 }} />
                  Call Now
                </button>
                <button onClick={() => setMode("schedule")}
                  style={{ flex: 1, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: mode === "schedule" ? "#065292" : "transparent", color: mode === "schedule" ? "#fff" : "var(--admin-font-tertiary)", transition: "all 0.15s" }}>
                  <Calendar style={{ width: 14, height: 14, display: "inline", verticalAlign: -2, marginRight: 6 }} />
                  Schedule
                </button>
              </div>

              {/* Contact Search */}
              {(mode === "call" || (mode === "schedule" && !scheduleParticipant)) && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-accent-blue)", marginBottom: 12 }}>
                    <UserPlus style={{ width: 16, height: 16, color: "var(--admin-accent-blue)", flexShrink: 0 }} />
                    <input placeholder={mode === "call" ? "Search by name or email to start a call..." : "Search for a contact to schedule with..."}
                      value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} autoFocus
                      style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {contactsLoading ? (
                      <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>Searching...</div>
                    ) : contacts.length === 0 ? (
                      <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>No contacts found</div>
                    ) : contacts.map((c) => (
                      <button key={c.id}
                        onClick={() => mode === "call" ? handleStartCall(c.id) : setScheduleParticipant({ id: c.id, name: c.name })}
                        disabled={startingCall}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: startingCall ? "default" : "pointer", fontFamily: "inherit", textAlign: "left", color: "var(--admin-font-primary)", transition: "background 0.1s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                          {c.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{c.roleName?.replace("_", " ")} · {c.email}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: mode === "call" ? "linear-gradient(135deg, #22c55e, #16a34a)" : "#065292", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                          {mode === "call" ? <Video style={{ width: 14, height: 14 }} /> : <Calendar style={{ width: 14, height: 14 }} />}
                          {mode === "call" ? "Call" : "Select"}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Schedule Form */}
              {mode === "schedule" && scheduleParticipant && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600 }}>
                      {getInitials(scheduleParticipant.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{scheduleParticipant.name}</div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Scheduling video call</div>
                    </div>
                    <button onClick={() => setScheduleParticipant(null)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-font-tertiary)", padding: 4 }}>
                      <X style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Date & Time</label>
                    <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={getMinDatetime()}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Duration</label>
                    <select value={scheduleDuration} onChange={(e) => setScheduleDuration(Number(e.target.value))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Notes (optional)</label>
                    <textarea value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)} placeholder="Agenda or topics to discuss..."
                      rows={2} maxLength={500}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <button onClick={handleSchedule} disabled={!scheduleDate || scheduling}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", borderRadius: 10, border: "none", background: !scheduleDate ? "var(--admin-bg-hover)" : "#065292", color: !scheduleDate ? "var(--admin-font-tertiary)" : "#fff", cursor: !scheduleDate || scheduling ? "default" : "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>
                    <CalendarClock style={{ width: 16, height: 16 }} />
                    {scheduling ? "Scheduling..." : "Schedule Call"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SessionsList
        userId={userId}
        sessions={sessions}
        basePath="/school-admin/video"
        onJoinActive={(id) => router.push(`/school-admin/video/${id}`)}
        onStartScheduled={handleStartScheduled}
        onCancelScheduled={handleCancelScheduled}
      />
    </div>
  );
}
