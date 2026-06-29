"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import type { FormattedSession } from "./session-types";

interface RescheduleResult {
  start: string;
  end: string;
  date: string;
  time: string;
}

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: FormattedSession | null;
  onRescheduled: (sessionId: string, result: RescheduleResult) => void;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  session,
  onRescheduled,
}: RescheduleDialogProps) {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Reset state when dialog opens with a new session
  useEffect(() => {
    if (open) {
      setRescheduleDate(new Date());
      setSelectedTime(null);
      setAvailableSlots([]);
      setCurrentMonth(new Date());
    }
  }, [open]);

  // Fetch slots when date changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (!open || !session || !rescheduleDate || !user?.id) return;

      setIsLoadingSlots(true);
      setAvailableSlots([]);
      setSelectedTime(null);

      try {
        const { getCoachAvailableSlots } = await import("@/services/coachService");
        const dateStr = format(rescheduleDate, "yyyy-MM-dd");
        const response = await getCoachAvailableSlots(user.id, dateStr);
        setAvailableSlots(response.slots || []);
      } catch {
        toast.error(t("coaching.dashboard.failedToLoadSlots"));
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [open, session, rescheduleDate, user?.id, t]);

  const confirmReschedule = async () => {
    if (!rescheduleDate || !selectedTime || !session) {
      toast.error(t("coaching.dashboard.selectDateTime"));
      return;
    }

    try {
      const { rescheduleSession } = await import("@/services/coachService");

      const timeParts = selectedTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const meridian = timeParts[3].toLowerCase();

      if (meridian === "pm" && hours < 12) hours += 12;
      if (meridian === "am" && hours === 12) hours = 0;

      const startObj = new Date(rescheduleDate);
      startObj.setHours(hours, minutes, 0, 0);

      const originalStart = new Date(session.startTime || session.slot?.start || 0);
      const originalEnd = new Date(session.endTime || session.slot?.end || 0);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const durationMinutes = durationMs > 0 ? Math.round(durationMs / 60000) : 60;

      const endObj = new Date(startObj);
      endObj.setMinutes(startObj.getMinutes() + durationMinutes);

      const start = startObj.toISOString();
      const end = endObj.toISOString();

      await rescheduleSession(session.id, { start, end });

      onRescheduled(session.id, {
        start,
        end,
        date: format(startObj, "EEE, MMM d, yyyy"),
        time: `${format(startObj, "h:mm a")} - ${format(endObj, "h:mm a")}`,
      });

      toast.success(t("coaching.dashboard.rescheduleSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("coaching.dashboard.rescheduleFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] w-full p-0 overflow-hidden gap-0">
        <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh] overflow-y-auto md:overflow-hidden">
          {/* Column 1: Calendar */}
          <div className="flex-1 p-6 sm:p-8 border-r border-[var(--border)] flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground mb-1">
                {t("coach:sessionsPage.reschedule.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("coach:sessionsPage.reschedule.selectDateFor", { name: session?.studentName })}
              </p>
            </div>

            <div className="flex items-center justify-between mb-4 px-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-gray-100"
                onClick={() => {
                  const newMonth = new Date(currentMonth);
                  newMonth.setMonth(newMonth.getMonth() - 1);
                  setCurrentMonth(newMonth);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-base font-semibold text-foreground capitalize">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-gray-100"
                onClick={() => {
                  const newMonth = new Date(currentMonth);
                  newMonth.setMonth(newMonth.getMonth() + 1);
                  setCurrentMonth(newMonth);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={rescheduleDate}
                onSelect={setRescheduleDate}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                className="p-0"
                showOutsideDays={false}
                classNames={{
                  months: "flex flex-col",
                  month: "space-y-4",
                  caption: "hidden",
                  nav: "hidden",
                  month_grid: "w-full border-collapse",
                  weekdays: "flex justify-between mb-2",
                  weekday:
                    "text-muted-foreground font-medium text-xs uppercase w-9 text-center",
                  week: "flex justify-between w-full mb-2",
                  day: "h-9 w-9 text-center text-sm relative flex items-center justify-center p-0 hover:bg-transparent focus-within:relative focus-within:z-20",
                  day_button: cn(
                    "h-9 w-9 p-0 font-normal rounded-full transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none",
                    "aria-selected:opacity-100"
                  ),
                  selected:
                    "bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white shadow-md font-semibold",
                  today: "bg-gray-100 text-foreground font-semibold",
                  outside: "text-gray-300 opacity-50 pointer-events-none",
                  disabled: "text-gray-300 opacity-50 cursor-not-allowed",
                  hidden: "invisible",
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date < today;
                }}
              />
            </div>
          </div>

          {/* Column 2: Time Slots */}
          <div className="w-full md:w-[320px] flex flex-col border-t md:border-t-0">
            <div className="p-6 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                  <AvatarImage
                    src={session?.studentImage || session?.studentAvatar}
                  />
                  <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-semibold">
                    {session?.studentName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm truncate">
                    {session?.studentName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session?.topic?.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col min-h-[300px]">
              <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                {t("coach:sessionsPage.reschedule.availableTimes")}
                {rescheduleDate && (
                  <span className="text-muted-foreground font-normal ml-auto text-xs">
                    {format(rescheduleDate, "MMM d")}
                  </span>
                )}
              </h4>

              <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                {isLoadingSlots ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-xs">{t("coach:sessionsPage.reschedule.checking")}</p>
                  </div>
                ) : !rescheduleDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                    <CalendarDays className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm">{t("coach:sessionsPage.reschedule.selectDate")}</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <Clock className="h-5 w-5 opacity-30" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      {t("coach:sessionsPage.reschedule.noSlots")}
                    </p>
                    <p className="text-xs">{t("coach:sessionsPage.reschedule.tryAnother")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {availableSlots.map((time) => (
                      <button
                        key={time}
                        onClick={() => setSelectedTime(time)}
                        className={cn(
                          "px-3 py-2 text-sm font-medium rounded-xl border transition-all text-center",
                          selectedTime === time
                            ? "bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.02]"
                            : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                        )}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-[var(--border)]">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 h-11 rounded-xl font-semibold border-gray-200 hover:bg-gray-50"
                >
                  {t("coach:sessionsPage.reschedule.cancel")}
                </Button>
                <Button
                  onClick={confirmReschedule}
                  disabled={!selectedTime || isLoadingSlots}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-xl font-semibold disabled:opacity-50"
                >
                  {t("coach:sessionsPage.reschedule.confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
