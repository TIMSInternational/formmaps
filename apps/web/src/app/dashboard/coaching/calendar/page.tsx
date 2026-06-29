"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, CalendarDays, X, Clock, User } from "lucide-react";
import { getCoachSessions } from "@/services/coachService";
import { Booking } from "@/types/coach";
import { formatTimeOfDay } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "rgba(6,82,146,0.12)", text: "#065292" },
  completed: { bg: "rgba(5,150,105,0.12)", text: "#059669" },
  cancelled: { bg: "rgba(220,38,38,0.12)", text: "#dc2626" },
  rescheduled: { bg: "rgba(217,119,6,0.12)", text: "#d97706" },
  pending_payment: { bg: "rgba(255,214,0,0.15)", text: "#92700c" },
};

export default function CoachCalendarPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCoachSessions("all");
        const data = res?.data ?? [];
        setSessions(Array.isArray(data) ? data : []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = new Date().toISOString().slice(0, 10);

  // Group sessions by date
  const sessionsByDate = new Map<string, Booking[]>();
  for (const s of sessions) {
    const time = s.startTime || s.slot?.start;
    if (!time) continue;
    const key = new Date(time).toISOString().slice(0, 10);
    if (!sessionsByDate.has(key)) sessionsByDate.set(key, []);
    sessionsByDate.get(key)!.push(s);
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const formatTime = formatTimeOfDay;

  const selectedSessions = selectedDay ? (sessionsByDate.get(selectedDay) || []) : [];

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ height: 80, borderRadius: 10, background: "var(--admin-bg-hover)", animation: "pulse 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>{t("coach:calendar.sectionLabel")}</span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>{t("coach:calendar.title")}</h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          {t("coach:calendar.subtitle")}
        </p>
      </motion.div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Calendar Grid */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ flex: 1, borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
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
            {[t("common:days.sun","Sun"), t("common:days.mon","Mon"), t("common:days.tue","Tue"), t("common:days.wed","Wed"), t("common:days.thu","Thu"), t("common:days.fri","Fri"), t("common:days.sat","Sat")].map(d => (
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
              const isSelected = dateStr === selectedDay;
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(dateStr)}
                  style={{
                    minHeight: 90, padding: "4px 6px", cursor: "pointer",
                    borderRight: "1px solid var(--admin-border-light)",
                    borderBottom: "1px solid var(--admin-border-light)",
                    background: isSelected ? "rgba(6,82,146,0.08)" : isToday ? "rgba(6,82,146,0.04)" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 400,
                    color: isToday ? "#065292" : "var(--admin-font-secondary)",
                    marginBottom: 2,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{
                      width: isToday ? 22 : "auto", height: isToday ? 22 : "auto",
                      borderRadius: isToday ? "50%" : 0,
                      background: isToday ? "#065292" : "transparent",
                      color: isToday ? "#fff" : "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11,
                    }}>{day}</span>
                    {daySessions.length > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "1px 5px",
                        borderRadius: 8, background: "#FFD600", color: "#111",
                      }}>{daySessions.length}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {daySessions.slice(0, 2).map((s) => {
                      const colors = STATUS_COLORS[s.status] || STATUS_COLORS.confirmed;
                      const time = s.startTime || s.slot?.start || "";
                      return (
                        <div
                          key={s.id}
                          style={{
                            fontSize: 9, padding: "2px 4px", borderRadius: 3,
                            background: colors.bg, color: colors.text,
                            fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatTime(time)} {s.studentName?.split(" ")[0] || s.topic || "Session"}
                        </div>
                      );
                    })}
                    {daySessions.length > 2 && (
                      <div style={{ fontSize: 9, color: "var(--admin-font-light)" }}>+{daySessions.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Sidebar: Selected day sessions */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            width: 300, flexShrink: 0, borderRadius: 12,
            border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", overflow: "hidden",
          }}
        >
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--admin-border-default)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <CalendarDays style={{ width: 16, height: 16, color: "#065292" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {selectedDay
                ? new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : t("coach:calendar.selectDay")}
            </span>
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto" }}>
            {!selectedDay && (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <CalendarDays style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{t("coach:calendar.clickDay")}</p>
              </div>
            )}
            {selectedDay && selectedSessions.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>{t("coach:calendar.noSessions")}</p>
              </div>
            )}
            {selectedSessions.map((s) => {
              const colors = STATUS_COLORS[s.status] || STATUS_COLORS.confirmed;
              const startTime = s.startTime || s.slot?.start || "";
              const endTime = s.endTime || s.slot?.end || "";
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: 12, borderRadius: 8,
                    border: "1px solid var(--admin-border-light)",
                    background: "var(--admin-bg-hover)",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <User style={{ width: 14, height: 14, color: "#065292" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                        {s.studentName || "Student"}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                      background: colors.bg, color: colors.text, textTransform: "capitalize",
                    }}>{s.status.replace("_", " ")}</span>
                  </div>
                  {s.topic && (
                    <div style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>{s.topic}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                    <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                      {startTime ? formatTime(startTime) : "TBD"}
                      {endTime ? ` - ${formatTime(endTime)}` : ""}
                    </span>
                  </div>
                  {s.notes && (
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", padding: "4px 6px", borderRadius: 4, background: "var(--admin-bg-card)" }}>
                      {s.notes}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "0 4px" }}>
        {[
          { label: t("coach:calendar.legend.confirmed"), color: "#065292" },
          { label: t("coach:calendar.legend.completed"), color: "#059669" },
          { label: t("coach:calendar.legend.cancelled"), color: "#dc2626" },
          { label: t("coach:calendar.legend.rescheduled"), color: "#d97706" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
