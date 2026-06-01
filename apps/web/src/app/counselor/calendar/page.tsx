"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";

interface Session {
  id: string;
  studentName: string;
  startTime: string;
  endTime: string;
  status: string;
  topic: string;
  notes: string;
  counselorNotes: string;
}

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
  completed: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
  cancelled: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  rescheduled: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
};

export default function CounselorCalendarPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("/api/v1/counselor/me/sessions?limit=100");
        const data = res?.data?.data ?? res?.data ?? [];
        setSessions(data);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = new Date().toISOString().slice(0, 10);

  // Group sessions by date
  const sessionsByDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = new Date(s.startTime).toISOString().slice(0, 10);
    if (!sessionsByDate.has(key)) sessionsByDate.set(key, []);
    sessionsByDate.get(key)!.push(s);
  }

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
    catch { return ""; }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {[...Array(3)].map((_, i) => <div key={i} style={{ height: 80, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>Scheduling</span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>Session Calendar</h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          Monthly view of your counseling sessions
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        {/* Month navigation */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--admin-border-default)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--admin-font-light)" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {[...Array(firstDay)].map((_, i) => (
            <div key={`e${i}`} style={{ minHeight: 90, borderRight: "1px solid var(--admin-border-light)", borderBottom: "1px solid var(--admin-border-light)" }} />
          ))}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const daySessions = sessionsByDate.get(dateStr) || [];
            const isToday = dateStr === today;
            return (
              <div key={day} style={{
                minHeight: 90, padding: "4px 6px",
                borderRight: "1px solid var(--admin-border-light)",
                borderBottom: "1px solid var(--admin-border-light)",
                background: isToday ? "rgba(99,102,241,0.06)" : "transparent",
              }}>
                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#6366f1" : "var(--admin-font-secondary)", marginBottom: 2 }}>{day}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {daySessions.slice(0, 3).map((s) => {
                    const colors = STATUS_COLORS[s.status] || STATUS_COLORS.confirmed;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelected(s)}
                        style={{
                          fontSize: 9, padding: "2px 4px", borderRadius: 3,
                          background: colors.bg, color: colors.text,
                          fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", cursor: "pointer",
                        }}
                      >
                        {formatTime(s.startTime)} {s.studentName?.split(" ")[0] || "Session"}
                      </div>
                    );
                  })}
                  {daySessions.length > 3 && (
                    <div style={{ fontSize: 9, color: "var(--admin-font-light)" }}>+{daySessions.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "0 4px" }}>
        {[
          { label: "Confirmed", color: "#3b82f6" },
          { label: "Completed", color: "#22c55e" },
          { label: "Cancelled", color: "#ef4444" },
          { label: "Rescheduled", color: "#f59e0b" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Session Detail Overlay */}
      {selected && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSelected(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400, borderRadius: 12, background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CalendarDays style={{ width: 16, height: 16, color: "#6366f1" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Session Details</span>
              </div>
              <button onClick={() => setSelected(null)} style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
              </button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Student</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)" }}>{selected.studentName || "Unknown"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Time</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                  {formatTime(selected.startTime)} - {formatTime(selected.endTime)}
                </div>
                <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                  {new Date(selected.startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Topic</div>
                  <div style={{ fontSize: 13, color: "var(--admin-font-primary)" }}>{selected.topic || "No topic"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Status</div>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                    background: (STATUS_COLORS[selected.status] || STATUS_COLORS.confirmed).bg,
                    color: (STATUS_COLORS[selected.status] || STATUS_COLORS.confirmed).text,
                    textTransform: "capitalize",
                  }}>{selected.status}</span>
                </div>
              </div>
              {selected.notes && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Student Notes</div>
                  <div style={{ fontSize: 13, color: "var(--admin-font-secondary)", padding: "6px 8px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>{selected.notes}</div>
                </div>
              )}
              {selected.counselorNotes && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 2 }}>Your Notes</div>
                  <div style={{ fontSize: 13, color: "var(--admin-font-secondary)", padding: "6px 8px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>{selected.counselorNotes}</div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
