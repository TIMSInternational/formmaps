"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";
import { CalendarIntegrationSection } from "./CalendarIntegrationSection";
import { WeeklyScheduleGrid } from "./WeeklyScheduleGrid";

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
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((day) => ({
  day,
  enabled: ["Saturday", "Sunday"].includes(day) ? false : true,
  timeSlots: [{ start: "09:00", end: "17:00" }],
}));

interface AvailabilitySettingsTabProps {
  availability?: Availability | null;
  isLoading?: boolean;
  onUpdated?: (newData: Partial<Availability>) => void;
}

type Availability = {
  timezone: string;
  weeklySchedule: DaySchedule[];
};

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
          const data = parentAvailability;
          if (data) {
            if (data.timezone) setTimezone(data.timezone);
            if (data.weeklySchedule && data.weeklySchedule.length > 0) {
              const mergedSchedule = DEFAULT_SCHEDULE.map((defaultDay) => {
                const found = data.weeklySchedule.find(
                  (d: DaySchedule) => d.day === defaultDay.day,
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
      await updateAvailability({ timezone, weeklySchedule: schedule });
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
          <h2 className="text-xl font-semibold text-gray-900">Weekly Schedule</h2>
          <p className="text-gray-500 text-sm mt-1">Define when you are available for sessions.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
          <Globe className="w-4 h-4 text-gray-500 ml-2" />
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-[280px] h-9 border-0 bg-transparent focus:ring-0 shadow-none text-sm font-medium">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">UTC (Universal Time)</SelectItem>
              <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
              <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
              <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
              <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
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

      <CalendarIntegrationSection
        calendarConnection={calendarConnection}
        isConnectingCalendar={isConnectingCalendar}
        onConnect={handleConnectCalendar}
        onDisconnect={handleDisconnectCalendar}
      />

      <WeeklyScheduleGrid
        schedule={schedule}
        onDayToggle={handleDayToggle}
        onAddTimeSlot={handleAddTimeSlot}
        onRemoveTimeSlot={handleRemoveTimeSlot}
        onTimeChange={handleTimeChange}
      />

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
