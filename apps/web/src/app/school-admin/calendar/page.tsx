"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Star, BookOpen, Clock, PartyPopper, Trash2, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";

interface AcademicYear {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean;
  terms: { id: string; name: string; startDate: string; endDate: string; sortOrder: number }[];
}
interface Holiday { id: string; name: string; date: string; type: string; }
interface AssessmentPeriod { id: string; assessmentType: string; gradeLevel: number; startDate: string; endDate: string; }

function formatDate(d: string) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatShort(d: string) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TYPE_COLORS: Record<string, string> = { holiday: "#ef4444", break: "#f59e0b", professional_development: "#3b82f6", exam: "#8b5cf6", event: "#10b981" };

export default function AcademicCalendarPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [assessments, setAssessments] = useState<AssessmentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [refreshKey, setRefreshKey] = useState(0);

  // Holiday form
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState("holiday");
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Assessment form
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [assessmentType, setAssessmentType] = useState("PCA");
  const [assessmentGrade, setAssessmentGrade] = useState("9");
  const [assessmentStart, setAssessmentStart] = useState("");
  const [assessmentEnd, setAssessmentEnd] = useState("");
  const [savingAssessment, setSavingAssessment] = useState(false);

  // Quick-add from calendar click
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddType, setQuickAddType] = useState("holiday");

  useEffect(() => {
    (async () => {
      try {
        const [yRes, hRes, aRes] = await Promise.all([
          apiRequest("/api/v1/school-admin/calendar/academic-years"),
          apiRequest("/api/v1/school-admin/calendar/holidays"),
          apiRequest("/api/v1/school-admin/calendar/assessment-periods"),
        ]);
        setYears(yRes?.data?.data ?? yRes?.data ?? []);
        setHolidays(hRes?.data?.data ?? hRes?.data ?? []);
        setAssessments(aRes?.data?.data ?? aRes?.data ?? []);
      } catch {}
      setLoading(false);
    })();
  }, [refreshKey]);

  const refetch = () => setRefreshKey(k => k + 1);

  const handleAddHoliday = async (name: string, date: string, type: string) => {
    if (!name || !date) return;
    setSavingHoliday(true);
    try {
      await apiRequest("/api/v1/school-admin/calendar/holidays", { method: "POST", data: { holidays: [{ name, date, type }] } });
      toast.success("Holiday added");
      setHolidayName(""); setHolidayDate(""); setHolidayType("holiday");
      setShowHolidayForm(false);
      setQuickAddDate(null); setQuickAddName(""); setQuickAddType("holiday");
      refetch();
    } catch { toast.error("Failed to add holiday"); }
    setSavingHoliday(false);
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await apiRequest(`/api/v1/school-admin/calendar/holidays/${id}`, { method: "DELETE" });
      toast.success("Holiday deleted");
      refetch();
    } catch { toast.error("Failed to delete holiday"); }
  };

  const handleAddAssessment = async () => {
    if (!assessmentStart || !assessmentEnd) return;
    setSavingAssessment(true);
    try {
      await apiRequest("/api/v1/school-admin/calendar/assessment-periods", { method: "POST", data: { assessmentType, gradeLevel: parseInt(assessmentGrade), startDate: assessmentStart, endDate: assessmentEnd } });
      toast.success("Assessment window added");
      setAssessmentType("PCA"); setAssessmentGrade("9"); setAssessmentStart(""); setAssessmentEnd("");
      setShowAssessmentForm(false);
      refetch();
    } catch { toast.error("Failed to add assessment window"); }
    setSavingAssessment(false);
  };

  const handleDeleteAssessment = async (id: string) => {
    try {
      await apiRequest(`/api/v1/school-admin/calendar/assessment-periods/${id}`, { method: "DELETE" });
      toast.success("Assessment window deleted");
      refetch();
    } catch { toast.error("Failed to delete assessment window"); }
  };

  const currentYear = years.find(y => y.isCurrent);
  const allTerms = currentYear?.terms ?? [];

  const dayEvents = new Map<string, { label: string; color: string }[]>();
  for (const h of holidays) {
    const key = new Date(h.date).toISOString().slice(0, 10);
    if (!dayEvents.has(key)) dayEvents.set(key, []);
    dayEvents.get(key)!.push({ label: h.name, color: TYPE_COLORS[h.type] || "#ef4444" });
  }
  for (const t of allTerms) {
    for (const d of [{ date: t.startDate, label: `${t.name} starts` }, { date: t.endDate, label: `${t.name} ends` }]) {
      const key = new Date(d.date).toISOString().slice(0, 10);
      if (!dayEvents.has(key)) dayEvents.set(key, []);
      dayEvents.get(key)!.push({ label: d.label, color: "#6366f1" });
    }
  }
  for (const a of assessments) {
    const key = new Date(a.startDate).toISOString().slice(0, 10);
    if (!dayEvents.has(key)) dayEvents.set(key, []);
    dayEvents.get(key)!.push({ label: `${a.assessmentType} Gr${a.gradeLevel}`, color: "#8b5cf6" });
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = new Date().toISOString().slice(0, 10);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

  if (loading) return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 80, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>Academics</span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>Academic Calendar</h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          {currentYear ? `${currentYear.name} — ${formatDate(currentYear.startDate)} to ${formatDate(currentYear.endDate)}` : "No academic year configured"}
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Academic Year", value: currentYear?.name || "—", icon: Star, color: "#6366f1" },
          { label: "Terms", value: allTerms.length.toString(), icon: BookOpen, color: "#10b981" },
          { label: "Holidays", value: holidays.length.toString(), icon: PartyPopper, color: "#ef4444" },
          { label: "Assessment Windows", value: assessments.length.toString(), icon: Clock, color: "#8b5cf6" },
        ].map((s) => (
          <div key={s.label} style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16 }}>
            <s.icon style={{ width: 16, height: 16, color: s.color, marginBottom: 8 }} />
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Calendar Grid */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--admin-border-default)" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--admin-font-light)" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {[...Array(firstDay)].map((_, i) => <div key={`e${i}`} style={{ minHeight: 72, borderRight: "1px solid var(--admin-border-light)", borderBottom: "1px solid var(--admin-border-light)" }} />)}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const events = dayEvents.get(dateStr) || [];
              const isToday = dateStr === today;
              const isQuickAdd = quickAddDate === dateStr;
              return (
                <div key={day}
                  onClick={() => { if (!isQuickAdd && events.length === 0) { setQuickAddDate(dateStr); setQuickAddName(""); setQuickAddType("holiday"); } }}
                  style={{ minHeight: 72, padding: "4px 6px", borderRight: "1px solid var(--admin-border-light)", borderBottom: "1px solid var(--admin-border-light)", background: isQuickAdd ? "rgba(99,102,241,0.10)" : isToday ? "rgba(99,102,241,0.06)" : "transparent", cursor: events.length === 0 && !isQuickAdd ? "pointer" : "default", position: "relative" }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#6366f1" : "var(--admin-font-secondary)", marginBottom: 2 }}>{day}</div>
                  {isQuickAdd ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={e => e.stopPropagation()}>
                      <input value={quickAddName} onChange={e => setQuickAddName(e.target.value)} placeholder="Name" style={{ fontSize: 10, padding: "2px 4px", borderRadius: 3, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", width: "100%", outline: "none" }} />
                      <select value={quickAddType} onChange={e => setQuickAddType(e.target.value)} style={{ fontSize: 9, padding: "1px 2px", borderRadius: 3, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)" }}>
                        {["holiday","break","professional_development","exam","event"].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => handleAddHoliday(quickAddName, dateStr, quickAddType)} disabled={!quickAddName || savingHoliday} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", opacity: !quickAddName ? 0.5 : 1 }}>Add</button>
                        <button onClick={() => setQuickAddDate(null)} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)", cursor: "pointer" }}>
                          <X style={{ width: 8, height: 8 }} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {events.slice(0, 2).map((e, j) => (
                        <div key={j} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, marginBottom: 1, background: `${e.color}15`, color: e.color, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                      ))}
                      {events.length > 2 && <div style={{ fontSize: 9, color: "var(--admin-font-light)" }}>+{events.length - 2}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Sidebar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 6 }}>
              <BookOpen style={{ width: 13, height: 13, color: "#6366f1" }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Terms</span>
            </div>
            <div style={{ padding: 8 }}>
              {allTerms.length === 0 ? <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No terms configured</div> : allTerms.map(t => (
                <div key={t.id} style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 4, border: "1px solid var(--admin-border-default)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{formatShort(t.startDate)} — {formatShort(t.endDate)}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PartyPopper style={{ width: 13, height: 13, color: "#ef4444" }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Holidays & Breaks</span>
              </div>
              <button onClick={() => setShowHolidayForm(!showHolidayForm)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showHolidayForm ? <X style={{ width: 11, height: 11, color: "var(--admin-font-tertiary)" }} /> : <Plus style={{ width: 11, height: 11, color: "var(--admin-font-tertiary)" }} />}
              </button>
            </div>
            {showHolidayForm && (
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={holidayName} onChange={e => setHolidayName(e.target.value)} placeholder="Holiday name" style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none" }} />
                <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none" }} />
                <select value={holidayType} onChange={e => setHolidayType(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none" }}>
                  {["holiday","break","professional_development","exam","event"].map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
                <button onClick={() => handleAddHoliday(holidayName, holidayDate, holidayType)} disabled={!holidayName || !holidayDate || savingHoliday} style={{ fontSize: 12, fontWeight: 600, padding: "5px 0", borderRadius: 5, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", opacity: (!holidayName || !holidayDate || savingHoliday) ? 0.5 : 1 }}>
                  {savingHoliday ? "Adding..." : "Add Holiday"}
                </button>
              </div>
            )}
            <div style={{ padding: 8, maxHeight: 200, overflowY: "auto" }}>
              {holidays.length === 0 ? <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No holidays added</div> : holidays.map(h => (
                <div key={h.id} className="group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 4, marginBottom: 2, position: "relative" }}>
                  <div><div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{h.name}</div><div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{formatShort(h.date)}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${TYPE_COLORS[h.type] || "#6b7280"}15`, color: TYPE_COLORS[h.type] || "#6b7280", fontWeight: 600, textTransform: "capitalize" }}>{h.type}</span>
                    <button onClick={() => handleDeleteHoliday(h.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: 18, height: 18, borderRadius: 3, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 style={{ width: 11, height: 11, color: "#ef4444" }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Clock style={{ width: 13, height: 13, color: "#8b5cf6" }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Assessment Windows</span>
              </div>
              <button onClick={() => setShowAssessmentForm(!showAssessmentForm)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showAssessmentForm ? <X style={{ width: 11, height: 11, color: "var(--admin-font-tertiary)" }} /> : <Plus style={{ width: 11, height: 11, color: "var(--admin-font-tertiary)" }} />}
              </button>
            </div>
            {showAssessmentForm && (
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", flexDirection: "column", gap: 6 }}>
                <select value={assessmentType} onChange={e => setAssessmentType(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none" }}>
                  {["PCA","MIL","360"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={assessmentGrade} onChange={e => setAssessmentGrade(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none" }}>
                  {["9","10","11","12"].map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="date" value={assessmentStart} onChange={e => setAssessmentStart(e.target.value)} placeholder="Start" style={{ fontSize: 11, padding: "5px 6px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none", flex: 1 }} />
                  <input type="date" value={assessmentEnd} onChange={e => setAssessmentEnd(e.target.value)} placeholder="End" style={{ fontSize: 11, padding: "5px 6px", borderRadius: 5, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", outline: "none", flex: 1 }} />
                </div>
                <button onClick={handleAddAssessment} disabled={!assessmentStart || !assessmentEnd || savingAssessment} style={{ fontSize: 12, fontWeight: 600, padding: "5px 0", borderRadius: 5, border: "none", background: "#8b5cf6", color: "#fff", cursor: "pointer", opacity: (!assessmentStart || !assessmentEnd || savingAssessment) ? 0.5 : 1 }}>
                  {savingAssessment ? "Adding..." : "Add Window"}
                </button>
              </div>
            )}
            <div style={{ padding: 8, maxHeight: 200, overflowY: "auto" }}>
              {assessments.length === 0 ? <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No assessment windows</div> : assessments.map(a => (
                <div key={a.id} className="group" style={{ padding: "6px 10px", borderRadius: 4, marginBottom: 2, border: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>{a.assessmentType} — Grade {a.gradeLevel}</div>
                    <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{formatShort(a.startDate)} — {formatShort(a.endDate)}</div>
                  </div>
                  <button onClick={() => handleDeleteAssessment(a.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: 18, height: 18, borderRadius: 3, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 style={{ width: 11, height: 11, color: "#ef4444" }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
