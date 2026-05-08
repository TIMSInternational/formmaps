"use client";

import { useState, useEffect } from "react";
import { CalendarIntegrationPanel } from "@/components/shared/CalendarIntegrationPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Save, Loader2, Plus, Trash2, Settings2, Globe } from "lucide-react";
import { toast } from "sonner";
import { getCounselorAvailability, updateCounselorAvailability } from "@/services/counselorSessionService";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"
];

function generateTimeOptions() {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = h.toString().padStart(2, "0");
      const mm = m.toString().padStart(2, "0");
      times.push(`${hh}:${mm}`);
    }
  }
  return times;
}
const TIME_OPTIONS = generateTimeOptions();

interface DaySchedule {
  day: string;
  enabled: boolean;
  timeSlots: { start: string; end: string }[];
}

export default function CounselorSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState("UTC");
  const [schedule, setSchedule] = useState<DaySchedule[]>(
    DAYS.map(d => ({ day: d, enabled: false, timeSlots: [{ start: "09:00", end: "17:00" }] }))
  );

  useEffect(() => {
    getCounselorAvailability()
      .then(data => {
        setTimezone(data.timezone || "UTC");
        if (data.weeklySchedule?.length) {
          setSchedule(
            DAYS.map(day => {
              const existing = data.weeklySchedule.find(
                (d: any) => d.day.toLowerCase() === day.toLowerCase()
              );
              return existing
                ? { day, enabled: existing.enabled, timeSlots: existing.timeSlots?.length ? existing.timeSlots : [{ start: "09:00", end: "17:00" }] }
                : { day, enabled: false, timeSlots: [{ start: "09:00", end: "17:00" }] };
            })
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (day: string) =>
    setSchedule(s => s.map(d => d.day === day ? { ...d, enabled: !d.enabled } : d));

  const addSlot = (day: string) =>
    setSchedule(s => s.map(d => d.day === day ? { ...d, timeSlots: [...d.timeSlots, { start: "09:00", end: "17:00" }] } : d));

  const removeSlot = (day: string, idx: number) =>
    setSchedule(s => s.map(d => d.day === day ? { ...d, timeSlots: d.timeSlots.filter((_, i) => i !== idx) } : d));

  const updateSlot = (day: string, idx: number, field: "start" | "end", value: string) =>
    setSchedule(s => s.map(d => d.day === day ? { ...d, timeSlots: d.timeSlots.map((ts, i) => i === idx ? { ...ts, [field]: value } : ts) } : d));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCounselorAvailability({ timezone, weeklySchedule: schedule });
      toast.success("Availability saved successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to save availability");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dash-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Settings2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              Counselor Settings
            </h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Manage integrations and availability
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-lg px-4 h-9 text-sm"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="space-y-4">
        {/* Calendar Integration */}
        <div className="dash-card p-4 md:p-5">
          <CalendarIntegrationPanel />
        </div>

        {/* Session Availability */}
        <div className="dash-card overflow-hidden">
          <div className="p-4 md:p-5 border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Session Availability</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Set weekly booking schedule.</p>
              </div>
            </div>
          </div>
          <div className="p-4 md:p-5 space-y-5">

            {/* Timezone */}
            <div className="flex items-center justify-between p-3 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] border border-[var(--border)] rounded-xl">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-500" />
                <Label className="text-sm font-medium text-foreground">Timezone</Label>
              </div>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-[180px] md:w-[240px] rounded-lg h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz} className="text-sm">
                      {tz.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <p className="text-xs text-muted-foreground">Loading schedule...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedule.map(({ day, enabled, timeSlots }) => (
                  <div
                    key={day}
                    className={`relative rounded-xl border transition-colors ${
                      enabled
                        ? "border-indigo-500/20 bg-indigo-500/5"
                        : "border-[var(--border)] bg-[var(--card)]"
                    }`}
                  >
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-3 w-32 shrink-0">
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => toggleDay(day)}
                          className="data-[state=checked]:bg-indigo-600 scale-90"
                        />
                        <span className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                          {day}
                        </span>
                      </div>

                      <div className="flex-1 flex flex-wrap items-center gap-2 min-h-[32px]">
                        {!enabled ? (
                          <span className="text-xs text-muted-foreground px-2 py-1 bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] rounded-md">
                            Unavailable
                          </span>
                        ) : (
                          <>
                            {timeSlots.map((ts, i) => (
                              <div key={i} className="flex items-center gap-1.5 dash-card p-1 group">
                                <Select value={ts.start} onValueChange={v => updateSlot(day, i, "start", v)}>
                                  <SelectTrigger className="w-[76px] h-7 border-0 bg-transparent shadow-none focus:ring-0 text-xs font-medium px-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[250px] min-w-[5rem]">
                                    {TIME_OPTIONS.map(t => <SelectItem key={`start-${t}`} value={t} className="text-xs py-1">{t}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <span className="text-muted-foreground text-xs">—</span>
                                <Select value={ts.end} onValueChange={v => updateSlot(day, i, "end", v)}>
                                  <SelectTrigger className="w-[76px] h-7 border-0 bg-transparent shadow-none focus:ring-0 text-xs font-medium px-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[250px] min-w-[5rem]">
                                    {TIME_OPTIONS.map(t => <SelectItem key={`end-${t}`} value={t} className="text-xs py-1">{t}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-6 w-6 rounded-md hover:bg-red-50 hover:text-red-500 ${timeSlots.length <= 1 ? "opacity-0 invisible" : "opacity-0 group-hover:opacity-100"}`}
                                  onClick={() => timeSlots.length > 1 && removeSlot(day, i)}
                                  disabled={timeSlots.length <= 1}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addSlot(day)}
                              className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 ml-1"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
