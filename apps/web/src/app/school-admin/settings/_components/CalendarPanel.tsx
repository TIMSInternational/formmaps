"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Trash2, CalendarDays, BookOpenCheck, SunMedium, Calendar, Sparkles, Clock, Save } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import {
  useAcademicYears, useCreateAcademicYear, useDeleteAcademicYear,
  useAssessmentPeriods, useCreateAssessmentPeriod, useDeleteAssessmentPeriod,
  useHolidays, useCreateHolidays, useDeleteHoliday,
} from "@/hooks/useCalendarQueries";
import type { AcademicYearPayload, AssessmentPeriodPayload, AssessmentType } from "@/types/calendar";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { Skeleton } from "@/components/ui/skeleton";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
};

function SectionCard({ icon: Icon, title, subtitle, color, action, children }: {
  icon: any; title: string; subtitle: string; color: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon style={{ width: 16, height: 16, color }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{title}</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{subtitle}</div>
          </div>
        </div>
        {action}
      </div>
      <div style={{ padding: 16, flex: 1 }}>{children}</div>
    </div>
  );
}

export default function CalendarPanel() {
  const { t } = useTranslation("school_admin");
  const { data: years, isLoading: yearsLoading } = useAcademicYears();
  const { data: periods } = useAssessmentPeriods();
  const { data: holidays } = useHolidays();
  const createYear = useCreateAcademicYear();
  const deleteYear = useDeleteAcademicYear();
  const createPeriod = useCreateAssessmentPeriod();
  const deletePeriod = useDeleteAssessmentPeriod();
  const createHoliday = useCreateHolidays();
  const deleteHolidayMut = useDeleteHoliday();

  const [yearOpen, setYearOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [yearForm, setYearForm] = useState<AcademicYearPayload>({ name: "", startDate: "", endDate: "", terms: [{ name: "Semester 1", startDate: "", endDate: "" }] });
  const [periodForm, setPeriodForm] = useState<AssessmentPeriodPayload>({ name: "", termId: "", startDate: "", endDate: "", assessmentTypes: ["MIL"] });
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState<"national" | "school" | "custom">("school");

  const handleCreateYear = () => {
    if (!yearForm.name || !yearForm.startDate || !yearForm.endDate) { toast.error(t("settings.calendarPanel.fillAllFields")); return; }
    createYear.mutate({ ...yearForm, terms: [{ name: "Semester 1", startDate: yearForm.startDate, endDate: yearForm.endDate }] }, {
      onSuccess: () => { toast.success(t("settings.calendarPanel.yearCreated")); setYearOpen(false); },
      onError: () => toast.error(t("settings.calendarPanel.failed")),
    });
  };
  const handleCreatePeriod = () => {
    if (!periodForm.name || !periodForm.startDate || !periodForm.endDate || !periodForm.termId) { toast.error(t("settings.calendarPanel.fillAllFields")); return; }
    createPeriod.mutate(periodForm, { onSuccess: () => { toast.success(t("settings.calendarPanel.periodCreated")); setPeriodOpen(false); }, onError: () => toast.error(t("settings.calendarPanel.failed")) });
  };
  const handleCreateHoliday = () => {
    if (!holidayName || !holidayDate) { toast.error(t("settings.calendarPanel.fillNameDate")); return; }
    createHoliday.mutate({ holidays: [{ name: holidayName, date: holidayDate, type: holidayType }] }, {
      onSuccess: () => { toast.success(t("settings.calendarPanel.holidayAdded")); setHolidayOpen(false); setHolidayName(""); setHolidayDate(""); },
      onError: () => toast.error(t("settings.calendarPanel.failed")),
    });
  };

  // Course request deadline
  const queryClient = useQueryClient();
  const { data: deadlineData } = useQuery({
    queryKey: ["course-request-deadline"],
    queryFn: async () => { const res = await apiRequest("/api/v1/school-admin/course-request-deadline"); return res?.data ?? res; },
    staleTime: 1000 * 60 * 10,
  });
  const [deadlineValue, setDeadlineValue] = useState("");
  const [deadlineInit, setDeadlineInit] = useState(false);
  if (deadlineData?.deadline && !deadlineInit) {
    setDeadlineValue(new Date(deadlineData.deadline).toISOString().slice(0, 10));
    setDeadlineInit(true);
  }
  const saveDeadline = useMutation({
    mutationFn: async (deadline: string | null) => apiRequest("/api/v1/school-admin/course-request-deadline", { method: "PUT", data: { deadline } }),
    onSuccess: () => { toast.success(t("settings.calendarPanel.deadlineSaved")); queryClient.invalidateQueries({ queryKey: ["course-request-deadline"] }); },
    onError: () => toast.error(t("settings.calendarPanel.deadlineFailed")),
  });

  const safeYears = Array.isArray(years) ? years : [];
  const safePeriods = Array.isArray(periods) ? periods : [];
  const safeHolidays = Array.isArray(holidays) ? holidays : [];

  if (yearsLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} /><Skeleton className="h-[300px]" style={{ background: "var(--admin-bg-hover)" }} /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>{t("settings.calendarPanel.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{t("settings.calendarPanel.subtitle")}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label={t("settings.calendarPanel.stats.academicYears")} value={String(safeYears.length)} icon={CalendarDays} sub={t("settings.calendarPanel.stats.academicYearsSub")} trend={0} />
        <AdminStatCard label={t("settings.calendarPanel.stats.assessmentWindows")} value={String(safePeriods.length)} icon={BookOpenCheck} sub={t("settings.calendarPanel.stats.assessmentWindowsSub")} trend={0} />
        <AdminStatCard label={t("settings.calendarPanel.stats.holidays")} value={String(safeHolidays.length)} icon={SunMedium} sub={t("settings.calendarPanel.stats.holidaysSub")} trend={0} />
      </div>

      {/* Course Request Deadline */}
      <SectionCard icon={Clock} title={t("settings.calendarPanel.deadline.title")} subtitle={t("settings.calendarPanel.deadline.subtitle")} color="#ef4444">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 6, display: "block" }}>{t("settings.calendarPanel.deadline.deadlineDate")}</Label>
            <Input type="date" style={inputStyle} value={deadlineValue} onChange={(e) => setDeadlineValue(e.target.value)} />
          </div>
          <button onClick={() => saveDeadline.mutate(deadlineValue || null)} disabled={saveDeadline.isPending} style={{
            height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: "#ef4444", color: "#fff", border: "none", cursor: "pointer",
            opacity: saveDeadline.isPending ? 0.6 : 1,
          }}>
            {saveDeadline.isPending ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
            {t("settings.calendarPanel.deadline.setDeadline")}
          </button>
          {deadlineData?.deadline && (
            <button onClick={() => { setDeadlineValue(""); saveDeadline.mutate(null); }} style={{
              height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 500,
              background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)", cursor: "pointer",
            }}>{t("settings.calendarPanel.deadline.clear")}</button>
          )}
        </div>
        {deadlineData?.deadline && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
            <Clock style={{ width: 12, height: 12, color: "#ef4444" }} />
            {t("settings.calendarPanel.deadline.current")} <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{new Date(deadlineData.deadline).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
            {new Date(deadlineData.deadline) < new Date() && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{t("settings.calendarPanel.deadline.expired")}</span>}
          </div>
        )}
      </SectionCard>

      {/* Academic Years */}
      <SectionCard icon={CalendarDays} title={t("settings.calendarPanel.years.title")} subtitle={t("settings.calendarPanel.years.subtitle")} color="#14b8a6"
        action={
          <Dialog open={yearOpen} onOpenChange={setYearOpen}>
            <DialogTrigger asChild>
              <button style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer" }}><Plus style={{ width: 14, height: 14 }} /></button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>{t("settings.calendarPanel.years.createTitle")}</DialogTitle><DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.years.createSubtitle")}</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.years.name")}</Label><Input style={inputStyle} value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} placeholder="2025-2026" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.years.start")}</Label><Input type="date" style={inputStyle} value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} /></div>
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.years.end")}</Label><Input type="date" style={inputStyle} value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setYearOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>{t("settings.calendarPanel.years.cancel")}</Button>
                <button onClick={handleCreateYear} disabled={createYear.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#14b8a6", color: "#fff", border: "none", cursor: "pointer" }}>
                  {createYear.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : t("settings.calendarPanel.years.create")}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {safeYears.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--admin-font-tertiary)" }}>
            <CalendarDays style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.calendarPanel.years.empty")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {safeYears.map((y) => (
              <div key={y.id} style={{ padding: 14, borderRadius: 8, background: "var(--admin-bg-hover)", border: y.isCurrent ? "1px solid #14b8a6" : "1px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{y.name}</span>
                      {y.isCurrent && <Badge className="text-xs" style={{ background: "rgba(20,184,166,0.15)", color: "#14b8a6", border: "none", fontSize: 10 }}><Sparkles className="w-3 h-3 mr-1" />{t("settings.calendarPanel.years.active")}</Badge>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--admin-font-light)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      <Calendar style={{ width: 12, height: 12 }} />
                      {new Date(y.startDate).toLocaleDateString()} — {new Date(y.endDate).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={() => deleteYear.mutate(y.id, { onSuccess: () => toast.success(t("settings.calendarPanel.deleted")) })} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-light)", cursor: "pointer" }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
                {y.terms?.length > 0 && y.terms.map((term: any) => (
                  <div key={term.id} style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "var(--admin-bg-card)", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--admin-font-secondary)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#06b6d4" }} />{term.name}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{new Date(term.startDate).toLocaleDateString()} — {new Date(term.endDate).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assessment Periods */}
        <SectionCard icon={BookOpenCheck} title={t("settings.calendarPanel.periods.title")} subtitle={t("settings.calendarPanel.periods.subtitle")} color="#8b5cf6"
          action={
            <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
              <DialogTrigger asChild><button style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer" }}><Plus style={{ width: 14, height: 14 }} /></button></DialogTrigger>
              <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
                <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>{t("settings.calendarPanel.periods.createTitle")}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.periods.name")}</Label><Input style={inputStyle} value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t("settings.calendarPanel.periods.namePlaceholder")} /></div>
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.periods.type")}</Label>
                    <Select value={periodForm.assessmentTypes[0]} onValueChange={(v) => setPeriodForm({ ...periodForm, assessmentTypes: [v as AssessmentType] })}>
                      <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="MIL">MIL</SelectItem><SelectItem value="PCA">PCA</SelectItem><SelectItem value="360">360°</SelectItem><SelectItem value="TIMS">TIMS</SelectItem></SelectContent>
                    </Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.periods.start")}</Label><Input type="date" style={inputStyle} value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.periods.end")}</Label><Input type="date" style={inputStyle} value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} /></div>
                  </div>
                  {safeYears.length > 0 && <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.periods.term")}</Label>
                    <Select value={periodForm.termId} onValueChange={(v) => setPeriodForm({ ...periodForm, termId: v })}>
                      <SelectTrigger style={inputStyle}><SelectValue placeholder={t("settings.calendarPanel.periods.selectTerm")} /></SelectTrigger>
                      <SelectContent>{safeYears.flatMap(y => y.terms || []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select></div>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPeriodOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>{t("settings.calendarPanel.periods.cancel")}</Button>
                  <button onClick={handleCreatePeriod} disabled={createPeriod.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer" }}>{createPeriod.isPending ? "..." : t("settings.calendarPanel.periods.create")}</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        >
          {safePeriods.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--admin-font-tertiary)" }}>
              <BookOpenCheck style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} /><div style={{ fontSize: 13 }}>{t("settings.calendarPanel.periods.empty")}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {safePeriods.map((p) => (
                <div key={p.id} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      {p.assessmentTypes?.map((at: string) => <Badge key={at} className="text-xs" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6", border: "none", fontSize: 10 }}>{at}</Badge>)}
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-light)", display: "flex", gap: 8 }}>
                      <span>{new Date(p.startDate).toLocaleDateString()}</span><span style={{ color: "var(--admin-font-tertiary)" }}>{"\u2192"}</span><span>{new Date(p.endDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={() => deletePeriod.mutate(p.id, { onSuccess: () => toast.success(t("settings.calendarPanel.deleted")) })} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-light)", cursor: "pointer" }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Holidays */}
        <SectionCard icon={SunMedium} title={t("settings.calendarPanel.holidays.title")} subtitle={t("settings.calendarPanel.holidays.subtitle")} color="#f59e0b"
          action={
            <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
              <DialogTrigger asChild><button style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "#f59e0b", color: "#fff", border: "none", cursor: "pointer" }}><Plus style={{ width: 14, height: 14 }} /></button></DialogTrigger>
              <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
                <DialogHeader><DialogTitle style={{ color: "var(--admin-font-primary)" }}>{t("settings.calendarPanel.holidays.createTitle")}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.holidays.name")}</Label><Input style={inputStyle} value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder={t("settings.calendarPanel.holidays.namePlaceholder")} /></div>
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.holidays.date")}</Label><Input type="date" style={inputStyle} value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} /></div>
                  <div className="space-y-2"><Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("settings.calendarPanel.holidays.type")}</Label>
                    <Select value={holidayType} onValueChange={(v) => setHolidayType(v as any)}>
                      <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="national">{t("settings.calendarPanel.holidays.national")}</SelectItem><SelectItem value="school">{t("settings.calendarPanel.holidays.school")}</SelectItem><SelectItem value="custom">{t("settings.calendarPanel.holidays.custom")}</SelectItem></SelectContent>
                    </Select></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setHolidayOpen(false)} style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>{t("settings.calendarPanel.holidays.cancel")}</Button>
                  <button onClick={handleCreateHoliday} disabled={createHoliday.isPending} style={{ height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600, background: "#f59e0b", color: "#fff", border: "none", cursor: "pointer" }}>{createHoliday.isPending ? "..." : t("settings.calendarPanel.holidays.add")}</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        >
          {safeHolidays.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--admin-font-tertiary)" }}>
              <SunMedium style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} /><div style={{ fontSize: 13 }}>{t("settings.calendarPanel.holidays.empty")}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {safeHolidays.map((h) => (
                <div key={h.id} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: h.type === "national" ? "#ef4444" : h.type === "school" ? "#065292" : "#10b981" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{h.name}</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{new Date(h.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
                    </div>
                  </div>
                  <button onClick={() => deleteHolidayMut.mutate(h.id, { onSuccess: () => toast.success(t("settings.calendarPanel.removed")) })} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-light)", cursor: "pointer" }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
