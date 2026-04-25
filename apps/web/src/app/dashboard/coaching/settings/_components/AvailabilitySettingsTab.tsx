"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Trash2, Globe, Calendar, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Badge } from "@/components/ui/badge";

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  day: string;
  enabled: boolean;
  timeSlots: TimeSlot[];
}

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((day) => ({
  day,
  enabled: ["Saturday", "Sunday"].includes(day) ? false : true,
  timeSlots: [{ start: "09:00", end: "17:00" }],
}));

interface AvailabilitySettingsTabProps {
  availability?: any | null;
  isLoading?: boolean;
  onUpdated?: (newData: any) => void;
}

export function AvailabilitySettingsTab({
  availability: parentAvailability,
  isLoading: parentLoading,
  onUpdated,
}: AvailabilitySettingsTabProps) {
  const { user } = useGlobalStore();
  const [timezone, setTimezone] = useState("UTC");
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [calendarConnection, setCalendarConnection] = useState<{
    connected: boolean;
    provider: "google" | "outlook" | null;
    email?: string;
  }>({ connected: false, provider: null });
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);

  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        if (parentAvailability) {
          // Use parent-provided availability
          const data = parentAvailability;
          if (data) {
            if (data.timezone) setTimezone(data.timezone);
            if (data.weeklySchedule && data.weeklySchedule.length > 0) {
              const mergedSchedule = DEFAULT_SCHEDULE.map((defaultDay) => {
                const found = data.weeklySchedule.find(
                  (d: any) => d.day === defaultDay.day,
                );
                return found || defaultDay;
              });
              setSchedule(mergedSchedule);
            }
          }
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        const { getAvailability } = await import("@/services/coachService");
        const data = await getAvailability();

        if (data) {
          if (data.timezone) setTimezone(data.timezone);
          if (data.weeklySchedule && data.weeklySchedule.length > 0) {
            // Merge with default to ensure all days exist
            const mergedSchedule = DEFAULT_SCHEDULE.map((defaultDay) => {
              const found = data.weeklySchedule.find(
                (d) => d.day === defaultDay.day,
              );
              return found || defaultDay;
            });
            setSchedule(mergedSchedule);
          }
        }
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };

    const checkCalendarStatus = async () => {
      if (!user?.email) return;
      try {
        const { checkCalendarAuthStatus } =
          await import("@/services/coachService");
        // Check Google
        const googleStatus = await checkCalendarAuthStatus(
          "google",
          user.email,
        ).catch(() => null);
        if (googleStatus?.authDetails?.connected) {
          setCalendarConnection({
            connected: true,
            provider: "google",
            email: googleStatus.email,
          });
          return;
        }

        // Check Outlook
        const outlookStatus = await checkCalendarAuthStatus(
          "outlook",
          user.email,
        ).catch(() => null);
        if (outlookStatus?.authDetails?.connected) {
          setCalendarConnection({
            connected: true,
            provider: "outlook",
            email: outlookStatus.email,
          });
        }
      } catch (e) {
      // error handled silently
    }
    };

    if (user?.id) {
      fetchAvailability();
      checkCalendarStatus();
    }
  }, [user?.id, user?.email]);

  const handleConnectCalendar = async (provider: "google" | "outlook") => {
    try {
      setIsConnectingCalendar(true);
      const { getCalendarAuthUrl } = await import("@/services/coachService");
      const { url } = await getCalendarAuthUrl(
        provider,
        user?.email || undefined,
        window.location.href,
      );
      window.location.href = url;
    } catch (error) {
      toast.error(`Failed to connect to ${provider}`);
      setIsConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!calendarConnection.provider) return;

    try {
      setIsConnectingCalendar(true);
      const { disconnectCalendar } = await import("@/services/coachService");
      await disconnectCalendar(calendarConnection.provider, user?.email || undefined);

      setCalendarConnection({ connected: false, provider: null });
      toast.success("Calendar disconnected successfully");
    } catch (error) {
      toast.error("Failed to disconnect calendar");
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  const handleDayToggle = (dayIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].enabled = !newSchedule[dayIndex].enabled;
    setSchedule(newSchedule);
  };

  const handleAddTimeSlot = (dayIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots.push({ start: "09:00", end: "17:00" });
    setSchedule(newSchedule);
  };

  const handleRemoveTimeSlot = (dayIndex: number, slotIndex: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots.splice(slotIndex, 1);
    setSchedule(newSchedule);
  };

  const handleTimeChange = (
    dayIndex: number,
    slotIndex: number,
    field: "start" | "end",
    value: string,
  ) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].timeSlots[slotIndex][field] = value;
    setSchedule(newSchedule);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { updateAvailability } = await import("@/services/coachService");

      await updateAvailability({
        timezone,
        weeklySchedule: schedule,
      });
      // Update parent-supplied data if callback provided
      if (onUpdated) onUpdated({ timezone, weeklySchedule: schedule });
      toast.success("Availability updated successfully");
    } catch (error) {
      toast.error("Failed to update availability");
    } finally {
      setIsSaving(false);
    }
  };

  if (parentLoading || isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        Loading availability...
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Weekly Schedule
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Define when you are available for sessions.
          </p>
        </div>

        {/* Timezone Selector - Improved */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
          <Globe className="w-4 h-4 text-gray-500 ml-2" />
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-[280px] h-9 border-0 bg-transparent focus:ring-0 shadow-none text-sm font-medium">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">UTC (Universal Time)</SelectItem>
              <SelectItem value="America/New_York">
                Eastern Time (ET)
              </SelectItem>
              <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
              <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
              <SelectItem value="America/Los_Angeles">
                Pacific Time (PT)
              </SelectItem>
              <SelectItem value="Europe/London">London (GMT)</SelectItem>
              <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
              <SelectItem value="Europe/Berlin">Berlin (CET)</SelectItem>
              <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
              <SelectItem value="Asia/Calcutta">India (IST)</SelectItem>
              <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
              <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
              <SelectItem value="Australia/Sydney">Sydney (AEDT)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Integration Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Calendar Integration
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Sync your availability with your external calendar to avoid double
              bookings.
            </p>
          </div>
          {calendarConnection.connected && (
            <Badge
              variant="secondary"
              className="bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              Connected to{" "}
              {calendarConnection.provider === "google"
                ? "Google Calendar"
                : "Outlook"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Google Calendar */}
          <div
            className={`border rounded-xl p-4 flex items-center justify-between transition-all ${calendarConnection.provider === "google"
              ? "border-emerald-200 bg-emerald-50/30"
              : calendarConnection.connected
                ? "border-gray-100 opacity-50 bg-gray-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
                {/* Google Icon Placeholder */}
                <span className="font-bold text-lg text-blue-500">G</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Google Calendar</p>
                <p className="text-xs text-gray-500">
                  Connect your Gmail calendar
                </p>
              </div>
            </div>
            <div>
              {calendarConnection.provider === "google" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectCalendar}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnectCalendar("google")}
                  disabled={
                    isConnectingCalendar || calendarConnection.connected
                  }
                >
                  Connect
                </Button>
              )}
            </div>
          </div>

          {/* Outlook Calendar */}
          <div
            className={`border rounded-xl p-4 flex items-center justify-between transition-all ${calendarConnection.provider === "outlook"
              ? "border-blue-200 bg-blue-50/30"
              : calendarConnection.connected
                ? "border-gray-100 opacity-50 bg-gray-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
                {/* Outlook/Microsoft Icon Placeholder */}
                <span className="font-bold text-lg text-blue-700">M</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Outlook Calendar</p>
                <p className="text-xs text-gray-500">
                  Connect your Microsoft calendar
                </p>
              </div>
            </div>
            <div>
              {calendarConnection.provider === "outlook" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectCalendar}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnectCalendar("outlook")}
                  disabled={
                    isConnectingCalendar || calendarConnection.connected
                  }
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 border rounded-2xl border-gray-200 bg-white overflow-hidden shadow-sm">
        {schedule.map((day, dayIndex) => (
          <div
            key={day.day}
            className={`flex flex-col sm:flex-row gap-4 p-4 transition-colors border-b border-gray-50 last:border-0 items-center ${day.enabled ? "bg-white" : "bg-gray-50/30"
              }`}
          >
            <div className="flex items-center justify-between w-full sm:w-48">
              <div
                className={`font-semibold text-sm ${day.enabled ? "text-gray-900" : "text-gray-400"}`}
              >
                {day.day}
              </div>
              <Switch
                checked={day.enabled}
                onCheckedChange={() => handleDayToggle(dayIndex)}
                className="scale-90"
              />
            </div>

            {day.enabled ? (
              <div className="flex-1 w-full sm:w-auto space-y-2">
                {day.timeSlots.map((slot, slotIndex) => (
                  <div
                    key={slotIndex}
                    className="flex items-center gap-3 animate-in fade-in duration-300"
                  >
                    <div className="flex items-center gap-2 bg-gray-50 rounded-md p-1 border border-gray-200 hover:border-gray-300 transition-colors">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) =>
                          handleTimeChange(
                            dayIndex,
                            slotIndex,
                            "start",
                            e.target.value,
                          )
                        }
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 p-0 w-20 text-center cursor-pointer outline-none h-8"
                      />
                      <span className="text-gray-300 text-xs px-1">|</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) =>
                          handleTimeChange(
                            dayIndex,
                            slotIndex,
                            "end",
                            e.target.value,
                          )
                        }
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 p-0 w-20 text-center cursor-pointer outline-none h-8"
                      />
                    </div>
                    {day.timeSlots.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          handleRemoveTimeSlot(dayIndex, slotIndex)
                        }
                        className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddTimeSlot(dayIndex)}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium text-xs h-8 px-2"
                >
                  <Plus className="h-3 w-3 mr-1.5" />
                  Add Interval
                </Button>
              </div>
            ) : (
              <div className="flex items-center h-10">
                <Badge
                  variant="outline"
                  className="text-gray-400 border-gray-100 font-normal bg-transparent"
                >
                  Unavailable
                </Badge>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto h-11 px-8 rounded-xl font-semibold bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
