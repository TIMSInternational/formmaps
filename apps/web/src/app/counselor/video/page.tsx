"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Video, VideoOff, Plus, X } from "lucide-react";
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
import { getMinDatetime } from "@/components/video/VideoHelpers";
import { SessionsList } from "@/components/video/SessionsList";
import { NewCallPanel } from "./_components/NewCallPanel";

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

      <SessionsList
        userId={userId}
        sessions={sessions}
        basePath="/counselor/video"
        onJoinActive={(id) => router.push(`/counselor/video/${id}`)}
        onStartScheduled={handleStartScheduled}
        onCancelScheduled={handleCancelScheduled}
      />
    </div>
  );
}
