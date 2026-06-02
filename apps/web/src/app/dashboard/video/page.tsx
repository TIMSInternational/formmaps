"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Video, VideoOff, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  isVideoEnabled,
  listVideoSessions,
  createVideoSession,
  startScheduledSession,
  VideoSession,
} from "@/services/videoService";
import { searchContacts } from "@/services/messageService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { SessionsList } from "@/components/video/SessionsList";

export default function VideoCallsPage() {
  const router = useRouter();
  const userId = useGlobalStore((s) => s.user.id);
  const userRole = useGlobalStore((s) => s.user.role);
  const isStaff = ["counselor", "school_admin", "Super Admin"].includes(userRole || "");

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCall, setShowNewCall] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; roleName?: string }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [startingCall, setStartingCall] = useState(false);

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
      router.push(`/dashboard/video/${session.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start video call";
      toast.error(msg);
    } finally { setStartingCall(false); }
  };

  const handleJoinScheduled = async (sessionId: string) => {
    try {
      await startScheduledSession(sessionId);
      router.push(`/dashboard/video/${sessionId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to join session";
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div><div style={{ height: 12, width: 80, background: "var(--admin-bg-hover)", borderRadius: 4 }} /></div>
        {[...Array(3)].map((_, i) => <div key={i} style={{ height: 64, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
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
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>Communication</span>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>Video Calls</h1>
          <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Start a video call with your counselor or school staff.</p>
        </div>
        {isStaff && (
          <button onClick={() => setShowNewCall(!showNewCall)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, background: showNewCall ? "var(--admin-bg-hover)" : "#065292", color: showNewCall ? "var(--admin-font-primary)" : "#fff", border: "1px solid var(--admin-border-default)", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s" }}>
            {showNewCall ? <X style={{ width: 16, height: 16 }} /> : <Plus style={{ width: 16, height: 16 }} />}
            {showNewCall ? "Cancel" : "New Call"}
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {showNewCall && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-accent-blue)", marginBottom: 12 }}>
                <UserPlus style={{ width: 16, height: 16, color: "var(--admin-accent-blue)", flexShrink: 0 }} />
                <input placeholder="Search by name or email..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} autoFocus
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {contactsLoading ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>Searching...</div>
                ) : contacts.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>No contacts found</div>
                ) : contacts.map((c) => (
                  <button key={c.id} onClick={() => handleStartCall(c.id)} disabled={startingCall}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      <Video style={{ width: 14, height: 14 }} />
                      Call
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SessionsList
        userId={userId}
        sessions={sessions}
        basePath="/dashboard/video"
        onJoinActive={(id) => router.push(`/dashboard/video/${id}`)}
        onStartScheduled={handleJoinScheduled}
      />
    </div>
  );
}
