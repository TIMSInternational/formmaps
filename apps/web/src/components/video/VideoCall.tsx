"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, Loader2, FileText, PenSquare, Maximize2, Minimize2, Mail, GraduationCap, Calendar, BookOpen, Lightbulb, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getVideoSession, getVideoSignature, endVideoSession, VideoSession } from "@/services/videoService";
import { getStudentNotes, createNote } from "@/services/counselorNotesService";
import type { CounselorNote } from "@/types/counselorNotes";
import { useGlobalStore } from "@/store/useGlobalStore";
import { apiRequest } from "@/lib/api/apiClient";
import { getInitials } from "@/lib/stringUtils";

// Daily.co participant type
interface DailyParticipant {
  session_id: string;
  user_name: string;
  local: boolean;
  video: boolean;
  audio: boolean;
  tracks: Record<string, { state: string; track?: MediaStreamTrack }>;
}

interface ParticipantInfo {
  id: string;
  name: string;
  email: string;
  gradeLevel?: number;
  gpa?: number | null;
  status?: string;
  creditProgress?: { earned: number; required: number; percentage: number };
  assessmentStatus?: { PCA: string; MIL: string; Eval360: string };
}

interface VideoCallProps {
  sessionId: string;
  returnPath: string;
}


function formatNoteDate(d: string): string {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function VideoCall({ sessionId, returnPath }: VideoCallProps) {
  const router = useRouter();
  const userId = useGlobalStore((s) => s.user.id);
  const userName = useGlobalStore((s) => s.user.name) || "User";
  const userRole = useGlobalStore((s) => s.user.role)?.toLowerCase() || "";

  // Session state
  const [session, setSession] = useState<VideoSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Daily.co call states
  const clientRef = useRef<ReturnType<typeof import("@daily-co/daily-js").default.createCallObject> | null>(null);
  const [isSDKInitialized, setIsSDKInitialized] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isVideoStarting, setIsVideoStarting] = useState(false);
  const [isAudioStarting, setIsAudioStarting] = useState(false);
  const [participants, setParticipants] = useState<DailyParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selfVideoRef = useRef<HTMLDivElement>(null);
  const participantVideoRef = useRef<HTMLDivElement>(null);
  const joinAttemptedRef = useRef(false);

  // Side panels (OSF-style)
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [showCoursePlan, setShowCoursePlan] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfo | null>(null);
  const [participantLoading, setParticipantLoading] = useState(false);
  const [notes, setNotes] = useState<CounselorNote[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [selectedNote, setSelectedNote] = useState<CounselorNote | null>(null);
  const [coursePlanData, setCoursePlanData] = useState<any>(null);
  const [recsData, setRecsData] = useState<any>(null);

  const otherPerson = session?.caller?.id === userId ? session?.participant : session?.caller;
  const isPrivilegedRole = ["school_admin", "counselor", "super admin"].includes(userRole);

  // Load session details
  useEffect(() => {
    (async () => {
      try {
        const s = await getVideoSession(sessionId);
        setSession(s);
      } catch {
        setError("Failed to load session. It may have expired or you don't have access.");
      } finally {
        setLoadingSession(false);
      }
    })();
  }, [sessionId]);

  // Load participant info + notes
  // Use counselor endpoints for counselor role, school-admin for admin
  const isCounselor = userRole === "counselor";

  useEffect(() => {
    if (!session || !otherPerson?.id) return;
    (async () => {
      setParticipantLoading(true);
      if (isPrivilegedRole) {
        try {
          const studentUrl = isCounselor
            ? `/api/v1/counselor/me/students/${otherPerson.id}`
            : `/api/v1/school-admin/students/${otherPerson.id}`;
          const res = await apiRequest(studentUrl);
          setParticipantInfo(res?.data ?? res);
        } catch {
          setParticipantInfo({ id: otherPerson.id, name: otherPerson.name || "", email: otherPerson.email || "" });
        }
      } else {
        setParticipantInfo({ id: otherPerson.id, name: otherPerson.name || "", email: otherPerson.email || "" });
      }
      setParticipantLoading(false);

      if (isPrivilegedRole) {
        try {
          const notesRes = await getStudentNotes(otherPerson.id, { limit: 20 });
          setNotes(notesRes?.data ?? []);
        } catch {}
        try {
          const cpUrl = isCounselor
            ? `/api/v1/counselor/me/students/${otherPerson.id}/course-sequence`
            : `/api/v1/school-admin/students/${otherPerson.id}/course-plan`;
          const cpRes = await apiRequest(cpUrl);
          setCoursePlanData(cpRes?.data ?? cpRes);
        } catch {}
        try {
          const recRes = await apiRequest(`/api/v1/school-admin/academic-gaps/recommendations/${otherPerson.id}`);
          setRecsData(recRes?.data ?? recRes);
        } catch {}
      }
    })();
  }, [session, otherPerson?.id, isPrivilegedRole, isCounselor]);

  // Initialize SDK
  useEffect(() => {
    if (!session) return;
    initializeDailySDK();
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { if (isJoined) { e.preventDefault(); e.returnValue = ""; cleanup(); } };
    const handleUnload = () => { if (isJoined) cleanup(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleUnload);
    return () => { window.removeEventListener("beforeunload", handleBeforeUnload); window.removeEventListener("unload", handleUnload); cleanup(); };
  }, [session]);

  useEffect(() => {
    if (isSDKInitialized && session && !isJoined && !isLoading && !joinAttemptedRef.current) {
      joinAttemptedRef.current = true;
      joinSession();
    }
  }, [isSDKInitialized, session]);

  const cleanup = async () => {
    if (isJoined && clientRef.current) {
      try { await clientRef.current.leave(); } catch {}
      try { clientRef.current.destroy(); } catch {}
    }
    if (selfVideoRef.current) selfVideoRef.current.innerHTML = "";
    if (participantVideoRef.current) participantVideoRef.current.innerHTML = "";
  };

  const initializeDailySDK = async () => {
    try {
      const Daily = (await import("@daily-co/daily-js")).default;
      const callObject = Daily.createCallObject({ startVideoOff: false, startAudioOff: false });
      clientRef.current = callObject;

      // Track events — attach remote video to DOM
      callObject.on("track-started", (event) => {
        if (!event) return;
        const { participant, track } = event as { participant?: DailyParticipant; track?: MediaStreamTrack };
        if (!participant || participant.local || !track) return;
        if (track.kind === "video" && participantVideoRef.current) {
          participantVideoRef.current.innerHTML = "";
          const videoEl = document.createElement("video");
          videoEl.srcObject = new MediaStream([track]);
          videoEl.autoplay = true; videoEl.playsInline = true;
          videoEl.style.width = "100%"; videoEl.style.height = "100%"; videoEl.style.objectFit = "cover";
          participantVideoRef.current.appendChild(videoEl);
        }
      });
      callObject.on("track-stopped", (event) => {
        const { participant, track } = (event || {}) as { participant?: DailyParticipant; track?: MediaStreamTrack };
        if (participant && !participant.local && track?.kind === "video" && participantVideoRef.current) {
          participantVideoRef.current.innerHTML = "";
        }
      });
      callObject.on("participant-joined", () => { updateParticipants(); });
      callObject.on("participant-left", () => { updateParticipants(); });
      callObject.on("error", (e) => { setError(`Connection error: ${(e as { errorMsg?: string })?.errorMsg || "Please try again."}`); });
      callObject.on("left-meeting", () => { setIsJoined(false); });

      setIsSDKInitialized(true);
    } catch { setError("Failed to initialize video system. Please refresh the page."); }
  };

  const updateParticipants = () => {
    if (!clientRef.current) return;
    const all = clientRef.current.participants();
    const remote = Object.values(all).filter((p) => !(p as DailyParticipant).local);
    setParticipants(remote as DailyParticipant[]);
  };

  const joinSession = async () => {
    if (!clientRef.current || !isSDKInitialized || !session) return;
    setIsLoading(true); setError(null);
    try {
      const isHost = session.caller?.id === userId;
      const { signature, roomUrl } = await getVideoSignature(session.sessionName, isHost ? 1 : 0);
      await clientRef.current.join({ url: roomUrl, token: signature, userName });

      // Attach local video
      const local = clientRef.current.participants().local as DailyParticipant;
      if (local?.tracks?.video?.track && selfVideoRef.current) {
        selfVideoRef.current.innerHTML = "";
        const videoEl = document.createElement("video");
        videoEl.srcObject = new MediaStream([local.tracks.video.track]);
        videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
        videoEl.style.width = "100%"; videoEl.style.height = "100%"; videoEl.style.objectFit = "cover";
        selfVideoRef.current.appendChild(videoEl);
      }

      setIsJoined(true);
      setIsVideoOn(clientRef.current.localVideo());
      setIsAudioOn(clientRef.current.localAudio());
      updateParticipants();
    } catch (err: unknown) {
      const e = err as Error;
      setError(`Failed to join session. ${e.message || "Please try again."}`);
      joinAttemptedRef.current = false;
    } finally { setIsLoading(false); }
  };

  const toggleVideo = async () => {
    if (!clientRef.current || !isJoined || isVideoStarting) return;
    setIsVideoStarting(true);
    try {
      clientRef.current.setLocalVideo(!isVideoOn);
      setIsVideoOn(!isVideoOn);
      // Update self video element
      if (!isVideoOn) {
        // Turning on — wait for track
        setTimeout(() => {
          const local = clientRef.current?.participants()?.local as DailyParticipant | undefined;
          if (local?.tracks?.video?.track && selfVideoRef.current) {
            selfVideoRef.current.innerHTML = "";
            const videoEl = document.createElement("video");
            videoEl.srcObject = new MediaStream([local.tracks.video.track]);
            videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
            videoEl.style.width = "100%"; videoEl.style.height = "100%"; videoEl.style.objectFit = "cover";
            selfVideoRef.current.appendChild(videoEl);
          }
        }, 300);
      } else if (selfVideoRef.current) {
        selfVideoRef.current.innerHTML = "";
      }
    } catch (err: unknown) { setError(`Failed to ${isVideoOn ? "stop" : "start"} video: ${(err as Error).message}`); }
    finally { setIsVideoStarting(false); }
  };

  const toggleAudio = async () => {
    if (!clientRef.current || !isJoined || isAudioStarting) return;
    setIsAudioStarting(true);
    try {
      clientRef.current.setLocalAudio(!isAudioOn);
      setIsAudioOn(!isAudioOn);
    } catch (err: unknown) { setError(`Failed to ${isAudioOn ? "mute" : "unmute"} audio: ${(err as Error).message}`); }
    finally { setIsAudioStarting(false); }
  };

  const leaveSession = async () => {
    setIsLoading(true);
    try { await cleanup(); } catch {}
    try { await endVideoSession(sessionId); } catch {}
    toast.success("Call ended");
    router.push(returnPath);
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !otherPerson?.id || savingNote) return;
    setSavingNote(true);
    try {
      const note = await createNote({ studentId: otherPerson.id, type: "meeting", content: noteContent.trim(), isPrivate: false });
      setNotes((prev) => [note, ...prev]);
      setNoteContent("");
      toast.success("Note saved");
    } catch { toast.error("Failed to save note"); }
    finally { setSavingNote(false); }
  };

  // Loading / error states
  if (loadingSession) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)" }}>
      <Loader2 style={{ width: 32, height: 32, color: "var(--admin-accent-blue)", animation: "spin 1s linear infinite" }} />
    </div>;
  }
  if (error && !session) {
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 200px)", gap: 16 }}>
      <VideoOff style={{ width: 48, height: 48, color: "var(--admin-font-light)" }} />
      <p style={{ fontSize: 16, color: "var(--admin-font-primary)", fontWeight: 600 }}>Unable to Join</p>
      <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", maxWidth: 400, textAlign: "center" }}>{error}</p>
      <button onClick={() => router.push(returnPath)} style={{ padding: "8px 20px", borderRadius: 8, background: "var(--admin-accent-blue)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Back to Messages</button>
    </div>;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 160px)", minHeight: 500, borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>

      {/* SDK init status */}
      {!isSDKInitialized && session && (
        <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, backgroundColor: "#fbbf24", color: "#000", padding: "6px 16px", borderRadius: 6, fontSize: 13 }}>
          Initializing video system...
        </div>
      )}

      {/* ── Self-view — top-left (OSF: therapist frame) ── */}
      <div style={{
        position: "absolute", top: 16, left: 16, width: "18%", minWidth: 180, height: "30%", minHeight: 130,
        backgroundColor: "#1a1a1a", borderRadius: 8, border: "1px solid #333",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#888", fontSize: 13, overflow: "hidden", zIndex: 2,
      }}>
        <div ref={selfVideoRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
        {!isVideoOn && isJoined && <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 12 }}><VideoOff style={{ width: 24, height: 24, color: "#888", margin: "0 auto 6px" }} /><div>Your video is off</div></div>}
        {!isJoined && <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>Your camera</div>}
      </div>

      {/* ── Participant Info — top-center (OSF: ClientInfo style) ── */}
      <div style={{
        position: "absolute", top: 16, left: "calc(18% + 32px)", right: "calc(37.5% + 32px)",
        height: "30%", minHeight: 130, overflow: "auto",
        opacity: isExpanded ? 0 : 1, visibility: isExpanded ? "hidden" : "visible",
        transition: "opacity 0.3s, visibility 0.3s",
      }}>
        <div style={{
          height: "100%", backgroundColor: "var(--admin-bg-hover)", borderRadius: 16,
          border: "1px solid var(--admin-border-default)", padding: 24,
          display: "flex", alignItems: "center", gap: 20,
        }}>
          {participantLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", color: "var(--admin-font-tertiary)", fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", marginRight: 8 }} />Loading...
            </div>
          ) : participantInfo ? (
            <>
              {/* Large avatar (OSF: 120px) */}
              <div style={{
                width: 90, height: 90, borderRadius: "50%", flexShrink: 0,
                background: "#102B47",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 600, color: "#fff",
              }}>
                {getInitials(participantInfo.name)}
              </div>

              {/* Info beside avatar (OSF style) */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0, lineHeight: 1.2 }}>
                  {participantInfo.name}
                </h2>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                  <Mail style={{ width: 13, height: 13 }} />
                  <span>{participantInfo.email}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
                  {participantInfo.gradeLevel && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--admin-font-secondary)" }}>
                      <GraduationCap style={{ width: 13, height: 13, color: "var(--admin-font-tertiary)" }} />
                      <span>Grade {participantInfo.gradeLevel}</span>
                    </div>
                  )}
                  {participantInfo.gpa !== null && participantInfo.gpa !== undefined && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--admin-font-secondary)" }}>
                      <Calendar style={{ width: 13, height: 13, color: "var(--admin-font-tertiary)" }} />
                      <span>GPA: {participantInfo.gpa}</span>
                    </div>
                  )}
                </div>

                {participantInfo.assessmentStatus && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {Object.entries(participantInfo.assessmentStatus).map(([key, val]) => (
                      <div key={key} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: val === "completed" ? "#22c55e20" : val === "in_progress" ? "#f59e0b20" : "var(--admin-bg-card)", color: val === "completed" ? "#16a34a" : val === "in_progress" ? "#d97706" : "var(--admin-font-light)" }}>
                        {key}: {val.replace("_", " ")}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right-aligned meta (OSF style) */}
              {participantInfo.creditProgress && (
                <div style={{ textAlign: "right", alignSelf: "flex-start", flexShrink: 0 }}>
                  <p style={{ fontSize: 11, color: "var(--admin-font-light)", marginBottom: 4 }}>
                    Credits: {participantInfo.creditProgress.earned}/{participantInfo.creditProgress.required}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--admin-font-light)" }}>
                    Progress: {participantInfo.creditProgress.percentage}%
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{
                width: 90, height: 90, borderRadius: "50%", flexShrink: 0,
                background: "var(--admin-bg-card)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 600, color: "var(--admin-font-light)",
              }}>
                {getInitials(otherPerson?.name || "?")}
              </div>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0 }}>{otherPerson?.name}</h2>
                {otherPerson?.email && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                    <Mail style={{ width: 13, height: 13 }} /><span>{otherPerson.email}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Past Notes sidebar — bottom-left (OSF: PastNotesWidget) ── */}
      <div style={{
        position: "absolute", top: "calc(30% + 32px)", left: 16,
        width: showPastNotes ? "18%" : 0, minWidth: showPastNotes ? 180 : 0,
        bottom: 16, overflow: "hidden",
        transition: "width 0.3s, opacity 0.3s, visibility 0.3s",
        opacity: showPastNotes ? 1 : 0, visibility: showPastNotes ? "visible" : "hidden",
      }}>
        <div style={{ height: "100%", backgroundColor: "var(--admin-bg-hover)", borderRadius: 8, border: "1px solid var(--admin-border-default)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--admin-border-default)", fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Past Notes</div>
          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {notes.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No notes yet</div>
            ) : notes.map((n) => (
              <button key={n.id} onClick={() => { setSelectedNote(n); setNoteContent(n.content); }}
                style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", background: selectedNote?.id === n.id ? "var(--admin-bg-active)" : "transparent", color: "var(--admin-font-primary)", marginBottom: 2, transition: "background 0.1s" }}
                onMouseEnter={(e) => { if (selectedNote?.id !== n.id) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                onMouseLeave={(e) => { if (selectedNote?.id !== n.id) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.content.slice(0, 60)}{n.content.length > 60 ? "..." : ""}</div>
                <div style={{ fontSize: 10, color: "var(--admin-font-light)", marginTop: 2 }}>{formatNoteDate(n.createdDate)} · {n.type}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Session Notepad — bottom-center (OSF: NoteDetailWidget) ── */}
      {isPrivilegedRole && !showCoursePlan && (
        <div style={{
          position: "absolute",
          top: "calc(30% + 32px)",
          left: showPastNotes ? "calc(18% + 32px)" : 16,
          right: "calc(37.5% + 32px)", bottom: 16,
          transition: "left 0.3s, opacity 0.3s, visibility 0.3s",
          opacity: isExpanded ? 0 : 1, visibility: isExpanded ? "hidden" : "visible",
        }}>
          <div style={{ height: "100%", backgroundColor: "var(--admin-bg-hover)", borderRadius: 8, border: "1px solid var(--admin-border-default)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                {selectedNote ? "Edit Note" : "Session Notes"}
              </span>
              {selectedNote && (
                <button onClick={() => { setSelectedNote(null); setNoteContent(""); }}
                  style={{ fontSize: 11, color: "var(--admin-accent-blue)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  + New Note
                </button>
              )}
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write session notes here..."
              style={{
                flex: 1, resize: "none", border: "none", background: "transparent", outline: "none",
                padding: "12px 14px", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit",
                lineHeight: 1.6,
              }}
            />
            <div style={{ padding: "8px 14px", borderTop: "1px solid var(--admin-border-default)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSaveNote} disabled={!noteContent.trim() || savingNote}
                style={{
                  padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: noteContent.trim() ? "var(--admin-accent-blue)" : "var(--admin-bg-card)",
                  color: noteContent.trim() ? "#fff" : "var(--admin-font-light)",
                  border: "none", cursor: noteContent.trim() ? "pointer" : "default",
                }}>
                {savingNote ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Course Plan + Recommendations — bottom-center (togglable, replaces notes) ── */}
      {isPrivilegedRole && showCoursePlan && (
        <div style={{
          position: "absolute",
          top: "calc(30% + 32px)",
          left: showPastNotes ? "calc(18% + 32px)" : 16,
          right: "calc(37.5% + 32px)", bottom: 16,
          transition: "left 0.3s, opacity 0.3s, visibility 0.3s",
          opacity: isExpanded ? 0 : 1, visibility: isExpanded ? "hidden" : "visible",
        }}>
          <div style={{ height: "100%", backgroundColor: "var(--admin-bg-hover)", borderRadius: 8, border: "1px solid var(--admin-border-default)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen style={{ width: 14, height: 14, color: "var(--admin-accent-blue)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Course Plan & Recommendations</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Enrolled Courses by Semester */}
              {coursePlanData?.plan?.enrollments && coursePlanData.plan.enrollments.length > 0 ? (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)", marginBottom: 8 }}>Current Enrollments</div>
                  {[9, 10, 11, 12].map((grade) => {
                    const courses = coursePlanData.plan.enrollments.filter((e: any) => e.gradeLevel === grade);
                    if (courses.length === 0) return null;
                    return (
                      <div key={grade} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4 }}>Grade {grade}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {courses.map((c: any) => (
                            <div key={c.id} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "5px 8px", borderRadius: 4, fontSize: 11,
                              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <span style={{
                                  width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                                  background: c.status === "completed" ? "#10b981" : c.status === "in_progress" ? "#2E9098" : "#9ca3af",
                                }} />
                                <span style={{ fontWeight: 500, color: "var(--admin-font-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.courseName}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, color: "var(--admin-font-tertiary)" }}>
                                <span>{c.courseCode}</span>
                                <span>{c.credits} cr</span>
                                {c.grade && <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.grade}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No course plan data</div>
              )}

              {/* Graduation Progress */}
              {coursePlanData?.plan?.graduationProgress && (
                <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>Graduation Progress</span>
                    <span style={{ color: coursePlanData.plan.graduationProgress.isOnTrack ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                      {coursePlanData.plan.graduationProgress.isOnTrack ? "On Track" : "At Risk"}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--admin-border-default)" }}>
                    <div style={{
                      height: 6, borderRadius: 3, background: "linear-gradient(90deg, #2E9098, #2E9098)",
                      width: `${coursePlanData.plan.graduationProgress.totalCreditsRequired > 0
                        ? Math.min((coursePlanData.plan.graduationProgress.totalCreditsEarned / coursePlanData.plan.graduationProgress.totalCreditsRequired) * 100, 100) : 0}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
                    {coursePlanData.plan.graduationProgress.totalCreditsEarned} / {coursePlanData.plan.graduationProgress.totalCreditsRequired} credits
                  </div>
                </div>
              )}

              {/* AI Recommendations */}
              {recsData && ((recsData.nextSemester?.length ?? 0) > 0 || (recsData.longTerm?.length ?? 0) > 0) && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Lightbulb style={{ width: 12, height: 12, color: "#f59e0b" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>AI Recommendations</span>
                  </div>
                  {recsData.nextSemester?.map((rec: any) => (
                    <div key={rec.courseId || rec.courseCode} style={{
                      padding: "6px 8px", borderRadius: 4, marginBottom: 4, fontSize: 11,
                      border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.04)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase",
                          background: rec.priority === "high" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                          color: rec.priority === "high" ? "#ef4444" : "#f59e0b",
                        }}>{rec.priority}</span>
                      </div>
                      <div style={{ color: "var(--admin-font-tertiary)", marginTop: 2 }}>{rec.courseCode} · {rec.credits} cr</div>
                      <div style={{ color: "var(--admin-font-light)", marginTop: 2, lineHeight: 1.4 }}>{rec.reason}</div>
                    </div>
                  ))}
                  {recsData.longTerm?.map((rec: any) => (
                    <div key={rec.courseId || rec.courseCode} style={{
                      padding: "6px 8px", borderRadius: 4, marginBottom: 4, fontSize: 11,
                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 500, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                        <span style={{ color: "var(--admin-font-tertiary)" }}>{rec.credits} cr</span>
                      </div>
                      <div style={{ color: "var(--admin-font-light)", marginTop: 2 }}>{rec.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Participant Video — right side (OSF: client frame, expands) ── */}
      <div style={{
        position: "absolute", top: 16, right: 16, bottom: 16,
        left: isExpanded ? (isPrivilegedRole ? "calc(18% + 32px)" : 16) : "calc(62.5% + 16px)",
        backgroundColor: "#1a1a1a", borderRadius: 8, border: "1px solid #333",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#888", fontSize: 14, overflow: "hidden",
        transition: "left 0.3s",
      }}>
        <div ref={participantVideoRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />

        {!isJoined && (
          <div style={{ textAlign: "center", position: "relative", zIndex: 1, maxWidth: 400, padding: 16 }}>
            {isLoading ? (
              <><Loader2 style={{ width: 24, height: 24, color: "#888", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} /><div>Connecting to session...</div></>
            ) : error ? (
              <>
                <VideoOff style={{ width: 48, height: 48, color: "#ef4444", margin: "0 auto 8px" }} />
                <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button style={{ backgroundColor: "#10b981", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                    onClick={() => { setError(null); joinSession(); }}>
                    Retry
                  </button>
                  <button style={{ backgroundColor: "#dc2626", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                    onClick={leaveSession}>
                    End &amp; Leave
                  </button>
                </div>
              </>
            ) : (
              <>
                <Video style={{ width: 48, height: 48, color: "#555", margin: "0 auto 8px" }} />
                <div style={{ marginBottom: 12 }}>{otherPerson?.name}&rsquo;s video</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button style={{ backgroundColor: isSDKInitialized ? "#10b981" : "#6b7280", color: "#fff", border: "none", padding: "10px 28px", borderRadius: 6, fontSize: 14, cursor: isSDKInitialized ? "pointer" : "not-allowed", fontWeight: 500, opacity: isSDKInitialized ? 1 : 0.7 }}
                    onClick={isSDKInitialized ? joinSession : undefined} disabled={!isSDKInitialized}>
                    {isSDKInitialized ? "Start Session" : "Initializing..."}
                  </button>
                  <button style={{ backgroundColor: "#333", color: "#fff", border: "1px solid #555", padding: "10px 20px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                    onClick={() => router.push(returnPath)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isJoined && participants.length === 0 && (
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <Users style={{ width: 40, height: 40, color: "#555", margin: "0 auto 8px" }} />
            Waiting for {otherPerson?.name} to join...
          </div>
        )}

        {/* Expand/Collapse (OSF) */}
        <button style={{ position: "absolute", top: 12, left: 12, width: 36, height: 36, borderRadius: 8, backgroundColor: "#333", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s", zIndex: 5 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#333"; }}
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Exit Full Screen" : "Enter Full Screen"}>
          {isExpanded ? <Minimize2 style={{ width: 16, height: 16, color: "#fff" }} /> : <Maximize2 style={{ width: 16, height: 16, color: "#fff" }} />}
        </button>

        {/* End Session — always visible */}
        <button style={{ position: "absolute", top: 12, right: 12, backgroundColor: "#dc2626", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: isLoading ? "not-allowed" : "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6, opacity: isLoading ? 0.7 : 1, zIndex: 5 }}
          onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = "#b91c1c"; }}
          onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = "#dc2626"; }}
          onClick={!isLoading ? leaveSession : undefined} disabled={isLoading}>
          <PhoneOff style={{ width: 14, height: 14 }} />{isLoading ? "Ending..." : "End Session"}
        </button>

        {/* ── Control Toolbar (OSF-style) ── */}
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          height: 52, backgroundColor: "rgba(26, 26, 26, 0.85)", borderRadius: 8,
          border: "1px solid #333", padding: "0 10px",
          display: "flex", gap: 8, alignItems: "center", zIndex: 5,
        }}>
          {/* Past Notes toggle */}
          {isPrivilegedRole && (
            <button style={{ width: 40, height: 40, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s", backgroundColor: showPastNotes ? "#2A9D8F" : "#333" }}
              onMouseEnter={(e) => { if (!showPastNotes) e.currentTarget.style.backgroundColor = "#444"; }}
              onMouseLeave={(e) => { if (!showPastNotes) e.currentTarget.style.backgroundColor = showPastNotes ? "#2A9D8F" : "#333"; }}
              onClick={() => setShowPastNotes(!showPastNotes)} title="Past notes">
              <FileText style={{ width: 18, height: 18, color: "#fff" }} />
            </button>
          )}

          {/* New Note */}
          {isPrivilegedRole && (
            <button style={{ width: 40, height: 40, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s", backgroundColor: "#333" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#333"; }}
              onClick={() => { setShowCoursePlan(false); setSelectedNote(null); setNoteContent(""); if (isExpanded) setIsExpanded(false); }} title="New note">
              <PenSquare style={{ width: 18, height: 18, color: "#fff" }} />
            </button>
          )}

          {/* Course Plan */}
          {isPrivilegedRole && (
            <button style={{ width: 40, height: 40, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s", backgroundColor: showCoursePlan ? "#2E9098" : "#333" }}
              onMouseEnter={(e) => { if (!showCoursePlan) e.currentTarget.style.backgroundColor = "#444"; }}
              onMouseLeave={(e) => { if (!showCoursePlan) e.currentTarget.style.backgroundColor = showCoursePlan ? "#2E9098" : "#333"; }}
              onClick={() => { setShowCoursePlan(!showCoursePlan); if (isExpanded) setIsExpanded(false); }} title="Course plan & recommendations">
              <BookOpen style={{ width: 18, height: 18, color: "#fff" }} />
            </button>
          )}

          {/* Video */}
          <button style={{ width: 40, height: 40, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: isJoined && !isVideoStarting ? "pointer" : "not-allowed", transition: "background 0.2s", backgroundColor: isJoined ? (isVideoOn ? "#10b981" : "#ef4444") : "#333", opacity: isJoined && !isVideoStarting ? 1 : 0.5 }}
            onClick={isJoined && !isVideoStarting ? toggleVideo : undefined} disabled={!isJoined || isVideoStarting} title={isVideoOn ? "Turn off video" : "Turn on video"}>
            {isVideoStarting ? <Loader2 style={{ width: 18, height: 18, color: "#fff", animation: "spin 1s linear infinite" }} /> : isVideoOn ? <Video style={{ width: 18, height: 18, color: "#fff" }} /> : <VideoOff style={{ width: 18, height: 18, color: "#fff" }} />}
          </button>

          {/* Mic */}
          <button style={{ width: 40, height: 40, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: isJoined && !isAudioStarting ? "pointer" : "not-allowed", transition: "background 0.2s", backgroundColor: isJoined ? (isAudioOn ? "#10b981" : "#ef4444") : "#333", opacity: isJoined && !isAudioStarting ? 1 : 0.5 }}
            onClick={isJoined && !isAudioStarting ? toggleAudio : undefined} disabled={!isJoined || isAudioStarting} title={isAudioOn ? "Mute microphone" : "Unmute microphone"}>
            {isAudioStarting ? <Loader2 style={{ width: 18, height: 18, color: "#fff", animation: "spin 1s linear infinite" }} /> : isAudioOn ? <Mic style={{ width: 18, height: 18, color: "#fff" }} /> : <MicOff style={{ width: 18, height: 18, color: "#fff" }} />}
          </button>
        </div>
      </div>

      {/* Error overlay */}
      {error && isJoined && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", backgroundColor: "#dc2626", color: "#fff", padding: "12px 24px", borderRadius: 8, textAlign: "center", maxWidth: 400, zIndex: 100, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>x</button>
        </div>
      )}

      {/* Participant count */}
      {isJoined && (
        <div style={{ position: "absolute", top: 20, right: 20, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, zIndex: 3 }}>
          <Users style={{ width: 12, height: 12 }} />{participants.length + 1}
        </div>
      )}
    </div>
  );
}
