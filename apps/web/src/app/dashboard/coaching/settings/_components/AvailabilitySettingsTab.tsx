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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      try {
        const { getCalendarStatus } = await import("@/services/calendarService");
        const googleStatus = await getCalendarStatus("google");
        if (googleStatus.connected) {
          setCalendarConnection({ connected: true, provider: "google", email: googleStatus.email || undefined });
          return;
        }
        const outlookStatus = await getCalendarStatus("outlook");
        if (outlookStatus.connected) {
          setCalendarConnection({ connected: true, provider: "outlook", email: outlookStatus.email || undefined });
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
      const { getCalendarAuthUrl } = await import("@/services/calendarService");
      const res = await getCalendarAuthUrl(provider);
      if (!res.configured || !res.url) {
        toast.error(t("coach:settings.calendar.notConfigured"));
        setIsConnectingCalendar(false);
        return;
      }
      window.location.href = res.url;
    } catch (error) {
      toast.error(t("calendarIntegration.connectProviderFailed", { provider }));
      setIsConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!calendarConnection.provider) return;
    try {
      setIsConnectingCalendar(true);
      const { disconnectCalendar } = await import("@/services/calendarService");
      await disconnectCalendar(calendarConnection.provider);
      setCalendarConnection({ connected: false, provider: null });
      toast.success(t("coach:settings.calendar.disconnectSuccess"));
    } catch (error) {
      toast.error(t("coach:settings.calendar.disconnectError"));
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
      toast.success(t("coach:settings.availability.success"));
    } catch (error) {
      toast.error(t("coach:settings.availability.error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (parentLoading || isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        {t("coach:settings.availability.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t("coach:settings.availability.title")}</h2>
          <p className="text-gray-500 text-sm mt-1">{t("coach:settings.availability.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
          <Globe className="w-4 h-4 text-gray-500 ml-2" />
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-[280px] h-9 border-0 bg-transparent focus:ring-0 shadow-none text-sm font-medium">
              <SelectValue placeholder={t("coach:settings.availability.timezone")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">{t("studentUi.coaching.timezones.utc")}</SelectItem>
              <SelectItem value="America/New_York">{t("studentUi.coaching.timezones.eastern")}</SelectItem>
              <SelectItem value="America/Chicago">{t("studentUi.coaching.timezones.central")}</SelectItem>
              <SelectItem value="America/Denver">{t("studentUi.coaching.timezones.mountain")}</SelectItem>
              <SelectItem value="America/Los_Angeles">{t("studentUi.coaching.timezones.pacific")}</SelectItem>
              <SelectItem value="Europe/London">{t("studentUi.coaching.timezones.london")}</SelectItem>
              <SelectItem value="Europe/Paris">{t("studentUi.coaching.timezones.paris")}</SelectItem>
              <SelectItem value="Europe/Berlin">{t("studentUi.coaching.timezones.berlin")}</SelectItem>
              <SelectItem value="Asia/Dubai">{t("studentUi.coaching.timezones.dubai")}</SelectItem>
              <SelectItem value="Asia/Calcutta">{t("studentUi.coaching.timezones.india")}</SelectItem>
              <SelectItem value="Asia/Singapore">{t("studentUi.coaching.timezones.singapore")}</SelectItem>
              <SelectItem value="Asia/Tokyo">{t("studentUi.coaching.timezones.tokyo")}</SelectItem>
              <SelectItem value="Australia/Sydney">{t("studentUi.coaching.timezones.sydney")}</SelectItem>
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
          {isSaving ? t("coach:settings.availability.saving") : t("coach:settings.availability.save")}
        </Button>
      </div>
    </div>
  );
}
