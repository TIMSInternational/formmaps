"use client";

import { motion } from "motion/react";
import { Video, UserPlus, X, Calendar, CalendarClock } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string;
  roleName?: string;
}

interface ScheduleParticipant {
  id: string;
  name: string;
}

interface NewCallPanelProps {
  mode: "call" | "schedule";
  onModeChange: (mode: "call" | "schedule") => void;
  contactSearch: string;
  onContactSearchChange: (value: string) => void;
  contacts: Contact[];
  contactsLoading: boolean;
  startingCall: boolean;
  onStartCall: (participantId: string) => void;
  scheduleParticipant: ScheduleParticipant | null;
  onSelectParticipant: (participant: ScheduleParticipant) => void;
  onClearParticipant: () => void;
  scheduleDate: string;
  onScheduleDateChange: (value: string) => void;
  scheduleDuration: number;
  onScheduleDurationChange: (value: number) => void;
  scheduleNotes: string;
  onScheduleNotesChange: (value: string) => void;
  scheduling: boolean;
  onSchedule: () => void;
  minDatetime: string;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function NewCallPanel({
  mode,
  onModeChange,
  contactSearch,
  onContactSearchChange,
  contacts,
  contactsLoading,
  startingCall,
  onStartCall,
  scheduleParticipant,
  onSelectParticipant,
  onClearParticipant,
  scheduleDate,
  onScheduleDateChange,
  scheduleDuration,
  onScheduleDurationChange,
  scheduleNotes,
  onScheduleNotesChange,
  scheduling,
  onSchedule,
  minDatetime,
}: NewCallPanelProps) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
      <div style={{ padding: 16 }}>
        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, padding: 3, borderRadius: 8, background: "var(--admin-bg-hover)" }}>
          <button onClick={() => { onModeChange("call"); onClearParticipant(); }}
            style={{ flex: 1, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: mode === "call" ? "#065292" : "transparent", color: mode === "call" ? "#fff" : "var(--admin-font-tertiary)", transition: "all 0.15s" }}>
            <Video style={{ width: 14, height: 14, display: "inline", verticalAlign: -2, marginRight: 6 }} />
            Call Now
          </button>
          <button onClick={() => onModeChange("schedule")}
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
              <input placeholder={mode === "call" ? "Search by name or email to start a call..." : "Search for a student to schedule with..."}
                value={contactSearch} onChange={(e) => onContactSearchChange(e.target.value)} autoFocus
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {contactsLoading ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>Searching...</div>
              ) : contacts.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--admin-font-tertiary)" }}>No contacts found</div>
              ) : contacts.map((c) => (
                <button key={c.id}
                  onClick={() => mode === "call" ? onStartCall(c.id) : onSelectParticipant({ id: c.id, name: c.name })}
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

        {/* Schedule Form (after selecting participant) */}
        {mode === "schedule" && scheduleParticipant && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Selected participant */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600 }}>
                {getInitials(scheduleParticipant.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{scheduleParticipant.name}</div>
                <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Scheduling video call</div>
              </div>
              <button onClick={onClearParticipant}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-font-tertiary)", padding: 4 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Date/Time picker */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Date & Time</label>
              <input type="datetime-local" value={scheduleDate} onChange={(e) => onScheduleDateChange(e.target.value)} min={minDatetime}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Duration */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Duration</label>
              <select value={scheduleDuration} onChange={(e) => onScheduleDurationChange(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 4, display: "block" }}>Notes (optional)</label>
              <textarea value={scheduleNotes} onChange={(e) => onScheduleNotesChange(e.target.value)} placeholder="Agenda or topics to discuss..."
                rows={2} maxLength={500}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            {/* Submit */}
            <button onClick={onSchedule} disabled={!scheduleDate || scheduling}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", borderRadius: 10, border: "none", background: !scheduleDate ? "var(--admin-bg-hover)" : "#065292", color: !scheduleDate ? "var(--admin-font-tertiary)" : "#fff", cursor: !scheduleDate || scheduling ? "default" : "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>
              <CalendarClock style={{ width: 16, height: 16 }} />
              {scheduling ? "Scheduling..." : "Schedule Call"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
