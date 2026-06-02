"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api/apiClient";
import { TrackedApplication } from "@/services/applicationService";
import { DeadlineDetailPanel } from "./_components/DeadlineDetailPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DOT_COLORS = [
  { dot: "var(--admin-accent-blue)", bg: "rgba(59,130,246,0.12)", text: "var(--admin-accent-blue)" },
  { dot: "var(--admin-accent-purple)", bg: "rgba(139,92,246,0.12)", text: "var(--admin-accent-purple)" },
  { dot: "var(--admin-accent-amber)", bg: "rgba(245,158,11,0.12)", text: "var(--admin-accent-amber)" },
  { dot: "var(--admin-accent-green)", bg: "rgba(16,185,129,0.12)", text: "var(--admin-accent-green)" },
  { dot: "#ec4899", bg: "rgba(236,72,153,0.12)", text: "#ec4899" },
  { dot: "#14b8a6", bg: "rgba(20,184,166,0.12)", text: "#14b8a6" },
];

function parseDeadlineDate(deadline: string): Date | null {
  const d = new Date(deadline);
  return isNaN(d.getTime()) ? null : d;
}

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApplicationsCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const res = await apiRequest<{ data: TrackedApplication[] }>("/api/v1/student/applications", { method: "GET" });
        const list: TrackedApplication[] = res?.data ?? [];
        setApplications(list);
      } catch {
        toast.error("Failed to load applications");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const deadlineMap = useMemo(() => {
    const map = new Map<string, TrackedApplication[]>();
    applications.forEach((app) => {
      if (!app.deadline) return;
      const d = parseDeadlineDate(app.deadline);
      if (!d) return;
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(app);
    });
    return map;
  }, [applications]);

  const appColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    applications.forEach((app, i) => map.set(app.id, i % DOT_COLORS.length));
    return map;
  }, [applications]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(null);
  }

  const cells = useMemo(() => buildCalendarDays(year, month), [year, month]);
  const selectedApps = selectedDay ? (deadlineMap.get(selectedDay) ?? []) : [];

  const monthDeadlineCount = useMemo(() => {
    let count = 0;
    deadlineMap.forEach((apps, key) => {
      const [y, m] = key.split("-").map(Number);
      if (y === year && m - 1 === month) count += apps.length;
    });
    return count;
  }, [deadlineMap, year, month]);

  return (
    <div className="space-y-5 max-w-5xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Application Tracker</span>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">Deadline Calendar</h1>
        <p className="max-w-2xl text-base text-muted-foreground">All your application deadlines at a glance.</p>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-4">
          {/* Calendar card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border-light)" }}>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold" style={{ color: "var(--admin-font-primary)" }}>{MONTH_NAMES[month]} {year}</h2>
                {monthDeadlineCount > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" }}>
                    {monthDeadlineCount} deadline{monthDeadlineCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ color: "var(--admin-font-secondary)", border: "1px solid var(--admin-border-default)" }}>Today</button>
                <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Day names row */}
            <div className="grid grid-cols-7 px-3 pt-3 pb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider pb-2" style={{ color: "var(--admin-font-tertiary)" }}>{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px px-3 pb-4" style={{ background: "var(--admin-border-light)" }}>
              {cells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="min-h-[72px] rounded-lg" style={{ background: "var(--admin-bg-card)" }} />;
                const key = dayKey(day);
                const dayApps = deadlineMap.get(key) ?? [];
                const hasDeadlines = dayApps.length > 0;
                const isSelected = selectedDay === key;
                const todayDay = isToday(day);
                return (
                  <div key={key} onClick={() => setSelectedDay(isSelected ? null : key)} onMouseEnter={() => setHoveredDay(key)} onMouseLeave={() => setHoveredDay(null)}
                    className="relative min-h-[72px] rounded-lg p-1.5 cursor-pointer flex flex-col gap-1 transition-all"
                    style={{ background: isSelected || hoveredDay === key ? "var(--admin-bg-hover)" : "var(--admin-bg-card)", border: isSelected ? "1.5px solid var(--admin-accent-blue)" : todayDay ? "1.5px solid rgba(59,130,246,0.4)" : "1px solid transparent" }}>
                    <span className={cn("text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full", todayDay && "text-white")}
                      style={{ background: todayDay ? "var(--admin-accent-blue)" : "transparent", color: todayDay ? "white" : hasDeadlines ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)" }}>
                      {day.getDate()}
                    </span>
                    {hasDeadlines && (
                      <div className="flex flex-col gap-0.5 flex-1">
                        {dayApps.slice(0, 2).map((app) => {
                          const ci = appColorIndex.get(app.id) ?? 0;
                          const color = DOT_COLORS[ci];
                          return (
                            <div key={app.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium leading-tight truncate" style={{ background: color.bg, color: color.text }}>
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color.dot }} />
                              <span className="truncate">{app.name}</span>
                            </div>
                          );
                        })}
                        {dayApps.length > 2 && <span className="text-[9px] font-semibold px-1" style={{ color: "var(--admin-font-tertiary)" }}>+{dayApps.length - 2} more</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day detail panel */}
          <AnimatePresence>
            {selectedDay && selectedApps.length > 0 && (
              <DeadlineDetailPanel
                selectedDay={selectedDay}
                selectedApps={selectedApps}
                appColorIndex={appColorIndex}
                dotColors={DOT_COLORS}
                onClose={() => setSelectedDay(null)}
              />
            )}
          </AnimatePresence>

          {/* Legend */}
          {applications.filter((a) => a.deadline).length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: "var(--admin-font-tertiary)" }}>Applications with Deadlines</p>
              <div className="flex flex-wrap gap-2">
                {applications.filter((a) => a.deadline).map((app) => {
                  const ci = appColorIndex.get(app.id) ?? 0;
                  const color = DOT_COLORS[ci];
                  return (
                    <div key={app.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: color.bg, color: color.text }}>
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color.dot }} />
                      {app.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {applications.filter((a) => a.deadline).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl" style={{ border: "1px dashed var(--admin-border-default)" }}>
              <Calendar className="h-10 w-10" style={{ color: "var(--admin-font-light)" }} />
              <p className="text-xs text-center max-w-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                No deadlines found. Add deadlines to your applications in the tracker to see them here.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
