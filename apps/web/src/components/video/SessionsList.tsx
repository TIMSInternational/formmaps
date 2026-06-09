"use client";

import { motion } from "motion/react";
import { Video, Clock, CalendarClock, Trash2 } from "lucide-react";
import { formatTime, formatScheduledTime, formatDuration, getInitials } from "./VideoHelpers";
import type { VideoSession } from "@/services/videoService";

interface SessionsListProps {
  userId: string | null;
  sessions: VideoSession[];
  /** Base path for video routes, e.g. "/counselor/video" */
  basePath: string;
  onJoinActive: (sessionId: string) => void;
  onStartScheduled?: (sessionId: string) => void;
  onCancelScheduled?: (sessionId: string) => void;
  /** Empty-state hint. Students can't start calls, so the default "Click New Call" copy is wrong for them. */
  emptyHint?: string;
}

export function SessionsList({
  userId,
  sessions,
  basePath,
  onJoinActive,
  onStartScheduled,
  onCancelScheduled,
  emptyHint = 'Click "New Call" to start or schedule a 1:1 video call.',
}: SessionsListProps) {
  const activeSessions = sessions.filter((s) => s.status === "video_active");
  const scheduledSessions = sessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastSessions = sessions.filter((s) => s.status !== "video_active" && s.status !== "scheduled");

  return (
    <>
      {/* Scheduled Sessions */}
      {scheduledSessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 8 }}>
            Upcoming Calls
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scheduledSessions.map((s) => {
              const other = s.caller?.id === userId ? s.participant : s.caller;
              const isReady = new Date(s.startTime).getTime() - Date.now() < 10 * 60000;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: `1px solid ${isReady ? "#065292" : "var(--admin-border-default)"}`, background: "var(--admin-bg-card)", width: "100%" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {getInitials(other?.name || "?")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{other?.name}</div>
                    <div style={{ fontSize: 12, color: isReady ? "#065292" : "var(--admin-font-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      <CalendarClock style={{ width: 12, height: 12 }} />
                      {formatScheduledTime(s.startTime)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {isReady && onStartScheduled && (
                      <button onClick={() => onStartScheduled(s.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <Video style={{ width: 14, height: 14 }} />
                        Start
                      </button>
                    )}
                    {isReady && !onStartScheduled && (
                      <button onClick={() => onJoinActive(s.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <Video style={{ width: 14, height: 14 }} />
                        Join
                      </button>
                    )}
                    {onCancelScheduled && (
                      <button onClick={() => onCancelScheduled(s.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)", fontSize: 12, fontWeight: 500, border: "1px solid var(--admin-border-default)", cursor: "pointer", fontFamily: "inherit" }}>
                        <Trash2 style={{ width: 12, height: 12 }} />
                        Cancel
                      </button>
                    )}
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
                <button key={s.id} onClick={() => onJoinActive(s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: "1px solid #22c55e40", background: "var(--admin-bg-card)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "var(--admin-font-primary)", transition: "border-color 0.15s", width: "100%" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#22c55e"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#22c55e40"; }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: "linear-gradient(135deg, #22c55e, #16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {getInitials(other?.name || "?")}
                  </div>
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
            <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", textAlign: "center" }}>{emptyHint}</p>
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
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--admin-font-tertiary)", flexShrink: 0 }}>
                    {getInitials(other?.name || "?")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{other?.name}</div>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{other?.email}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{formatTime(s.startTime)}</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-light)", marginTop: 2, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                      <Clock style={{ width: 10, height: 10 }} />
                      {formatDuration(s.startTime, s.endTime)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </>
  );
}
